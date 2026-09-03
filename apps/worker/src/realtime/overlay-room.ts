import { DurableObject } from 'cloudflare:workers';
import {
  aggregateCounterDeltas,
  applyDeltas,
  complete,
  enqueue,
  expire,
  planActions,
  queueDepth,
  renderAlertTemplate,
  RESERVED_COUNTERS,
  systemClock,
  EMPTY_QUEUE,
  type AlertQueueState,
  type CounterTotals,
  type OverlayLayout,
  type PendingAlert,
  type QueueTransition,
  type Rule,
  type StreamEvent,
} from '@monaworld/domain';
import { clientMessageSchema, type ConnectorStatus, type ServerMessage } from '@monaworld/contracts';
import type { AwardedTotals, DispatchOutcome } from '@monaworld/application';
import type { WorkerEnv } from '../env.js';

/**
 * La sala de un canal: mantiene los WebSocket de los overlays y del panel,
 * difunde los eventos a todos y serializa las alertas.
 *
 * Nota sobre el nombre: la clase se sigue llamando `OverlayRoom` porque ese es
 * el `class_name` que la migración `v1` ya aplicó en el Worker desplegado.
 * Renombrarla exigiría una migración `renamed_classes` y un despliegue con
 * riesgo, a cambio de nada funcional. El nombre se queda; la organización no.
 *
 * Toda la política vive en `@monaworld/domain` como funciones puras. Este
 * fichero solo hace tres cosas: persistir estado, hablar por WebSocket y
 * programar alarmas. No decide nada por su cuenta.
 */
export class OverlayRoom extends DurableObject<WorkerEnv> {
  // ------------------------------------------------------------------ rutas

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/ws')) return this.acceptClient(request, url);

    if (request.method === 'POST') {
      if (url.pathname.endsWith('/dispatch')) {
        const body = (await request.json()) as { event: StreamEvent; rules: Rule[] };
        return Response.json(await this.dispatch(body.event, body.rules ?? []));
      }
      if (url.pathname.endsWith('/connectors')) {
        const body = (await request.json()) as { status: Record<string, ConnectorStatus> };
        this.broadcast({ t: 'connectors', status: body.status });
        return Response.json({ ok: true });
      }
      if (url.pathname.endsWith('/layout')) {
        const body = (await request.json()) as { layout: OverlayLayout };
        this.broadcast({
          t: 'layout',
          widgets: body.layout.widgets as never,
          version: body.layout.version,
        });
        return Response.json({ ok: true });
      }
      if (url.pathname.endsWith('/reset')) {
        await this.ctx.storage.deleteAll();
        await this.ctx.storage.deleteAlarm();
        this.broadcast({ t: 'clear' });
        return Response.json({ ok: true });
      }
    }

    if (url.pathname.endsWith('/state')) {
      return Response.json(await this.snapshot());
    }

    return new Response('No encontrado en la sala', { status: 404 });
  }

  private async acceptClient(request: Request, url: URL): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Se esperaba una conexión WebSocket', { status: 426 });
    }

    const role = url.searchParams.get('role') === 'panel' ? 'panel' : 'overlay';
    const { 0: client, 1: server } = new WebSocketPair();

    // Un overlay de chat quiere el evento en crudo; el de alertas no. La
    // etiqueta se toma de la URL y no de un mensaje posterior porque las
    // etiquetas son lo único que sobrevive a la hibernación: un registro en
    // memoria se perdería en cuanto el objeto se descargue a mitad de directo.
    const tags = [role];
    if (role === 'overlay' && url.searchParams.get('widget') === 'chat') tags.push('chat');

    // Hibernación: sin esto el objeto se queda cargado en memoria mientras haya
    // una fuente de OBS abierta, y se paga duración por cada hora de directo
    // aunque no ocurra nada.
    this.ctx.acceptWebSocket(server, tags);
    server.send(JSON.stringify(await this.snapshot()));

    return new Response(null, { status: 101, webSocket: client });
  }

  // ----------------------------------------------------------------- ingesta

  /**
   * Aplica las reglas a un evento y ejecuta el resultado.
   *
   * El plan se calcula aquí porque el registro de cooldowns vive aquí: la sala
   * es el único punto que serializa por canal, así que es donde «esta regla ya
   * disparó hace dos segundos» tiene una respuesta única.
   */
  async dispatch(event: StreamEvent, rules: readonly Rule[]): Promise<DispatchOutcome> {
    const cooldowns = new Map<string, number>(
      (await this.ctx.storage.get<[string, number][]>(KEYS.cooldowns)) ?? [],
    );

    const plan = planActions(rules, event, { cooldowns, clock: systemClock });
    await this.ctx.storage.put(KEYS.cooldowns, [...cooldowns.entries()]);

    // El evento en crudo va al panel y a los overlays de chat, nunca al de
    // alertas: en un chat activo serían cientos de mensajes por minuto de
    // tráfico inútil hacia una fuente que solo pinta alertas.
    this.broadcast({ t: 'event', event }, 'panel');
    this.broadcast({ t: 'event', event }, 'chat');

    const deltas = aggregateCounterDeltas(plan, event);
    const awarded = summariseAwards(deltas);

    if (deltas.size > 0) {
      const totals = applyDeltas(await this.counters(), deltas);
      await this.ctx.storage.put(KEYS.counters, totals);
    }

    for (const { action } of plan.queued) {
      if (action.kind === 'alert') {
        await this.push({
          id: crypto.randomUUID(),
          widget: action.widget,
          text: renderAlertTemplate(action.template, event),
          durationMs: action.durationMs,
          soundUrl: action.soundUrl,
          imageUrl: action.imageUrl,
          platform: event.platform,
          avatarUrl: event.actor.avatarUrl,
        });
      } else if (action.kind === 'sound') {
        await this.push({
          id: crypto.randomUUID(),
          widget: 'sound',
          text: '',
          durationMs: 1200,
          soundUrl: action.soundUrl,
          platform: event.platform,
        });
      }
    }

    this.broadcast(await this.snapshot());

    return {
      awarded,
      queuedAlerts: plan.queued.length,
      firedRuleIds: plan.firedRuleIds,
      agentActions: plan.agent,
    };
  }

  // ------------------------------------------------------------- cola serial

  private async push(alert: PendingAlert): Promise<void> {
    const state = await this.queue();
    await this.applyTransition(enqueue(state, alert, Date.now()));
  }

  /** Aplica una transición de la máquina de estados pura del dominio. */
  private async applyTransition(transition: QueueTransition): Promise<void> {
    await this.ctx.storage.put(KEYS.queue, transition.state);

    if (transition.broadcast) {
      this.broadcast({ t: 'alert', ...transition.broadcast });
    }

    if (transition.alarmAt === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(transition.alarmAt);
  }

  /** Red de seguridad: si OBS está cerrado y nadie confirma, la cola avanza. */
  async alarm(): Promise<void> {
    await this.applyTransition(expire(await this.queue(), Date.now()));
    this.broadcast(await this.snapshot());
  }

  // -------------------------------------------------------------- websockets

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;

    const parsed = clientMessageSchema.safeParse(safeJson(raw));
    if (!parsed.success) return;
    const message = parsed.data;

    switch (message.t) {
      case 'ping':
        ws.send(JSON.stringify({ t: 'pong' } satisfies ServerMessage));
        return;

      case 'alertDone':
        await this.applyTransition(complete(await this.queue(), message.id, Date.now()));
        return;

      case 'hello':
        ws.send(JSON.stringify(await this.snapshot()));
        return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // 1006 es un cierre anómalo y no se puede reenviar tal cual.
    ws.close(code === 1006 ? 1000 : code, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'error interno');
    } catch {
      // el socket ya estaba cerrado
    }
  }

  /**
   * Difunde a todos los clientes conectados.
   *
   * Esto es lo que el prototipo no hacía: respondía solo a quien había escrito,
   * así que las fuentes de OBS se quedaban esperando para siempre.
   */
  private broadcast(message: ServerMessage, onlyTag?: 'overlay' | 'panel' | 'chat'): void {
    const payload = JSON.stringify(message);
    const sockets = onlyTag ? this.ctx.getWebSockets(onlyTag) : this.ctx.getWebSockets();

    for (const socket of sockets) {
      try {
        socket.send(payload);
      } catch {
        // Socket muerto: se limpia solo en webSocketClose.
      }
    }
  }

  // ------------------------------------------------------------------ estado

  private async counters(): Promise<CounterTotals> {
    return (await this.ctx.storage.get<CounterTotals>(KEYS.counters)) ?? {};
  }

  private async queue(): Promise<AlertQueueState> {
    return (await this.ctx.storage.get<AlertQueueState>(KEYS.queue)) ?? EMPTY_QUEUE;
  }

  private async snapshot(): Promise<ServerMessage> {
    const counters = await this.counters();
    return {
      t: 'state',
      counters: { ...counters },
      timerSeconds: counters[RESERVED_COUNTERS.timer] ?? 0,
      queueDepth: queueDepth(await this.queue()),
    };
  }
}

const KEYS = {
  counters: 'counters',
  queue: 'queue',
  cooldowns: 'cooldowns',
} as const;

function summariseAwards(deltas: ReadonlyMap<string, number>): AwardedTotals {
  return {
    monacoins: deltas.get(RESERVED_COUNTERS.coins) ?? 0,
    monopoints: deltas.get(RESERVED_COUNTERS.points) ?? 0,
    timerSeconds: deltas.get(RESERVED_COUNTERS.timer) ?? 0,
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
