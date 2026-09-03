import {
  makeDedupeKey,
  type Clock,
  type EventType,
  type IdGenerator,
  type IncomingEvent,
  type Result,
  type ValueUnit,
} from '@monaworld/domain';
import type { SimulateRequest } from '@monaworld/contracts';
import { ingestStreamEvent, type IngestDependencies, type IngestOutcome } from './ingest-stream-event.js';

/**
 * Simulador del panel. Construye un evento con la misma forma que uno real y
 * lo mete por el mismo tubo, así que ejercita reglas, contadores, cola y
 * overlay de verdad. Queda marcado como simulado en el historial.
 */

const UNIT_BY_TYPE: Partial<Record<EventType, ValueUnit>> = {
  cheer: 'bits',
  gift: 'gift',
  gift_sub: 'gift',
  donation: 'currency',
  superchat: 'currency',
  subscribe: 'tier',
  resub: 'tier',
  raid: 'viewers',
};

const MONETARY: ReadonlySet<EventType> = new Set<EventType>(['donation', 'superchat']);

export function buildSimulatedEvent(
  request: SimulateRequest,
  clock: Clock,
  ids: IdGenerator,
): IncomingEvent {
  const nonce = `${clock.now()}-${ids.next().slice(0, 8)}`;
  const amount = request.amount ?? 0;

  return {
    platform: request.platform,
    type: request.type,
    actor: {
      platformUserId: `sim-${nonce}`,
      displayName: request.displayName?.trim() || 'usuario_demo',
      isMod: false,
      isSubscriber: false,
    },
    value: {
      rawAmount: amount,
      rawUnit: UNIT_BY_TYPE[request.type] ?? 'none',
      giftName: request.giftName,
      currency: MONETARY.has(request.type) ? 'EUR' : undefined,
    },
    message: request.message,
    occurredAt: new Date(clock.now()).toISOString(),
    dedupeKey: makeDedupeKey(request.platform, `sim-${nonce}`),
    simulated: true,
  };
}

export function simulateEvent(
  deps: IngestDependencies,
  request: SimulateRequest,
): Promise<Result<IngestOutcome>> {
  const event = buildSimulatedEvent(request, deps.clock, deps.ids);
  return ingestStreamEvent(deps, event, 'panel');
}
