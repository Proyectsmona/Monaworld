import type { StreamEvent } from '../events/stream-event.js';
import type { Clock } from '../shared/clock.js';
import { isAgentAction, isQueuedAction, type Action, type CounterAction, type Rule } from './rule.js';
import { matchesRule } from './rule-matcher.js';

/**
 * Convierte un evento en un plan de acciones.
 *
 * El plan sale ya repartido en tres carriles porque cada uno tiene un destino
 * distinto: la cola serial del overlay, el estado local, y el agente. Quien
 * ejecuta el plan no tiene que volver a decidir nada.
 */

export interface PlannedAction {
  readonly ruleId: string;
  readonly action: Action;
}

export interface ActionPlan {
  /** Compiten por la pantalla: se muestran de una en una. */
  readonly queued: readonly PlannedAction[];
  /** Cambian estado sin pintar nada: se aplican al instante. */
  readonly immediate: readonly PlannedAction[];
  /** Solo puede ejecutarlas el agente local (OBS). */
  readonly agent: readonly PlannedAction[];
  readonly firedRuleIds: readonly string[];
}

export const EMPTY_PLAN: ActionPlan = {
  queued: [],
  immediate: [],
  agent: [],
  firedRuleIds: [],
};

/**
 * Registro de cuándo disparó cada regla por última vez. Se pasa desde fuera
 * porque su persistencia es responsabilidad del adaptador, no del dominio.
 */
export type CooldownRegistry = Map<string, number>;

export interface PlanOptions {
  readonly cooldowns?: CooldownRegistry;
  readonly clock?: Clock;
}

export function planActions(
  rules: readonly Rule[],
  event: StreamEvent,
  options: PlanOptions = {},
): ActionPlan {
  const now = options.clock?.now() ?? Date.now();
  const cooldowns = options.cooldowns;

  const queued: PlannedAction[] = [];
  const immediate: PlannedAction[] = [];
  const agent: PlannedAction[] = [];
  const firedRuleIds: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!matchesRule(rule, event)) continue;
    if (isCoolingDown(rule, cooldowns, now)) continue;

    firedRuleIds.push(rule.id);
    cooldowns?.set(rule.id, now);

    for (const action of rule.actions) {
      const planned: PlannedAction = { ruleId: rule.id, action };
      if (isAgentAction(action)) agent.push(planned);
      else if (isQueuedAction(action)) queued.push(planned);
      else immediate.push(planned);
    }
  }

  return { queued, immediate, agent, firedRuleIds };
}

function isCoolingDown(rule: Rule, cooldowns: CooldownRegistry | undefined, now: number): boolean {
  if (rule.cooldownMs <= 0 || !cooldowns) return false;
  const last = cooldowns.get(rule.id);
  return last !== undefined && now - last < rule.cooldownMs;
}

/** Cuánto suma un contador para un evento concreto. */
export function counterDelta(action: CounterAction, event: StreamEvent): number {
  return action.delta + action.perUnit * event.value.rawAmount;
}

/** Agrega todos los deltas de un plan, para aplicarlos en una sola escritura. */
export function aggregateCounterDeltas(
  plan: ActionPlan,
  event: StreamEvent,
): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const { action } of plan.immediate) {
    if (action.kind !== 'counter') continue;
    totals.set(action.key, (totals.get(action.key) ?? 0) + counterDelta(action, event));
  }
  return totals;
}
