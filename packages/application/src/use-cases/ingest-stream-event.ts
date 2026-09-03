import {
  domainError,
  err,
  isMeaningful,
  ok,
  type Clock,
  type EventSource,
  type IdGenerator,
  type IncomingEvent,
  type Result,
  type StreamEvent,
} from '@monaworld/domain';
import {
  NOTHING_AWARDED,
  type AgentGateway,
  type AwardedTotals,
  type EventRepository,
  type RealtimeRoom,
  type RuleRepository,
  type ViewerRepository,
} from '../ports/repositories.js';

/**
 * Camino único de entrada para TODOS los eventos, vengan de un webhook, del
 * agente local o del simulador del panel.
 *
 * Que sea uno solo es deliberado: la deduplicación, las reglas, los contadores
 * y la difusión ocurren exactamente igual sea cual sea el origen. Es lo que
 * hace que el simulador sea una prueba de verdad y no una maqueta aparte.
 *
 * El orden de los pasos es la parte importante y no es negociable:
 *
 *   1. Validar         — descartar lo que no aporta nada.
 *   2. Deduplicar      — la base decide, y corta ANTES de tocar nada.
 *   3. Aplicar reglas  — contadores y alertas, dentro de la sala.
 *   4. Anotar premios  — cerrar la fila del historial.
 *
 * Invertir 2 y 3 haría que un reintento de webhook disparase la alerta otra vez.
 */
export interface IngestDependencies {
  readonly events: EventRepository;
  readonly rules: RuleRepository;
  readonly viewers: ViewerRepository;
  readonly room: RealtimeRoom;
  readonly agent?: AgentGateway;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface IngestOutcome {
  readonly event: StreamEvent;
  readonly firedRuleIds: readonly string[];
  readonly awarded: AwardedTotals;
  readonly queuedAlerts: number;
}

export async function ingestStreamEvent(
  deps: IngestDependencies,
  incoming: IncomingEvent,
  source: EventSource,
): Promise<Result<IngestOutcome>> {
  if (!isMeaningful(incoming)) {
    return err(domainError('invalid_event', 'El evento no aporta información'));
  }

  const event: StreamEvent = { ...incoming, id: deps.ids.next(), source };

  // Paso 2: la puerta. Si la clave ya existía, este evento ya se procesó.
  const saved = await deps.events.save(event, NOTHING_AWARDED);
  if (!saved.stored) {
    return err(domainError('duplicate_event', 'Evento ya procesado', event.dedupeKey));
  }

  if (!event.simulated && event.actor.platformUserId) {
    await deps.viewers.touch(
      event.platform,
      event.actor.platformUserId,
      event.actor.displayName,
      event.occurredAt,
    );
  }

  // Paso 3: la sala aplica las reglas porque es donde viven los cooldowns.
  const rules = await deps.rules.listAll();
  const outcome = await deps.room.dispatch(event, rules);

  // Paso 4: cerrar la fila del historial con lo que otorgaron las reglas.
  if (saved.rowId !== undefined && hasAwards(outcome.awarded)) {
    await deps.events.recordAwards(saved.rowId, outcome.awarded);
  }

  // Las acciones de OBS solo puede ejecutarlas quien está en la misma máquina.
  if (outcome.agentActions.length > 0 && deps.agent) {
    await deps.agent.send({
      queued: [],
      immediate: [],
      agent: outcome.agentActions,
      firedRuleIds: outcome.firedRuleIds,
    });
  }

  return ok({
    event,
    firedRuleIds: outcome.firedRuleIds,
    awarded: outcome.awarded,
    queuedAlerts: outcome.queuedAlerts,
  });
}

const hasAwards = (a: AwardedTotals): boolean =>
  a.monacoins !== 0 || a.monopoints !== 0 || a.timerSeconds !== 0;
