import { z } from 'zod';
import { CONNECTABLE_PLATFORMS, WIDGET_KINDS } from '@monaworld/domain';
import { connectorStatusSchema } from './realtime-protocol.js';

/** Formas que viajan entre el Worker y el panel. Un único sitio donde mirarlas. */

export const credentialsSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(10).max(200),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const sessionUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  role: z.enum(['ADMIN', 'MODERATOR_ADMIN', 'USER']),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const eventRowSchema = z.object({
  id: z.number().int(),
  platform: z.string(),
  eventType: z.string(),
  username: z.string().nullable(),
  amount: z.number().nullable(),
  giftName: z.string().nullable(),
  message: z.string().nullable(),
  simulated: z.boolean().nullable(),
  createdAt: z.string(),
});
export type EventRow = z.infer<typeof eventRowSchema>;

export const accountSummarySchema = z.object({
  platform: z.enum(CONNECTABLE_PLATFORMS),
  channelName: z.string().nullable(),
  status: connectorStatusSchema,
  lastError: z.string().nullable(),
  /** Twitch y Kick llegan por webhook; YouTube y TikTok por el agente. */
  via: z.enum(['webhook', 'agent']),
  connected: z.boolean(),
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

/**
 * Ajustes del panel.
 *
 * Se guardan como pares clave/valor en D1, pero salen y entran como un objeto
 * cerrado: así el compilador conoce las claves que existen y añadir una obliga
 * a tocar este esquema, en vez de que aparezcan cadenas sueltas repartidas por
 * las vistas.
 *
 * Todos los campos tienen valor por defecto a propósito. Una instalación nueva
 * no tiene ninguna fila en `settings`, y el panel debe funcionar igual desde el
 * primer arranque sin tener que sembrar nada.
 */
export const settingsSchema = z.object({
  coinsLabel: z.string().min(1).max(24).default('MonaCoins'),
  pointsLabel: z.string().min(1).max(24).default('MonaPoints'),
  /** Zona IANA. Solo afecta a cómo se muestran las fechas, nunca a cómo se guardan. */
  timezone: z.string().min(1).max(64).default('Europe/Madrid'),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export const counterSummarySchema = z.object({
  key: z.string(),
  value: z.number(),
  label: z.string().nullable(),
});
export type CounterSummary = z.infer<typeof counterSummarySchema>;

export const widgetDraftSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(WIDGET_KINDS),
  box: z.object({
    xPercent: z.number().min(0).max(100),
    yPercent: z.number().min(0).max(100),
    widthPercent: z.number().min(1).max(100),
    heightPercent: z.number().min(1).max(100),
  }),
  style: z
    .object({
      accentColor: z.string().max(30).optional(),
      fontFamily: z.string().max(60).optional(),
      fontSizePx: z.number().int().min(8).max(200).optional(),
      align: z.enum(['start', 'center', 'end']).optional(),
    })
    .optional(),
  binding: z.string().max(40).optional(),
  text: z.string().max(200).optional(),
  imageUrl: z.string().max(500).optional(),
  visible: z.boolean().default(true),
});

export const layoutDraftSchema = z.object({
  name: z.string().min(1).max(80),
  widgets: z.array(widgetDraftSchema).max(40),
});
export type LayoutDraft = z.infer<typeof layoutDraftSchema>;

export const soundSummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  url: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export type SoundSummary = z.infer<typeof soundSummarySchema>;
