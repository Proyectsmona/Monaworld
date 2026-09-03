import { makeDedupeKey, NO_VALUE, type Actor, type IncomingEvent } from '@monaworld/domain';
import type { NormalizeContext, PlatformNormalizer } from '../shared/normalizer.js';

/**
 * Normalizador del chat en directo de YouTube.
 *
 * Consume el recurso `liveChatMessage` tal cual lo entrega la Data API. El
 * `id` del mensaje es estable entre reconexiones, así que sirve directamente
 * como clave de deduplicación: al reconectar, `streamList` reenvía parte del
 * historial reciente y sin esto se repetirían las alertas.
 */

export interface YouTubeAuthorDetails {
  readonly channelId?: string;
  readonly displayName?: string;
  readonly profileImageUrl?: string;
  readonly isChatOwner?: boolean;
  readonly isChatModerator?: boolean;
  readonly isChatSponsor?: boolean;
}

export interface YouTubeLiveChatMessage {
  readonly id?: string;
  readonly snippet?: {
    readonly type?: string;
    readonly publishedAt?: string;
    readonly displayMessage?: string;
    readonly textMessageDetails?: { readonly messageText?: string };
    readonly superChatDetails?: {
      readonly amountMicros?: string | number;
      readonly currency?: string;
      readonly userComment?: string;
      readonly tier?: number;
    };
    readonly superStickerDetails?: {
      readonly amountMicros?: string | number;
      readonly currency?: string;
      readonly tier?: number;
    };
    readonly newSponsorDetails?: { readonly memberLevelName?: string };
    readonly membershipGiftingDetails?: {
      readonly giftMembershipsCount?: number;
      readonly giftMembershipsLevelName?: string;
    };
  };
  readonly authorDetails?: YouTubeAuthorDetails;
}

/** La API expresa los importes en millonésimas de la unidad monetaria. */
const MICROS_PER_UNIT = 1_000_000;

function toAmount(micros: string | number | undefined): number {
  const value = typeof micros === 'string' ? Number.parseInt(micros, 10) : (micros ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.round((value / MICROS_PER_UNIT) * 100) / 100;
}

function toActor(author: YouTubeAuthorDetails | undefined): Actor {
  return {
    platformUserId: author?.channelId ?? 'desconocido',
    displayName: author?.displayName ?? 'anónimo',
    avatarUrl: author?.profileImageUrl || undefined,
    isMod: author?.isChatModerator === true || author?.isChatOwner === true,
    isSubscriber: author?.isChatSponsor === true,
  };
}

export const youtubeNormalizer: PlatformNormalizer<YouTubeLiveChatMessage> = {
  platform: 'youtube',

  normalize(native: YouTubeLiveChatMessage, context: NormalizeContext): IncomingEvent | null {
    const snippet = native.snippet;
    if (!snippet) return null;

    const nativeId = native.id ?? context.nativeId;
    const base = {
      platform: 'youtube' as const,
      actor: toActor(native.authorDetails),
      occurredAt: snippet.publishedAt ?? context.receivedAt,
      dedupeKey: makeDedupeKey('youtube', nativeId),
      simulated: false,
    };

    switch (snippet.type) {
      case 'textMessageEvent': {
        const text = snippet.textMessageDetails?.messageText?.trim();
        if (!text) return null;
        return { ...base, type: 'chat', value: NO_VALUE, message: text };
      }

      case 'superChatEvent': {
        const details = snippet.superChatDetails;
        return {
          ...base,
          type: 'superchat',
          value: {
            rawAmount: toAmount(details?.amountMicros),
            rawUnit: 'currency',
            currency: details?.currency,
            tier: details?.tier !== undefined ? `Nivel ${details.tier}` : undefined,
          },
          message: details?.userComment?.trim() || undefined,
        };
      }

      case 'superStickerEvent': {
        const details = snippet.superStickerDetails;
        return {
          ...base,
          type: 'superchat',
          value: {
            rawAmount: toAmount(details?.amountMicros),
            rawUnit: 'currency',
            currency: details?.currency,
            tier: details?.tier !== undefined ? `Nivel ${details.tier}` : undefined,
          },
        };
      }

      case 'newSponsorEvent':
      case 'memberMilestoneChatEvent':
        return {
          ...base,
          type: 'member',
          value: {
            rawAmount: 1,
            rawUnit: 'tier',
            tier: snippet.newSponsorDetails?.memberLevelName,
          },
        };

      case 'membershipGiftingEvent':
        return {
          ...base,
          type: 'gift_sub',
          value: {
            rawAmount: snippet.membershipGiftingDetails?.giftMembershipsCount ?? 1,
            rawUnit: 'gift',
            tier: snippet.membershipGiftingDetails?.giftMembershipsLevelName,
          },
        };

      default:
        // Borrados, baneos y eventos de sistema no se ingestan.
        return null;
    }
  },
};
