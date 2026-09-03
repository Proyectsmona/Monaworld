import type {
  AccountRepository,
  DispatchOutcome,
  RealtimeRoom,
} from '@monaworld/application';
import type { ConnectorStatus } from '@monaworld/contracts';
import type { CounterTotals, OverlayLayout, Rule, StreamEvent } from '@monaworld/domain';
import { CHANNEL_NAME, type WorkerEnv } from '../env.js';

/**
 * Adaptador del puerto `RealtimeRoom` sobre el Durable Object.
 *
 * Traduce llamadas de dominio a peticiones internas. La URL es ficticia: el
 * `fetch` de un Durable Object no sale a la red, solo necesita una ruta.
 */
export class DurableRealtimeRoom implements RealtimeRoom {
  constructor(private readonly env: WorkerEnv) {}

  private get stub() {
    const namespace = this.env.OVERLAY_ROOM;
    return namespace.get(namespace.idFromName(CHANNEL_NAME));
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.stub
      .fetch(`https://room/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      .then((r) => r.json() as Promise<T>);
  }

  dispatch(event: StreamEvent, rules: readonly Rule[]): Promise<DispatchOutcome> {
    return this.post<DispatchOutcome>('dispatch', { event, rules });
  }

  async readCounters(): Promise<CounterTotals> {
    const response = await this.stub.fetch('https://room/state');
    const state = (await response.json()) as { counters?: CounterTotals };
    return state.counters ?? {};
  }

  async broadcastConnectorStatus(status: Record<string, ConnectorStatus>): Promise<void> {
    await this.post('connectors', { status });
  }

  async broadcastLayout(layout: OverlayLayout): Promise<void> {
    await this.post('layout', { layout });
  }

  async reset(): Promise<void> {
    await this.post('reset', {});
  }

  /** Reenvía a los clientes el estado de los cuatro conectores. */
  static async publishStatuses(env: WorkerEnv, accounts: AccountRepository): Promise<void> {
    const summaries = await accounts.listSummaries();
    const status = Object.fromEntries(summaries.map((s) => [s.platform, s.status]));
    await new DurableRealtimeRoom(env).broadcastConnectorStatus(status);
  }
}
