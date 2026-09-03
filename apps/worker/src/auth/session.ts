import { eq, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { sessions, users } from '@monaworld/db';
import type { SessionUser } from '@monaworld/contracts';
import type { WorkerEnv } from '../env.js';

/**
 * Sesiones en base de datos con cookie HttpOnly.
 *
 * Se prefieren a un JWT porque son revocables: cerrar sesión desde el panel
 * invalida de verdad, sin esperar a que caduque un token firmado.
 */

export const SESSION_COOKIE = 'mw_session';
const LIFETIME_DAYS = 30;
const LIFETIME_MS = LIFETIME_DAYS * 24 * 60 * 60 * 1000;

export async function createSession(env: WorkerEnv, userId: number): Promise<string> {
  const db = drizzle(env.DB);
  const id = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  await db.insert(sessions).values({ id, userId, expiresAt: Date.now() + LIFETIME_MS });

  // Limpieza oportunista: evita que la tabla crezca sin fin sin necesitar cron.
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));
  return id;
}

export async function resolveSession(
  env: WorkerEnv,
  sessionId: string,
): Promise<SessionUser | null> {
  const db = drizzle(env.DB);
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  return { id: row.id, username: row.username, role: row.role };
}

export async function destroySession(env: WorkerEnv, sessionId: string): Promise<void> {
  await drizzle(env.DB).delete(sessions).where(eq(sessions.id, sessionId));
}

export function buildSessionCookie(id: string, secure: boolean): string {
  return cookie(`${SESSION_COOKIE}=${id}`, secure, LIFETIME_DAYS * 24 * 60 * 60);
}

export function buildClearCookie(secure: boolean): string {
  return cookie(`${SESSION_COOKIE}=`, secure, 0);
}

function cookie(pair: string, secure: boolean, maxAge: number): string {
  return [pair, 'Path=/', 'HttpOnly', 'SameSite=Lax', secure ? 'Secure' : '', `Max-Age=${maxAge}`]
    .filter(Boolean)
    .join('; ');
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}
