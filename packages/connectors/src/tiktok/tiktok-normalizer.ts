import { makeDedupeKey, NO_VALUE, type Actor, type IncomingEvent } from '@monaworld/domain';
import type { NormalizeContext, PlatformNormalizer } from '../shared/normalizer.js';

/**
 * Normalizador de TikTok LIVE.
 *
 * TikTok no tiene API pública de gifts, así que esto consume los eventos que
 * emite la librería que habla su protocolo interno. Es la única integración no
 * oficial del sistema y se romperá cuando TikTok cambie algo: por eso vive
 * aislada detrás de este normalizador y su caída no arrastra a nadie más.
 */

export interface TikTokUser {
  readonly userId?: string | number;
  readonly uniqueId?: string;
  readonly nickname?: string;
  readonly profilePictureUrl?: string;
  readonly isModerator?: boolean;
  readonly isSubscriber?: boolean;
}

export interface TikTokNativeEvent {
  readonly kind: 'chat' | 'gift' | 'like' | 'social' | 'member';
  readonly user?: TikTokUser;
  readonly comment?: string;
  /** Gifts */
  readonly giftId?: number;
  readonly giftDetails?: { readonly giftName?: string; readonly giftType?: number };
  readonly extendedGiftInfo?: { readonly name?: string; readonly diamond_count?: number };
  readonly repeatCount?: number;
  readonly repeatEnd?: boolean;
  /** Likes */
  readonly likeCount?: number;
  /** Social: follow y share llegan por el mismo evento */
  readonly action?: string;
  /** Identificador nativo si la librería lo expone */
  readonly msgId?: string | number;
}

/**
 * Los gifts «streakables» (giftType 1) se emiten repetidamente mientras el
 * espectador mantiene pulsado. Contar cada emisión dispararía una alerta por
 * cada incremento: solo cuenta el cierre de la racha.
 */
function isIncompleteStreak(event: TikTokNativeEvent): boolean {
  const streakable = event.giftDetails?.giftType === 1;
  return streakable && event.repeatEnd !== true;
}

function toActor(user: TikTokUser | undefined): Actor {
  return {
    platformUserId: String(user?.userId ?? user?.uniqueId ?? 'desconocido'),
    displayName: user?.nickname || user?.uniqueId || 'anónimo',
    avatarUrl: user?.profilePictureUrl || undefined,
    isMod: user?.isModerator === true,
    isSubscriber: user?.isSubscriber === true,
  };
}

export const tiktokNormalizer: PlatformNormalizer<TikTokNativeEvent> = {
  platform: 'tiktok',

  normalize(native: TikTokNativeEvent, context: NormalizeContext): IncomingEvent | null {
    const actor = toActor(native.user);
    const nativeId = String(native.msgId ?? context.nativeId);

    const base = {
      platform: 'tiktok' as const,
      actor,
      occurredAt: context.receivedAt,
      simulated: false,
    };

    switch (native.kind) {
      case 'chat': {
        const comment = native.comment?.trim();
        if (!comment) return null;
        return {
          ...base,
          type: 'chat',
          value: NO_VALUE,
          message: comment,
          dedupeKey: makeDedupeKey('tiktok', `chat:${nativeId}`),
        };
      }

      case 'gift': {
        if (isIncompleteStreak(native)) return null;

        const giftName =
          native.giftDetails?.giftName ?? native.extendedGiftInfo?.name ?? 'regalo';
        const count = native.repeatCount ?? 1;

        return {
          ...base,
          type: 'gift',
          value: { rawAmount: count, rawUnit: 'gift', giftName },
          // La racha completa es un solo evento: la clave incluye el total
          // para que dos rachas seguidas del mismo regalo no se confundan.
          dedupeKey: makeDedupeKey(
            'tiktok',
            `gift:${nativeId}:${native.giftId ?? giftName}:${count}`,
          ),
        };
      }

      case 'like':
        return {
          ...base,
          type: 'like',
          value: { rawAmount: native.likeCount ?? 1, rawUnit: 'none' },
          dedupeKey: makeDedupeKey('tiktok', `like:${nativeId}`),
        };

      case 'social': {
        const action = native.action?.toLowerCase();
        if (action !== 'follow' && action !== 'share') return null;
        return {
          ...base,
          type: action,
          value: NO_VALUE,
          dedupeKey: makeDedupeKey('tiktok', `${action}:${nativeId}`),
        };
      }

      case 'member':
        return {
          ...base,
          type: 'join',
          value: NO_VALUE,
          dedupeKey: makeDedupeKey('tiktok', `join:${nativeId}`),
        };

      default:
        return null;
    }
  },
};
