import { Hono } from 'hono';
import type { WorkerEnv } from './env.js';
import type { AppVariables } from './http/container.js';
import { withContainer } from './http/middleware.js';
import { authRoutes } from './http/routes/auth-routes.js';
import { panelRoutes } from './http/routes/panel-routes.js';
import { webhookRoutes } from './http/routes/webhook-routes.js';
import { agentRoutes } from './http/routes/agent-routes.js';
import { connectRoutes } from './http/routes/connect-routes.js';
import { realtimeRoutes } from './http/routes/realtime-routes.js';

/**
 * Punto de entrada del Worker: monta las rutas y sirve los assets.
 *
 * Este fichero no contiene lógica de negocio a propósito. Es el adaptador más
 * externo del hexágono: recibe HTTP, delega en un caso de uso y devuelve HTTP.
 * Si algo aquí empieza a decidir reglas, va en el sitio equivocado.
 */

// El Durable Object se reexporta con su nombre de clase original: es el que la
// migración `v1` ya aplicó en el Worker desplegado y renombrarlo obligaría a
// una migración `renamed_classes` sin ganancia funcional.
export { OverlayRoom } from './realtime/overlay-room.js';

type Env = { Bindings: WorkerEnv; Variables: AppVariables };

const app = new Hono<Env>();

app.use('*', withContainer);

app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'MonaWorld', version: 7, architecture: 'hexagonal' }),
);

app.route('/api/auth', authRoutes);
app.route('/api', panelRoutes);
app.route('/api/agent', agentRoutes);
app.route('/api/connect', connectRoutes);
app.route('/webhooks', webhookRoutes);
app.route('/room', realtimeRoutes);

// Cualquier otra ruta es un fichero estático: el panel en la raíz y el overlay
// bajo /overlay. Las rutas de arriba mandan gracias a `run_worker_first`.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<WorkerEnv>;
