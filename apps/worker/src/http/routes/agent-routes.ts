import { Hono } from 'hono';
import { ingestStreamEvent } from '@monaworld/application';
import { tiktokNormalizer, youtubeNormalizer } from '@monaworld/connectors';
import { agentReportSchema, incomingEventSchema } from '@monaworld/contracts';
import type { WorkerEnv } from '../../env.js';
import type { AppVariables } from '../container.js';
import { requireAgentToken, respond } from '../middleware.js';

type Env = { Bindings: WorkerEnv; Variables: AppVariables };

/**
 * Enlace del agente local.
 *
 * El agente puede subir eventos ya normalizados (lo normal, porque comparte los
 * normalizadores del monorepo) o crudos, por si conviene depurar contra la
 * forma nativa sin desplegar el agente.
 */
export const agentRoutes = new Hono<Env>()
  .use('*', requireAgentToken)

  /** Evento ya normalizado por el agente. */
  .post('/events', async (c) => {
    const parsed = incomingEventSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Evento inválido', detail: parsed.error.issues }, 400);
    }
    const result = await ingestStreamEvent(c.get('container').ingest, parsed.data, 'agent');
    return respond(c, result);
  })

  /** Evento crudo: el Worker lo normaliza con el mismo código que el agente. */
  .post('/raw/:platform', async (c) => {
    const platform = c.req.param('platform');
    const native = await c.req.json().catch(() => null);
    if (!native) return c.json({ error: 'Cuerpo ilegible' }, 400);

    const context = {
      nativeId: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
    };

    const incoming =
      platform === 'tiktok'
        ? tiktokNormalizer.normalize(native, context)
        : platform === 'youtube'
          ? youtubeNormalizer.normalize(native, context)
          : null;

    if (!incoming) return c.json({ ok: false, reason: 'sin evento que ingestar' }, 202);

    const result = await ingestStreamEvent(c.get('container').ingest, incoming, 'agent');
    return respond(c, result);
  })

  /** Latido y estado de los conectores que gestiona el agente. */
  .post('/status', async (c) => {
    const parsed = agentReportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Informe inválido' }, 400);

    const container = c.get('container');
    await container.accounts.setStatus(
      parsed.data.platform,
      parsed.data.status,
      parsed.data.detail,
    );

    const summaries = await container.accounts.listSummaries();
    await container.room.broadcastConnectorStatus(
      Object.fromEntries(summaries.map((s) => [s.platform, s.status])),
    );

    return c.json({ ok: true });
  });
