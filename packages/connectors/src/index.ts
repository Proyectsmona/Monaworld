import type { Platform, UnifiedEvent } from '@monaworld/domain';
export function makeUnifiedEvent(ownerUserId:number, platform:Platform, input:Omit<UnifiedEvent,'ownerUserId'|'platform'>):UnifiedEvent {
  return { ...input, ownerUserId, platform };
}
export const PLATFORM_LABELS:Record<Platform,string> = { twitch:'Twitch', youtube:'YouTube', kick:'Kick', tiktok:'TikTok' };
