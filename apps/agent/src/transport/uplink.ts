import type { IncomingEvent } from '@monaworld/domain';
import type { AgentReport, ConnectorStatus } from '@monaworld/contracts';

/**
 * Enlace del agente con el Worker.
 *
 * Guarda en cola lo que no se pudo enviar y lo reintenta al recuperar la
 * conexión. Durante un directo la red doméstica parpadea, y perder los gifts de
 * ese minuto sería peor que entregarlos con dos segundos de retraso: como la
 * ingesta es idempotente por `dedupeKey`, reintentar es siempre seguro.
 */

export interface UplinkOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly maxQueue?: number;
  readonly onLog?: (message: string) => void;
}

const DEFAULT_MAX_QUEUE = 500;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

export class Uplink {
  private readonly pending: IncomingEvent[] = [];
  private flushing = false;
  private attempt = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: UplinkOptions) {}

  private get maxQueue(): number {
    return this.options.maxQueue ?? DEFAULT_MAX_QUEUE;
  }

  private log(message: string): void {
    this.options.onLog?.(message);
  }

  /** Encola un evento y dispara el vaciado. Nunca lanza: no debe tumbar un conector. */
  publish(event: IncomingEvent): void {
    if (this.pending.length >= this.maxQueue) {
      // Se descarta lo más antiguo: en un directo, lo reciente importa más.
      this.pending.shift();
      this.log('cola llena: se descartó el evento más antiguo');
    }
    this.pending.push(event);
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0) return;
    this.flushing = true;

    try {
      while (this.pending.length > 0) {
        const event = this.pending[0]!;
        const delivered = await this.send('/api/agent/events', event);

        if (!delivered) {
          this.scheduleRetry();
          return;
        }

        this.pending.shift();
        this.attempt = 0;
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Informa del estado de un conector para que el panel lo pinte. */
  async report(platform: AgentReport['platform'], status: ConnectorStatus, detail?: string) {
    await this.send('/api/agent/status', { platform, status, detail });
  }

  private async send(path: string, body: unknown): Promise<boolean> {
    try {
      const response = await fetch(`${this.options.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.token}`,
        },
        body: JSON.stringify(body),
      });

      // 409 es un duplicado: el evento ya estaba procesado, así que cuenta
      // como entregado y no debe reintentarse eternamente.
      if (response.status === 409) return true;

      if (!response.ok) {
        this.log(`el Worker respondió ${response.status} en ${path}`);
        // Un 4xx distinto de 409 no se arregla reintentando el mismo cuerpo.
        return response.status >= 400 && response.status < 500;
      }

      return true;
    } catch (error) {
      this.log(`sin conexión con el Worker: ${(error as Error).message}`);
      return false;
    }
  }

  private scheduleRetry(): void {
    if (this.timer) return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** this.attempt++, RETRY_MAX_MS);
    this.log(`reintentando en ${Math.round(delay / 1000)}s (${this.pending.length} en cola)`);

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delay);
    this.timer.unref?.();
  }

  get queueSize(): number {
    return this.pending.length;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
