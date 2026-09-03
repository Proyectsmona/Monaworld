import type { EventType, Platform } from '../events/stream-event.js';

/**
 * Una regla es una condición más una lista de acciones. Es el vocabulario con
 * el que el streamer describe qué debe ocurrir cuando pasa algo en el directo.
 */

/** Todos los campos presentes deben cumplirse (AND). Un campo ausente no filtra. */
export interface RuleMatch {
  readonly platforms?: readonly Platform[];
  readonly types?: readonly EventType[];
  /** Mínimo en unidades nativas: 5 rosas, 500 bits, 2.00 EUR… */
  readonly minAmount?: number;
  readonly giftName?: string;
  readonly messageContains?: string;
  readonly actorIsMod?: boolean;
  readonly actorIsSubscriber?: boolean;
}

export interface AlertAction {
  readonly kind: 'alert';
  readonly widget: string;
  /** Admite {user}, {amount}, {gift}, {message}, {platform}, {tier}, {currency}. */
  readonly template: string;
  readonly durationMs: number;
  readonly soundUrl?: string;
  readonly imageUrl?: string;
}

export interface SoundAction {
  readonly kind: 'sound';
  readonly soundUrl: string;
  readonly volume: number;
}

export interface CounterAction {
  readonly kind: 'counter';
  readonly key: string;
  /** Suma fija más una parte proporcional al valor nativo del evento. */
  readonly delta: number;
  readonly perUnit: number;
}

export interface ObsAction {
  readonly kind: 'obs';
  readonly op: 'setScene' | 'toggleSource' | 'setSourceVisible';
  readonly target: string;
  readonly durationMs: number;
}

export type Action = AlertAction | SoundAction | CounterAction | ObsAction;
export type ActionKind = Action['kind'];

export interface Rule {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly match: RuleMatch;
  readonly actions: readonly Action[];
  /** Tiempo mínimo entre dos disparos de esta misma regla. */
  readonly cooldownMs: number;
}

/**
 * Acciones que compiten por la pantalla y deben mostrarse de una en una.
 * Las demás cambian estado y se aplican al instante.
 */
const QUEUED_KINDS: ReadonlySet<ActionKind> = new Set<ActionKind>(['alert', 'sound']);

export const isQueuedAction = (action: Action): boolean => QUEUED_KINDS.has(action.kind);

/** Las acciones de OBS solo puede ejecutarlas el agente: está en la misma máquina. */
export const isAgentAction = (action: Action): action is ObsAction => action.kind === 'obs';
