export const PLATFORMS = ['twitch','youtube','kick','tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const RESOURCE_KINDS = ['command','timer','counter','spam-filter','banned-word','bot-setting','overlay','sticker','sound','alert','media-request','loyalty-setting','coin-setting'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type CostCurrency = 'points' | 'coins';

export interface UnifiedEvent {
  id: string;
  ownerUserId: number;
  platform: Platform;
  type: string;
  actorId: string;
  actorName: string;
  message?: string;
  amount?: number;
  currency?: string;
  rawUnit?: string;
  giftName?: string;
  createdAt: string;
}

export interface Resource<T = Record<string, unknown>> {
  id: string;
  kind: ResourceKind;
  name: string;
  enabled: boolean;
  data: T;
  createdAt?: string;
  updatedAt?: string;
}

export interface Balance {
  platform: Platform;
  platformUserId: string;
  displayName: string;
  points: number;
  coins: number;
}

export function normalizeCommand(value: string): string {
  const v = value.trim().toLowerCase();
  if (!v) return '';
  return v.startsWith('!') ? v : `!${v}`;
}

export function eventIsMonetary(type: string): boolean {
  return ['bits','sub','resub','gift_sub','membership','gift_membership','super_chat','super_sticker','gift','donation'].some((part) => type.includes(part));
}
