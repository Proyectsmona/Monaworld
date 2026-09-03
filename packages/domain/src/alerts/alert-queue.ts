import type { Platform } from '../events/stream-event.js';

/**
 * Política de la cola de alertas, como máquina de estados pura.
 *
 * Es lo que separa una alerta usable de una ilegible: cinco gifts seguidos en
 * TikTok no pueden pintar cinco animaciones superpuestas ni cinco sonidos a la
 * vez. Se encolan y salen una tras otra.
 *
 * El Durable Object solo guarda este estado y ejecuta lo que la máquina decide;
 * no toma ninguna decisión por su cuenta. Así la política se prueba en
 * milisegundos sin levantar infraestructura.
 */

export interface PendingAlert {
  readonly id: string;
  readonly widget: string;
  readonly text: string;
  readonly durationMs: number;
  readonly soundUrl?: string;
  readonly imageUrl?: string;
  readonly platform: Platform;
  readonly avatarUrl?: string;
}

export interface AlertQueueState {
  readonly playing: PendingAlert | null;
  /** Instante a partir del cual se fuerza el avance si nadie ha confirmado. */
  readonly playingUntil: number;
  readonly pending: readonly PendingAlert[];
}

export const EMPTY_QUEUE: AlertQueueState = {
  playing: null,
  playingUntil: 0,
  pending: [],
};

/**
 * Resultado de una transición. `broadcast` es la alerta que hay que enviar a
 * los overlays ahora mismo; `alarmAt` cuándo volver a mirar la cola.
 */
export interface QueueTransition {
  readonly state: AlertQueueState;
  readonly broadcast: PendingAlert | null;
  readonly alarmAt: number | null;
}

/**
 * Margen sobre la duración anunciada antes de forzar el avance. Cubre el caso
 * de que OBS tenga la fuente cerrada y nadie confirme el fin de la alerta.
 */
export const ALERT_GRACE_MS = 1500;

/** Tope de cola: en una avalancha de gifts, encolar sin límite es peor que perder. */
export const MAX_PENDING = 40;

export function enqueue(
  state: AlertQueueState,
  alert: PendingAlert,
  now: number,
): QueueTransition {
  if (state.pending.length >= MAX_PENDING) {
    return { state, broadcast: null, alarmAt: alarmFor(state) };
  }

  const withAlert: AlertQueueState = {
    ...state,
    pending: [...state.pending, alert],
  };

  // Si no hay nada en pantalla, arranca de inmediato.
  return state.playing ? { state: withAlert, broadcast: null, alarmAt: alarmFor(withAlert) } : advance(withAlert, now);
}

/** El overlay confirma que terminó de pintar: sale la siguiente. */
export function complete(
  state: AlertQueueState,
  alertId: string,
  now: number,
): QueueTransition {
  if (!state.playing || state.playing.id !== alertId) {
    return { state, broadcast: null, alarmAt: alarmFor(state) };
  }
  return advance(state, now);
}

/** Venció el plazo sin confirmación: la cola avanza igualmente. */
export function expire(state: AlertQueueState, now: number): QueueTransition {
  if (state.playing && now < state.playingUntil) {
    return { state, broadcast: null, alarmAt: state.playingUntil };
  }
  return advance(state, now);
}

export function clear(): QueueTransition {
  return { state: EMPTY_QUEUE, broadcast: null, alarmAt: null };
}

function advance(state: AlertQueueState, now: number): QueueTransition {
  const [next, ...rest] = state.pending;

  if (!next) {
    return {
      state: { playing: null, playingUntil: 0, pending: [] },
      broadcast: null,
      alarmAt: null,
    };
  }

  const playingUntil = now + next.durationMs + ALERT_GRACE_MS;
  return {
    state: { playing: next, playingUntil, pending: rest },
    broadcast: next,
    alarmAt: playingUntil,
  };
}

const alarmFor = (state: AlertQueueState): number | null =>
  state.playing ? state.playingUntil : null;

/** Cuántas alertas hay esperando, para mostrarlo en el panel. */
export const queueDepth = (state: AlertQueueState): number =>
  state.pending.length + (state.playing ? 1 : 0);
