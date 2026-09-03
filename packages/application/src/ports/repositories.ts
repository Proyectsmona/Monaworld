import type {
  ActionPlan,
  CounterTotals,
  OverlayLayout,
  Platform,
  Rule,
  StreamEvent,
} from '@monaworld/domain';
import type { AccountSummary, ConnectorStatus, EventRow } from '@monaworld/contracts';

/**
 * Puertos: lo que la aplicación necesita del mundo exterior, expresado desde
 * dentro hacia fuera.
 *
 * Cada uno existe porque tiene al menos dos implementaciones reales —la de
 * producción y una en memoria para los tests—, no por ceremonia. Un puerto con
 * una sola implementación y sin necesidad de sustitución sería solo ruido.
 */

export interface SaveEventOutcome {
  /** `false` cuando la clave de deduplicación ya existía. */
  readonly stored: boolean;
  readonly rowId?: number;
}

export interface EventRepository {
  /**
   * Guarda de forma idempotente y actúa como puerta de entrada.
   *
   * La unicidad la garantiza el índice sobre `dedupe_key`, no una comprobación
   * previa: entre un SELECT y un INSERT cabe perfectamente el reintento de un
   * webhook. Por eso esta llamada va ANTES de aplicar las reglas — si el evento
   * ya se procesó, no debe volver a disparar alertas.
   */
  save(event: StreamEvent, awarded: AwardedTotals): Promise<SaveEventOutcome>;

  /**
   * Segunda fase: anota lo que otorgaron las reglas.
   *
   * Va aparte porque los premios solo se conocen después de aplicar las reglas,
   * y las reglas no pueden aplicarse antes de que la deduplicación haya dejado
   * pasar el evento. Es un UPDATE pequeño a cambio de que un duplicado nunca
   * llegue a mover un contador.
   */
  recordAwards(rowId: number, awarded: AwardedTotals): Promise<void>;

  listRecent(limit: number): Promise<EventRow[]>;
  countSince(isoTimestamp: string): Promise<number>;
}

/** Lo que las reglas otorgaron, guardado junto al evento para el historial. */
export interface AwardedTotals {
  readonly monacoins: number;
  readonly monopoints: number;
  readonly timerSeconds: number;
}

export const NOTHING_AWARDED: AwardedTotals = {
  monacoins: 0,
  monopoints: 0,
  timerSeconds: 0,
};

export interface RuleRepository {
  listAll(): Promise<Rule[]>;
  findById(id: string): Promise<Rule | null>;
  create(rule: Rule): Promise<void>;
  update(rule: Rule): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ViewerRepository {
  touch(
    platform: Platform,
    platformUserId: string,
    displayName: string,
    seenAt: string,
  ): Promise<void>;
}

export interface OverlayRepository {
  findById(id: string): Promise<OverlayLayout | null>;
  listAll(): Promise<OverlayLayout[]>;
  save(layout: OverlayLayout): Promise<void>;
}

export interface PlatformAccount {
  readonly platform: Platform;
  readonly channelName: string;
  readonly platformUserId: string | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly expiresAt: number | null;
  readonly status: ConnectorStatus;
  readonly lastError: string | null;
}

export interface AccountRepository {
  find(platform: Platform): Promise<PlatformAccount | null>;
  listSummaries(): Promise<AccountSummary[]>;
  saveTokens(account: PlatformAccount): Promise<void>;
  setStatus(platform: Platform, status: ConnectorStatus, detail?: string): Promise<void>;
  disconnect(platform: Platform): Promise<void>;
}

/**
 * Estado que vive en la sala en tiempo real, no en la base: contadores y cola
 * de alertas. Está separado del resto porque su consistencia la serializa el
 * Durable Object del canal, no D1.
 */
export interface RealtimeRoom {
  /**
   * Aplica las reglas y ejecuta el resultado: encola alertas, mueve contadores
   * y difunde a los clientes conectados.
   *
   * El plan se calcula aquí dentro, no fuera, porque el registro de cooldowns
   * vive en la sala: es el único punto que serializa por canal, así que es
   * donde «esta regla ya disparó hace 2 segundos» tiene una respuesta única.
   */
  dispatch(event: StreamEvent, rules: readonly Rule[]): Promise<DispatchOutcome>;
  readCounters(): Promise<CounterTotals>;
  broadcastConnectorStatus(status: Record<string, ConnectorStatus>): Promise<void>;
  broadcastLayout(layout: OverlayLayout): Promise<void>;
}

export interface DispatchOutcome {
  readonly awarded: AwardedTotals;
  readonly queuedAlerts: number;
  readonly firedRuleIds: readonly string[];
  /** Acciones que solo el agente local puede ejecutar (OBS). */
  readonly agentActions: ActionPlan['agent'];
}

/** Canal hacia el agente local. Es la única vía por la que el Worker toca OBS. */
export interface AgentGateway {
  send(plan: ActionPlan): Promise<void>;
  isConnected(): Promise<boolean>;
}
