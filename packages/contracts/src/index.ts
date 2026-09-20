import { z } from 'zod';

export const platformSchema = z.enum(['twitch','youtube','kick','tiktok']);
export const resourceKindSchema = z.enum(['command','timer','counter','spam-filter','banned-word','bot-setting','overlay','sticker','sound','alert','media-request','loyalty-setting','coin-setting']);
export const resourceInputSchema = z.object({
  kind: resourceKindSchema,
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  data: z.record(z.string(), z.unknown()).default({}),
});
export const eventInputSchema = z.object({
  platform: platformSchema,
  type: z.string().min(1).max(100),
  actorId: z.string().min(1).max(200),
  actorName: z.string().min(1).max(200),
  message: z.string().max(2000).optional(),
  amount: z.number().finite().optional(),
  currency: z.string().max(16).optional(),
  rawUnit: z.string().max(80).optional(),
  giftName: z.string().max(200).optional(),
  dedupeKey: z.string().max(300).optional(),
});
export const settingsInputSchema = z.record(z.string(), z.unknown());
