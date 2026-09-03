/**
 * El evento común: el corazón del dominio.
 *
 * Un sub de Twitch, un Super Chat de YouTube, unos Kicks y un gift de TikTok
 * son la misma cosa vista desde cuatro sitios. A partir de aquí ningún
 * componente sabe —ni le importa— de qué plataforma vino nada.
 *
 * Este módulo es puro: sin Zod, sin fetch, sin reloj. La validación de la
 * frontera vive en `@monaworld/contracts`.
 */

export const PLATFORMS = ['twitch', 'kick', 'youtube', 'tiktok', 'manual'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Plataformas con cuenta conectable. `manual` queda fuera a propósito: es el
 * origen del simulador y del panel, no un servicio con el que autenticarse.
 */
export const CONNECTABLE_PLATFORMS = ['twitch', 'kick', 'youtube', 'tiktok'] as const;
export type ConnectablePlatform = (typeof CONNECTABLE_PLATFORMS)[number];

/** Por dónde entró el evento al sistema. */
export const EVENT_SOURCES = ['webhook', 'agent', 'panel'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const EVENT_TYPES = [
  'follow',
  'subscribe',
  'gift_sub',
  'resub',
  'donation',
  'cheer',
  'superchat',
  'gift',
  'member',
  'raid',
  'chat',
  'like',
  'share',
  'join',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Unidad nativa del valor. Deliberadamente NO se convierte a una moneda común
 * durante la ingesta: cuánto vale una rosa de TikTok o 500 bits lo decide el
 * streamer en sus reglas, y para eso hace falta el dato original.
 */
export const VALUE_UNITS = ['bits', 'gift', 'currency', 'tier', 'viewers', 'none'] as const;
export type ValueUnit = (typeof VALUE_UNITS)[number];

export interface Actor {
  readonly platformUserId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly isMod: boolean;
  readonly isSubscriber: boolean;
}

export interface EventValue {
  readonly rawAmount: number;
  readonly rawUnit: ValueUnit;
  readonly currency?: string;
  readonly giftName?: string;
  readonly tier?: string;
}

/**
 * Lo que produce un conector antes de que la aplicación le asigne identidad.
 * Separarlo de `StreamEvent` impide que un adaptador invente ids o mienta
 * sobre por dónde entró el evento.
 */
export interface IncomingEvent {
  readonly platform: Platform;
  readonly type: EventType;
  readonly actor: Actor;
  readonly value: EventValue;
  readonly message?: string;
  readonly occurredAt: string;
  /**
   * Clave única del evento nativo. Es lo que hace el sistema idempotente:
   * Twitch reintenta webhooks y el agente reenvía su cola al reconectar.
   */
  readonly dedupeKey: string;
  readonly simulated: boolean;
}

export interface StreamEvent extends IncomingEvent {
  readonly id: string;
  readonly source: EventSource;
}

export const NO_VALUE: EventValue = { rawAmount: 0, rawUnit: 'none' };

export function makeDedupeKey(platform: Platform, nativeId: string): string {
  return `${platform}:${nativeId}`;
}

/** Un evento de chat sin texto no aporta nada: se descarta en la ingesta. */
export function isMeaningful(event: IncomingEvent): boolean {
  if (event.type === 'chat') return Boolean(event.message?.trim());
  return true;
}

/** Etiqueta legible para el historial del panel y los registros. */
export function describeEvent(event: StreamEvent): string {
  const who = event.actor.displayName;
  const { rawAmount, giftName, currency, tier } = event.value;

  switch (event.type) {
    case 'follow':
      return `${who} empezó a seguirte`;
    case 'subscribe':
      return `${who} se suscribió${tier ? ` (${tier})` : ''}`;
    case 'resub':
      return `${who} renovó su suscripción`;
    case 'gift_sub':
      return `${who} regaló ${rawAmount} suscripción(es)`;
    case 'cheer':
      return `${who} envió ${rawAmount} bits`;
    case 'superchat':
      return `${who} envió un Super Chat de ${rawAmount} ${currency ?? ''}`.trim();
    case 'donation':
      return `${who} donó ${rawAmount} ${currency ?? ''}`.trim();
    case 'gift':
      return `${who} envió ${rawAmount}× ${giftName ?? 'un regalo'}`;
    case 'member':
      return `${who} se hizo miembro`;
    case 'raid':
      return `${who} llegó con ${rawAmount} espectadores`;
    case 'like':
      return `${who} dio ${rawAmount} me gusta`;
    case 'share':
      return `${who} compartió el directo`;
    case 'join':
      return `${who} entró al directo`;
    case 'chat':
      return `${who}: ${event.message ?? ''}`.trim();
  }
}
