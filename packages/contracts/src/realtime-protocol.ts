import { z } from 'zod';
import { PLATFORMS, WIDGET_KINDS } from '@monaworld/domain';
import { streamEventSchema } from './event-schemas.js';
import { actionSchema } from './rule-schemas.js';

/**
 * Protocolo de la sala en tiempo real.
 *
 * Tres participantes hablan por aquí: el overlay dentro de OBS, el panel del
 * streamer y el agente local. Cada mensaje lleva un discriminante `t` corto
 * porque estos van por WebSocket muchas veces por segundo durante un directo.
 */

export const connectorStatusSchema = z.enum(['online', 'offline', 'error']);
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>;

export const alertPayloadSchema = z.object({
  t: z.literal('alert'),
  id: z.string(),
  widget: z.string(),
  text: z.string(),
  durationMs: z.number(),
  soundUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  platform: z.enum(PLATFORMS),
  avatarUrl: z.string().optional(),
});

export const serverMessageSchema = z.discriminatedUnion('t', [
  alertPayloadSchema,
  z.object({
    t: z.literal('state'),
    counters: z.record(z.string(), z.number()),
    timerSeconds: z.number(),
    queueDepth: z.number().default(0),
  }),
  /** Evento en crudo: lo consumen el historial y el multi-chat del panel. */
  z.object({ t: z.literal('event'), event: streamEventSchema }),
  z.object({
    t: z.literal('connectors'),
    status: z.record(z.string(), connectorStatusSchema),
  }),
  /** Cambió el layout: el overlay se redibuja sin recargar la fuente en OBS. */
  z.object({
    t: z.literal('layout'),
    widgets: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(WIDGET_KINDS),
        box: z.object({
          xPercent: z.number(),
          yPercent: z.number(),
          widthPercent: z.number(),
          heightPercent: z.number(),
        }),
        style: z
          .object({
            accentColor: z.string().optional(),
            fontFamily: z.string().optional(),
            fontSizePx: z.number().optional(),
            align: z.enum(['start', 'center', 'end']).optional(),
          })
          .optional(),
        binding: z.string().optional(),
        text: z.string().optional(),
        imageUrl: z.string().optional(),
        visible: z.boolean(),
      }),
    ),
    version: z.number(),
  }),
  z.object({ t: z.literal('clear') }),
  z.object({ t: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type AlertMessage = z.infer<typeof alertPayloadSchema>;

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), role: z.enum(['overlay', 'panel']) }),
  z.object({ t: z.literal('ping') }),
  /** El overlay avisa de que terminó de pintar: sale la siguiente de la cola. */
  z.object({ t: z.literal('alertDone'), id: z.string() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/**
 * Enlace del agente local con el Worker. El agente sube eventos por HTTP y
 * recibe órdenes por este canal: es la única forma de que el Worker toque OBS.
 */
export const agentCommandSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('obs'), action: actionSchema }),
  z.object({ t: z.literal('reconnect'), platform: z.enum(['youtube', 'tiktok']) }),
  z.object({ t: z.literal('pong') }),
]);
export type AgentCommand = z.infer<typeof agentCommandSchema>;

export const agentReportSchema = z.object({
  platform: z.enum(['youtube', 'tiktok']),
  status: connectorStatusSchema,
  detail: z.string().max(300).optional(),
});
export type AgentReport = z.infer<typeof agentReportSchema>;
