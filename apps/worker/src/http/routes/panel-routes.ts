import { Hono } from 'hono';
import {
  createRule,
  deleteRule,
  simulateEvent,
  updateRule,
} from '@monaworld/application';
import {
  layoutDraftSchema,
  ruleDraftSchema,
  simulateRequestSchema,
} from '@monaworld/contracts';
import { clampBox, emptyLayout } from '@monaworld/domain';
import type { WorkerEnv } from '../../env.js';
import type { AppVariables } from '../container.js';
import { readPersistedCounters } from '../../persistence/d1-repositories.js';
import { requireSession, respond } from '../middleware.js';

type Env = { Bindings: WorkerEnv; Variables: AppVariables };

/**
 * Rutas que consume el panel. Todas requieren sesión.
 *
 * La sesión se declara ruta a ruta y NO con un comodín `*`. Este router se
 * monta en `/api`, y un `use('*')` aquí se aplicaría también a `/api/agent` y
 * `/api/connect`, que tienen su propia autenticación: el agente quedaría
 * bloqueado por una sesión de navegador que nunca va a tener.
 */
const OWNED_PATHS = [
  '/events',
  '/counters',
  '/accounts',
  '/rules',
  '/rules/*',
  '/overlays',
  '/overlays/*',
  '/simulate',
] as const;

export const panelRoutes = new Hono<Env>();

for (const path of OWNED_PATHS) panelRoutes.use(path, requireSession);

panelRoutes
  // ------------------------------------------------------------------ datos
  .get('/events', async (c) => {
    const limit = Number.parseInt(c.req.query('limit') ?? '50', 10);
    const events = await c
      .get('container')
      .events.listRecent(Number.isFinite(limit) ? limit : 50);
    return c.json({ events });
  })

  .get('/counters', async (c) => {
    const container = c.get('container');
    // Los contadores en vivo mandan; los de D1 cubren el arranque en frío.
    const [live, persisted] = await Promise.all([
      container.room.readCounters(),
      readPersistedCounters(c.env.DB),
    ]);

    const merged = persisted.map((row) => ({
      ...row,
      value: live[row.key] ?? row.value,
    }));

    for (const [key, value] of Object.entries(live)) {
      if (!merged.some((m) => m.key === key)) merged.push({ key, value, label: null });
    }

    return c.json({ counters: merged });
  })

  .get('/accounts', async (c) =>
    c.json({ accounts: await c.get('container').accounts.listSummaries() }),
  )

  // ----------------------------------------------------------------- reglas

  .get('/rules', async (c) => c.json({ rules: await c.get('container').rules.listAll() }))

  .post('/rules', async (c) => {
    const parsed = ruleDraftSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'Regla inválida', detail: parsed.error.issues }, 400);
    }
    const result = await createRule(c.get('container').ruleDeps, parsed.data);
    return respond(c, result);
  })

  .put('/rules/:id', async (c) => {
    const parsed = ruleDraftSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'Regla inválida', detail: parsed.error.issues }, 400);
    }
    const result = await updateRule(
      c.get('container').ruleDeps,
      c.req.param('id'),
      parsed.data,
    );
    return respond(c, result);
  })

  .delete('/rules/:id', async (c) => {
    const result = await deleteRule(c.get('container').ruleDeps, c.req.param('id'));
    return respond(c, result);
  })

  // --------------------------------------------------------------- overlays

  .get('/overlays', async (c) => {
    const layouts = await c.get('container').overlays.listAll();
    return c.json({
      overlays: layouts.length > 0 ? layouts : [emptyLayout('default', 'Principal')],
    });
  })

  .put('/overlays/:id', async (c) => {
    const parsed = layoutDraftSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'Layout inválido', detail: parsed.error.issues }, 400);
    }

    const container = c.get('container');
    const id = c.req.param('id');
    const previous = await container.overlays.findById(id);

    const layout = {
      id,
      name: parsed.data.name,
      // Se recorta en el servidor además de en el editor: el cliente no es
      // la autoridad sobre lo que cabe en el lienzo.
      widgets: parsed.data.widgets.map((w) => ({ ...w, box: clampBox(w.box) })),
      version: (previous?.version ?? 0) + 1,
    };

    await container.overlays.save(layout);
    // Los overlays abiertos en OBS se redibujan sin recargar la fuente.
    await container.room.broadcastLayout(layout);

    return c.json({ ok: true, version: layout.version });
  })

  // -------------------------------------------------------------- simulador

  .post('/simulate', async (c) => {
    const parsed = simulateRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'Petición inválida', detail: parsed.error.issues }, 400);
    }
    const result = await simulateEvent(c.get('container').ingest, parsed.data);
    return respond(c, result);
  });
