import { youtubeNormalizer, type YouTubeLiveChatMessage } from '@monaworld/connectors';
import type { IncomingEvent } from '@monaworld/domain';

/**
 * Conector del chat en directo de YouTube.
 *
 * Usa la Data API v3. Vive en el agente y no en el Worker porque mantener el
 * chat abierto exige una conexión larga, y un Worker no puede sostenerla.
 *
 * Sobre la cuota: son 10.000 unidades diarias del proyecto de Google Cloud.
 * Siendo MonaWorld una herramienta personal, esas unidades son para un solo
 * canal y sobran; el intervalo de sondeo lo marca la propia respuesta de la
 * API en `pollingIntervalMillis`, que sube cuando el chat está tranquilo.
 */

export interface YouTubeConnectorOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly onEvent: (event: IncomingEvent) => void;
  readonly onStatus: (status: 'online' | 'offline' | 'error', detail?: string) => void;
  readonly onLog?: (message: string) => void;
}

const API = 'https://www.googleapis.com/youtube/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Suelo de seguridad: nunca sondear más rápido que esto, pase lo que pase. */
const MIN_POLL_MS = 2000;
/** Cuando no hay directo, mirar de vez en cuando sin gastar cuota. */
const IDLE_POLL_MS = 60_000;

export class YouTubeConnector {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private liveChatId: string | null = null;
  private nextPageToken: string | undefined;
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;
  /** Al arrancar se ignora el historial: si no, alertaría de mensajes viejos. */
  private primed = false;

  constructor(private readonly options: YouTubeConnectorOptions) {}

  private log(message: string): void {
    this.options.onLog?.(`[youtube] ${message}`);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.tick();
  }

  // --------------------------------------------------------------- OAuth

  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const response = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.options.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`no se pudo refrescar el token (${response.status})`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = body.access_token;
    this.tokenExpiresAt = Date.now() + body.expires_in * 1000;
    return this.accessToken;
  }

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const token = await this.ensureAccessToken();
    const url = new URL(`${API}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`${path} devolvió ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  // ------------------------------------------------------------- directo

  /** Busca el directo activo del canal y su `liveChatId`. */
  private async findLiveChat(): Promise<string | null> {
    const broadcasts = await this.call<{
      items?: Array<{ snippet?: { liveChatId?: string } }>;
    }>('liveBroadcasts', {
      part: 'snippet',
      broadcastStatus: 'active',
      broadcastType: 'all',
      maxResults: '1',
    });

    return broadcasts.items?.[0]?.snippet?.liveChatId ?? null;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    try {
      if (!this.liveChatId) {
        this.liveChatId = await this.findLiveChat();

        if (!this.liveChatId) {
          this.options.onStatus('offline', 'sin directo activo');
          return this.schedule(IDLE_POLL_MS);
        }

        this.primed = false;
        this.nextPageToken = undefined;
        this.options.onStatus('online');
        this.log('directo encontrado, escuchando el chat');
      }

      const page = await this.call<{
        items?: YouTubeLiveChatMessage[];
        nextPageToken?: string;
        pollingIntervalMillis?: number;
      }>('liveChat/messages', {
        liveChatId: this.liveChatId,
        part: 'snippet,authorDetails',
        maxResults: '200',
        ...(this.nextPageToken ? { pageToken: this.nextPageToken } : {}),
      });

      this.nextPageToken = page.nextPageToken;

      // La primera página trae historial reciente: se descarta para no alertar
      // de mensajes que ocurrieron antes de arrancar el agente.
      if (!this.primed) {
        this.primed = true;
        this.log(`historial omitido (${page.items?.length ?? 0} mensajes)`);
      } else {
        for (const item of page.items ?? []) {
          const event = youtubeNormalizer.normalize(item, {
            nativeId: item.id ?? crypto.randomUUID(),
            receivedAt: new Date().toISOString(),
          });
          if (event) this.options.onEvent(event);
        }
      }

      this.schedule(Math.max(page.pollingIntervalMillis ?? 5000, MIN_POLL_MS));
    } catch (error) {
      const detail = (error as Error).message;
      this.log(detail);

      // Un chat que termina invalida el liveChatId: hay que volver a buscarlo.
      if (detail.includes('403') || detail.includes('404')) {
        this.liveChatId = null;
        this.options.onStatus('offline', 'el chat terminó');
        return this.schedule(IDLE_POLL_MS);
      }

      this.options.onStatus('error', detail);
      this.schedule(IDLE_POLL_MS);
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.tick();
    }, delayMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.options.onStatus('offline');
  }
}
