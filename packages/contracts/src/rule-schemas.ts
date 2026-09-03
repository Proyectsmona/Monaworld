import { z } from 'zod';
import {
  EVENT_TYPES,
  PLATFORMS,
  type Action,
  type Rule,
  type RuleMatch,
} from '@monaworld/domain';

export const ruleMatchSchema: z.ZodType<RuleMatch> = z.object({
  platforms: z.array(z.enum(PLATFORMS)).optional(),
  types: z.array(z.enum(EVENT_TYPES)).optional(),
  minAmount: z.number().finite().nonnegative().optional(),
  giftName: z.string().max(80).optional(),
  messageContains: z.string().max(120).optional(),
  actorIsMod: z.boolean().optional(),
  actorIsSubscriber: z.boolean().optional(),
});

export const actionSchema: z.ZodType<Action> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('alert'),
    widget: z.string().max(40).default('alert'),
    template: z.string().min(1).max(300),
    durationMs: z.number().int().min(500).max(60_000).default(6000),
    soundUrl: z.string().max(500).optional(),
    imageUrl: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal('sound'),
    soundUrl: z.string().min(1).max(500),
    volume: z.number().min(0).max(1).default(0.8),
  }),
  z.object({
    kind: z.literal('counter'),
    key: z.string().min(1).max(40),
    delta: z.number().finite().default(0),
    perUnit: z.number().finite().default(0),
  }),
  z.object({
    kind: z.literal('obs'),
    op: z.enum(['setScene', 'toggleSource', 'setSourceVisible']),
    target: z.string().min(1).max(120),
    durationMs: z.number().int().min(0).max(120_000).default(0),
  }),
]);

export const ruleSchema: z.ZodType<Rule> = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
  match: ruleMatchSchema.default({}),
  actions: z.array(actionSchema).min(1).max(20),
  cooldownMs: z.number().int().min(0).max(3_600_000).default(0),
});

/** Alta y edición: el id lo asigna el servidor, no el cliente. */
export const ruleDraftSchema = z.object({
  name: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
  match: ruleMatchSchema.default({}),
  actions: z.array(actionSchema).min(1).max(20),
  cooldownMs: z.number().int().min(0).max(3_600_000).default(0),
});
export type RuleDraft = z.infer<typeof ruleDraftSchema>;
