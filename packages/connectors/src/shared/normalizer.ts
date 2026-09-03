import type { IncomingEvent, Platform } from '@monaworld/domain';

/**
 * Puerto de normalización.
 *
 * Cada plataforma entra por un mecanismo distinto —webhook firmado, streaming
 * HTTP, protocolo interno— pero todas terminan implementando esto. A partir de
 * aquí el resto del sistema no distingue de dónde vino nada.
 *
 * Devolver `null` es normal y frecuente: significa «este mensaje nativo no
 * corresponde a ningún evento que MonaWorld ingeste». No es un error.
 */
export interface PlatformNormalizer<TNative> {
  readonly platform: Platform;
  normalize(native: TNative, context: NormalizeContext): IncomingEvent | null;
}

export interface NormalizeContext {
  /** Identificador nativo del mensaje, base de la clave de deduplicación. */
  readonly nativeId: string;
  /** Momento del evento; si la plataforma no lo da, el de recepción. */
  readonly receivedAt: string;
}

/** Verificación de autenticidad de una petición entrante. */
export interface SignatureVerdict {
  readonly valid: boolean;
  readonly reason?: string;
}

export const invalid = (reason: string): SignatureVerdict => ({ valid: false, reason });
export const valid: SignatureVerdict = { valid: true };

/** Ventana de tolerancia frente a reenvíos de peticiones antiguas. */
export const REPLAY_WINDOW_MS = 10 * 60 * 1000;

export function isWithinReplayWindow(timestamp: string, now: number): boolean {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(now - parsed) <= REPLAY_WINDOW_MS;
}

/** Comparación en tiempo constante: no filtra la firma por temporización. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
