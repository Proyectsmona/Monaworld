import { tiktokNormalizer, type TikTokNativeEvent } from '@monaworld/connectors';
import type { IncomingEvent } from '@monaworld/domain';

/**
 * Conector de TikTok LIVE.
 *
 * Es la única integración no oficial del sistema: habla el protocolo interno de
 * TikTok a través de `tiktok-live-connector`. Se romperá cuando TikTok cambie
 * algo, así que está deliberadamente aislado — si cae, los demás conectores y
 * los overlays siguen funcionando.
 *
 * Corre en el PC del streamer y no en la nube por una razón concreta: TikTok
 * marca el tráfico desde IPs de centro de datos como no humano. La IP
 * residencial es la que menos fricción tiene.
 */

export interface TikTokConnectorOptions {
  readonly username: string;
  readonly onEvent: (event: IncomingEvent) => void;
  readonly onStatus: (status: 'online' | 'offline' | 'error', detail?: string) => void;
  readonly onLog?: (message: string) => void;
}

const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 120_000;

/** Eventos de la librería que mapeamos, con el `kind` que espera el normalizador. */
const EVENT_MAP: ReadonlyArray<[string, TikTokNativeEvent['kind']]> = [
  ['chat', 'chat'],
  ['gift', 'gift'],
  ['like', 'like'],
  ['social', 'social'],
  ['follow', 'social'],
  ['share', 'social'],
  ['member', 'member'],
];

export class TikTokConnector {
  private connection: any;
  private attempt = 0;
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: TikTokConnectorOptions) {}

  private log(message: string): void {
    this.options.onLog?.(`[tiktok] ${message}`);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    try {
      // Importación diferida: si la librería falla al cargar, el agente sigue
      // sirviendo YouTube y OBS en vez de no arrancar.
      const { TikTokLiveConnection } = await import('tiktok-live-connector');
      this.connection = new TikTokLiveConnection(this.options.username, {});

      this.bindEvents();

      await this.connection.connect();
      this.attempt = 0;
      this.options.onStatus('online');
      this.log(`conectado a @${this.options.username}`);
    } catch (error) {
      const detail = (error as Error).message;
      this.options.onStatus('error', detail);
      this.log(`no se pudo conectar: ${detail}`);
      this.scheduleReconnect();
    }
  }

  private bindEvents(): void {
    for (const [nativeName, kind] of EVENT_MAP) {
      this.connection.on(nativeName, (payload: Record<string, unknown>) => {
        this.handle(kind, payload, nativeName);
      });
    }

    this.connection.on('disconnected', () => {
      this.options.onStatus('offline', 'el directo terminó o se cortó la conexión');
      this.log('desconectado');
      this.scheduleReconnect();
    });

    // La librería emite `error` por fallos recuperables: no debe tumbar el proceso.
    this.connection.on('error', (error: unknown) => {
      this.log(`error de la librería: ${(error as Error)?.message ?? String(error)}`);
    });

    this.connection.on('streamEnd', () => {
      this.options.onStatus('offline', 'el directo terminó');
      this.scheduleReconnect();
    });
  }

  private handle(
    kind: TikTokNativeEvent['kind'],
    payload: Record<string, unknown>,
    nativeName: string,
  ): void {
    // `follow` y `share` llegan como eventos propios además de por `social`;
    // se normaliza la forma para que el normalizador vea siempre lo mismo.
    const action =
      nativeName === 'follow' || nativeName === 'share'
        ? nativeName
        : (payload as { action?: string }).action;

    const native = { ...payload, kind, action } as unknown as TikTokNativeEvent;

    const event = tiktokNormalizer.normalize(native, {
      nativeId: String(payload.msgId ?? Date.now()),
      receivedAt: new Date().toISOString(),
    });

    // `null` es normal: rachas de gift aún abiertas y eventos que no ingestamos.
    if (event) this.options.onEvent(event);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return;

    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempt++, RECONNECT_MAX_MS);
    this.log(`reintentando en ${Math.round(delay / 1000)}s`);

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.connect();
    }, delay);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    try {
      await this.connection?.disconnect?.();
    } catch {
      // ya estaba desconectado
    }
    this.options.onStatus('offline');
  }
}
