import { Hono } from 'hono';
import type { WorkerEnv } from '../../env.js';
import type { AppVariables } from '../container.js';
import { CHANNEL_NAME } from '../../env.js';
import { timingSafeEqual } from '../../auth/password.js';
import { SESSION_COOKIE, readCookie, resolveSession } from '../../auth/session.js';

type Env = { Bindings: WorkerEnv; Variables: AppVariables };

/**
 * Puerta de entrada al WebSocket de la sala.
 *
 * Dos formas de autenticar, a propósito: el panel usa tu sesión, y los overlays
 * un token aparte. La URL de un overlay acaba visible al configurar OBS y en
 * cualquier clip de «mi setup», así que no puede llevar tu sesión dentro.
 */
export const realtimeRoutes = new Hono<Env>().get('/:channel/ws', async (c) => {
  const role = c.req.query('role') === 'panel' ? 'panel' : 'overlay';

  if (role === 'panel') {
    const sessionId = readCookie(c.req.header('Cookie') ?? null, SESSION_COOKIE);
    const user = sessionId ? await resolveSession(c.env, sessionId) : null;
    if (!user) return c.text('No autenticado', 401);
  } else {
    const token = c.req.query('t') ?? '';
    if (!c.env.OVERLAY_TOKEN || !timingSafeEqual(token, c.env.OVERLAY_TOKEN)) {
      return c.text('Token de overlay inválido', 403);
    }
  }

  const namespace = c.env.OVERLAY_ROOM;
  const stub = namespace.get(namespace.idFromName(CHANNEL_NAME));

  const url = new URL(c.req.url);
  url.pathname = '/ws';
  url.searchParams.set('role', role);

  return stub.fetch(new Request(url, c.req.raw));
});
