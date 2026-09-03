import { createMiddleware } from 'hono/factory';
import type { DomainError, Result } from '@monaworld/domain';
import type { WorkerEnv } from '../env.js';
import { buildContainer, type AppVariables } from './container.js';
import { SESSION_COOKIE, readCookie, resolveSession } from '../auth/session.js';
import { timingSafeEqual } from '../auth/password.js';

type Env = { Bindings: WorkerEnv; Variables: AppVariables };

/** Construye el contenedor una vez por petición y lo deja en el contexto. */
export const withContainer = createMiddleware<Env>(async (c, next) => {
  c.set('container', buildContainer(c.env));
  await next();
});

/** Exige sesión válida. Todo lo que hay bajo /api salvo login y estado. */
export const requireSession = createMiddleware<Env>(async (c, next) => {
  const sessionId = readCookie(c.req.header('Cookie') ?? null, SESSION_COOKIE);
  const user = sessionId ? await resolveSession(c.env, sessionId) : null;

  if (!user) return c.json({ error: 'No autenticado' }, 401);

  c.set('user', user);
  await next();
});

/**
 * Exige el token del agente local. Es distinto de la sesión del panel a
 * propósito: se puede rotar sin cerrar tu sesión, y al revés.
 */
export const requireAgentToken = createMiddleware<Env>(async (c, next) => {
  const provided = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expected = c.env.AGENT_TOKEN;

  if (!expected || !timingSafeEqual(provided, expected)) {
    return c.json({ error: 'Token de agente inválido' }, 401);
  }

  await next();
});

export const isSecureRequest = (url: string): boolean =>
  new URL(url).protocol === 'https:';

/** Traduce un error de dominio al código HTTP que le corresponde. */
const STATUS_BY_CODE: Record<DomainError['code'], 400 | 401 | 404 | 409> = {
  invalid_event: 400,
  invalid_rule: 400,
  duplicate_event: 409,
  rule_not_found: 404,
  account_not_connected: 404,
  unauthorized: 401,
};

export function statusFor(error: DomainError): 400 | 401 | 404 | 409 {
  return STATUS_BY_CODE[error.code] ?? 400;
}

/** Desempaqueta un `Result` de dominio en una respuesta JSON. */
export function respond<T>(
  c: { json: (body: unknown, status?: number) => Response },
  result: Result<T>,
): Response {
  if (result.ok) return c.json({ ok: true, ...result.value });
  return c.json(
    { ok: false, error: result.error.message, code: result.error.code },
    statusFor(result.error),
  );
}
