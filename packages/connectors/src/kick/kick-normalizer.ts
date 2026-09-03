import { makeDedupeKey, NO_VALUE, type Actor, type IncomingEvent } from '@monaworld/domain';
import type { NormalizeContext, PlatformNormalizer } from '../shared/normalizer.js';

/**
 * Normalizador de los webhooks de la API pública de Kick.
 *
 * Kick reutiliza la misma forma de usuario en todos sus eventos, cambiando solo
 * el nombre del campo según el papel: `sender` en el chat, `follower` al
 * seguir, `subscriber` al suscribirse, `gifter` al regalar.
 */

export interface KickUser {
  readonly is_anonymous?: boolean;
  readonly user_id?: number | string;
  readonly username?: string;
  readonly is_verified?: boolean;
  readonly profile_picture?: string;
  readonly channel_slug?: string;
  readonly identity?: {
    readonly username_color?: string;
    readonly badges?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
  };
}

export interface KickWebhookPayload {
  readonly broadcaster?: KickUser;
  readonly sender?: KickUser;
  readonly follower?: KickUser;
  readonly subscriber?: KickUser;
  readonly gifter?: KickUser;
  readonly giftees?: readonly KickUser[];
  readonly message_id?: string;
  readonly content?: string;
  readonly duration?: number;
  readonly expires_at?: string;
  readonly created_at?: string;
}

export type KickEventType =
  | 'chat.message.sent'
  | 'channel.followed'
  | 'channel.subscription.new'
  | 'channel.subscription.renewal'
  | 'channel.subscription.gifts'
  | 'livestream.status.updated'
  | 'moderation.banned';

export interface KickNotification {
  readonly eventType: string;
  readonly payload: KickWebhookPayload;
}

const MOD_BADGES = new Set(['moderator', 'broadcaster', 'owner']);
const SUB_BADGES = new Set(['subscriber', 'founder', 'og']);

function toActor(user: KickUser | undefined): Actor {
  const anonymous = user?.is_anonymous === true;
  const badges = user?.identity?.badges ?? [];
  return {
    platformUserId: anonymous ? 'anonymous' : String(user?.user_id ?? 'desconocido'),
    displayName: anonymous ? 'Anónimo' : (user?.username ?? 'anónimo'),
    avatarUrl: user?.profile_picture || undefined,
    isMod: badges.some((b) => MOD_BADGES.has(String(b.type ?? '').toLowerCase())),
    isSubscriber: badges.some((b) => SUB_BADGES.has(String(b.type ?? '').toLowerCase())),
  };
}

export const kickNormalizer: PlatformNormalizer<KickNotification> = {
  platform: 'kick',

  normalize(native: KickNotification, context: NormalizeContext): IncomingEvent | null {
    const { eventType, payload } = native;

    // El chat trae su propio id estable; el resto se apoya en el del mensaje.
    const nativeId = payload.message_id ?? context.nativeId;
    const base = {
      platform: 'kick' as const,
      occurredAt: payload.created_at ?? context.receivedAt,
      dedupeKey: makeDedupeKey('kick', `${eventType}:${nativeId}`),
      simulated: false,
    };

    switch (eventType) {
      case 'chat.message.sent': {
        const content = payload.content?.trim();
        if (!content) return null;
        return {
          ...base,
          type: 'chat',
          actor: toActor(payload.sender),
          value: NO_VALUE,
          message: content,
        };
      }

      case 'channel.followed':
        return {
          ...base,
          type: 'follow',
          actor: toActor(payload.follower),
          value: NO_VALUE,
        };

      case 'channel.subscription.new':
        return {
          ...base,
          type: 'subscribe',
          actor: toActor(payload.subscriber),
          value: { rawAmount: 1, rawUnit: 'tier' },
        };

      case 'channel.subscription.renewal':
        return {
          ...base,
          type: 'resub',
          actor: toActor(payload.subscriber),
          // Kick expresa la renovación en meses acumulados.
          value: { rawAmount: payload.duration ?? 1, rawUnit: 'tier' },
        };

      case 'channel.subscription.gifts': {
        const count = payload.giftees?.length ?? 0;
        if (count === 0) return null;
        return {
          ...base,
          type: 'gift_sub',
          actor: toActor(payload.gifter),
          value: { rawAmount: count, rawUnit: 'gift' },
        };
      }

      default:
        // Kick añade eventos con frecuencia; los que no mapeamos se ignoran
        // en silencio en vez de romper la ingesta.
        return null;
    }
  },
};

/** Suscripciones que MonaWorld pide a Kick. Todas de solo lectura. */
export const KICK_SUBSCRIPTIONS = [
  { name: 'chat.message.sent', version: 1 },
  { name: 'channel.followed', version: 1 },
  { name: 'channel.subscription.new', version: 1 },
  { name: 'channel.subscription.renewal', version: 1 },
  { name: 'channel.subscription.gifts', version: 1 },
] as const;
