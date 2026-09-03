import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { users } from '@monaworld/db';
import { credentialsSchema } from '@monaworld/contracts';
import type { WorkerEnv } from '../../env.js';
import type { AppVariables } from '../container.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import {
  SESSION_COOKIE,
  buildClearCookie,
  buildSessionCookie,
  createSession,
  destroySession,
  readCookie,
} from '../../auth/session.js';
import { isSecureRequest, requireSession } from '../middleware.js';

type Env = { Bindings: WorkerEnv; Variables: AppVariables };

export const authRoutes = new Hono<Env>()
  /** Indica si hay que crear la primera cuenta o ya existe. */
  .get('/status', async (c) => {
    const rows = await drizzle(c.env.DB).select({ id: users.id }).from(users).limit(1);
    return c.json({ needsBootstrap: rows.length === 0 });
  })

  /**
   * Alta inicial. Solo funciona mientras no exista ningún usuario: es la forma
   * de crear la cuenta sin dejar credenciales escritas en el repositorio, que
   * es justo lo que hacía el prototipo.
   */
  .post('/bootstrap', async (c) => {
    const db = drizzle(c.env.DB);
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) {
      return c.json({ error: 'Ya existe una cuenta. Inicia sesión.' }, 409);
    }

    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'Usuario mínimo 3 caracteres, contraseña mínimo 10.' }, 400);
    }

    const [created] = await db
      .insert(users)
      .values({
        username: parsed.data.username,
        passwordHash: await hashPassword(parsed.data.password),
        role: 'ADMIN',
      })
      .returning({ id: users.id });

    const sessionId = await createSession(c.env, created!.id);
    c.header('Set-Cookie', buildSessionCookie(sessionId, isSecureRequest(c.req.url)));
    return c.json({ ok: true, username: parsed.data.username });
  })

  .post('/login', async (c) => {
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => ({})));
    // Mismo mensaje para usuario inexistente y contraseña incorrecta: no hay
    // por qué confirmar a nadie qué nombres de usuario existen.
    const rejection = () => c.json({ error: 'Credenciales incorrectas' }, 401);
    if (!parsed.success) return rejection();

    const [row] = await drizzle(c.env.DB)
      .select()
      .from(users)
      .where(eq(users.username, parsed.data.username))
      .limit(1);

    if (!row || !(await verifyPassword(parsed.data.password, row.passwordHash))) {
      return rejection();
    }

    const sessionId = await createSession(c.env, row.id);
    c.header('Set-Cookie', buildSessionCookie(sessionId, isSecureRequest(c.req.url)));
    return c.json({ ok: true, user: { id: row.id, username: row.username, role: row.role } });
  })

  .post('/logout', async (c) => {
    const sessionId = readCookie(c.req.header('Cookie') ?? null, SESSION_COOKIE);
    if (sessionId) await destroySession(c.env, sessionId);
    c.header('Set-Cookie', buildClearCookie(isSecureRequest(c.req.url)));
    return c.json({ ok: true });
  })

  .get('/me', requireSession, (c) => c.json({ user: c.get('user') }));
