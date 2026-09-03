import { z } from 'zod';
import {
  EVENT_SOURCES,
  EVENT_TYPES,
  PLATFORMS,
  VALUE_UNITS,
  type Actor,
  type EventValue,
  type IncomingEvent,
  type StreamEvent,
} from '@monaworld/domain';

/**
 * Validación de frontera.
 *
 * El dominio define QUÉ es un evento; este paquete define cómo se reconoce uno
 * que llega de fuera. Cada esquema se anota con el tipo de dominio que debe
 * producir, así que si alguien cambia el dominio y olvida el esquema —o al
 * revés— el compilador lo para antes de que llegue a producción.
 */

export const platformSchema = z.enum(PLATFORMS);
export const eventTypeSchema = z.enum(EVENT_TYPES);
export const eventSourceSchema = z.enum(EVENT_SOURCES);
export const valueUnitSchema = z.enum(VALUE_UNITS);

export const actorSchema: z.ZodType<Actor> = z.object({
  platformUserId: z.string().min(1),
  displayName: z.string().min(1).max(120),
  avatarUrl: z.string().url().optional(),
  isMod: z.boolean().default(false),
  isSubscriber: z.boolean().default(false),
});

export const eventValueSchema: z.ZodType<EventValue> = z.object({
  rawAmount: z.number().finite().nonnegative().default(0),
  rawUnit: valueUnitSchema.default('none'),
  currency: z.string().length(3).optional(),
  giftName: z.string().max(80).optional(),
  tier: z.string().max(40).optional(),
});

export const incomingEventSchema: z.ZodType<IncomingEvent> = z.object({
  platform: platformSchema,
  type: eventTypeSchema,
  actor: actorSchema,
  value: eventValueSchema.default({ rawAmount: 0, rawUnit: 'none' }),
  message: z.string().max(500).optional(),
  occurredAt: z.iso.datetime(),
  dedupeKey: z.string().min(1).max(200),
  simulated: z.boolean().default(false),
});

export const streamEventSchema: z.ZodType<StreamEvent> = z.object({
  id: z.uuid(),
  source: eventSourceSchema,
  platform: platformSchema,
  type: eventTypeSchema,
  actor: actorSchema,
  value: eventValueSchema,
  message: z.string().max(500).optional(),
  occurredAt: z.iso.datetime(),
  dedupeKey: z.string().min(1).max(200),
  simulated: z.boolean().default(false),
});

/** Petición del simulador del panel. */
export const simulateRequestSchema = z.object({
  platform: platformSchema,
  type: eventTypeSchema,
  displayName: z.string().max(120).optional(),
  amount: z.number().finite().nonnegative().optional(),
  giftName: z.string().max(80).optional(),
  message: z.string().max(500).optional(),
});
export type SimulateRequest = z.infer<typeof simulateRequestSchema>;
