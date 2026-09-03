import { makeDedupeKey, NO_VALUE, type Actor, type IncomingEvent } from '@monaworld/domain';
import type { NormalizeContext, PlatformNormalizer } from '../shared/normalizer.js';

/**
 * Normalizador de Twitch EventSub.
 *
 * Es la integración más limpia de las cuatro: una sola suscripción cubre
 * follows, subs, cheers, raids y el chat completo, todo por webhook firmado.
 * La clave de deduplicación es el `Twitch-Eventsub-Message-Id`, que Twitch
 * repite tal cual en cada reintento.
 */

export interface TwitchNotification {
  readonly subscription?: { readonly type?: string };
  readonly event?: Record<string, unknown>;
}

const TIER_NAMES: Readonly<Record<string, string>> = {
  '1000': 'Tier 1',
  '2000': 'Tier 2',
  '3000': 'Tier 3',
  prime: 'Prime',
};

const MOD_BADGES = new Set(['moderator', 'broadcaster']);
const SUB_BADGES = new Set(['subscriber', 'founder']);

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function hasBadge(badges: unknown, wanted: ReadonlySet<string>): boolean {
  if (!Array.isArray(badges)) return false;
  return badges.some((badge) => {
    if (typeof badge !== 'object' || badge === null) return false;
    return wanted.has(str((badge as Record<string, unknown>).set_id));
  });
}

function actorFrom(
  event: Record<string, unknown>,
  idKey: string,
  nameKey: string,
  options: { anonymous?: boolean; badges?: unknown } = {},
): Actor {
  const anonymous = options.anonymous === true;
  return {
    platformUserId: anonymous ? 'anonymous' : str(event[idKey], 'desconocido'),
    displayName: anonymous ? 'Anónimo' : str(event[nameKey], 'anónimo'),
    isMod: hasBadge(options.badges, MOD_BADGES),
    isSubscriber: hasBadge(options.badges, SUB_BADGES),
  };
}

const tierName = (tier: unknown): string | undefined => {
  const raw = str(tier);
  return raw ? (TIER_NAMES[raw] ?? raw) : undefined;
};

export const twitchNormalizer: PlatformNormalizer<TwitchNotification> = {
  platform: 'twitch',

  normalize(native: TwitchNotification, context: NormalizeContext): IncomingEvent | null {
    const type = native.subscription?.type;
    const event = native.event;
    if (!type || !event) return null;

    const base = {
      platform: 'twitch' as const,
      occurredAt: context.receivedAt,
      dedupeKey: makeDedupeKey('twitch', context.nativeId),
      simulated: false,
    };

    switch (type) {
      case 'channel.follow':
        return {
          ...base,
          type: 'follow',
          actor: actorFrom(event, 'user_id', 'user_name'),
          value: NO_VALUE,
        };

      case 'channel.subscribe':
        // Las subs regaladas llegan además por channel.subscription.gift;
        // ignorar esta copia evita contar el mismo regalo dos veces.
        if (event.is_gift === true) return null;
        return {
          ...base,
          type: 'subscribe',
          actor: { ...actorFrom(event, 'user_id', 'user_name'), isSubscriber: true },
          value: { rawAmount: 1, rawUnit: 'tier', tier: tierName(event.tier) },
        };

      case 'channel.subscription.message': {
        const message = event.message as { text?: unknown } | undefined;
        return {
          ...base,
          type: 'resub',
          actor: { ...actorFrom(event, 'user_id', 'user_name'), isSubscriber: true },
          value: {
            rawAmount: num(event.cumulative_months, 1),
            rawUnit: 'tier',
            tier: tierName(event.tier),
          },
          message: str(message?.text) || undefined,
        };
      }

      case 'channel.subscription.gift':
        return {
          ...base,
          type: 'gift_sub',
          actor: actorFrom(event, 'user_id', 'user_name', {
            anonymous: event.is_anonymous === true,
          }),
          value: {
            rawAmount: num(event.total, 1),
            rawUnit: 'gift',
            tier: tierName(event.tier),
          },
        };

      case 'channel.cheer':
        return {
          ...base,
          type: 'cheer',
          actor: actorFrom(event, 'user_id', 'user_name', {
            anonymous: event.is_anonymous === true,
          }),
          value: { rawAmount: num(event.bits), rawUnit: 'bits' },
          message: str(event.message) || undefined,
        };

      case 'channel.raid':
        return {
          ...base,
          type: 'raid',
          actor: actorFrom(event, 'from_broadcaster_user_id', 'from_broadcaster_user_name'),
          value: { rawAmount: num(event.viewers), rawUnit: 'viewers' },
        };

      case 'channel.chat.message': {
        const message = event.message as { text?: unknown } | undefined;
        const text = str(message?.text).trim();
        if (!text) return null;
        return {
          ...base,
          type: 'chat',
          actor: actorFrom(event, 'chatter_user_id', 'chatter_user_name', {
            badges: event.badges,
          }),
          value: NO_VALUE,
          message: text,
        };
      }

      default:
        return null;
    }
  },
};

/** Suscripciones de EventSub que MonaWorld pide. Todas de solo lectura. */
export const TWITCH_SUBSCRIPTIONS = [
  { type: 'channel.follow', version: '2', scope: 'moderator:read:followers' },
  { type: 'channel.subscribe', version: '1', scope: 'channel:read:subscriptions' },
  { type: 'channel.subscription.message', version: '1', scope: 'channel:read:subscriptions' },
  { type: 'channel.subscription.gift', version: '1', scope: 'channel:read:subscriptions' },
  { type: 'channel.cheer', version: '1', scope: 'bits:read' },
  { type: 'channel.raid', version: '1', scope: '' },
  { type: 'channel.chat.message', version: '1', scope: 'user:read:chat' },
] as const;

/** Scopes OAuth. Ninguno permite publicar ni moderar: MonaWorld solo lee. */
export const TWITCH_SCOPES = [
  'moderator:read:followers',
  'channel:read:subscriptions',
  'bits:read',
  'user:read:chat',
] as const;
