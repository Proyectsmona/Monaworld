import { Hono } from 'hono';
import { ingestStreamEvent } from '@monaworld/application';
import {
  KICK_PUBLIC_KEY_URL,
  kickNormalizer,
  twitchNormalizer,
  verifyKickRequest,
  verifyTwitchRequest,
} from '@monaworld/connectors';
import type { WorkerEnv } from '../../env.js';
import type { AppVariables } from '../container.js';

type Env = { Bindings: WorkerEnv; Variables: AppVariables };

/**
 * Webhooks de las plataformas que llegan directas al Worker: Twitch y Kick.
 *
 * YouTube y TikTok no están aquí porque no entregan por webhook: necesitan una
 * conexión larga y una IP residencial, así que entran por el agente local.
 *
 * Las dos reglas de oro de este fichero:
 *   1. Verificar la firma SIEMPRE antes de mirar el cuerpo.
 *   2. Responder rápido. La ingesta va en `waitUntil` porque ambas plataformas
 *      reintentan si tardamos, y el reintento trae el mismo id, que la
 *      deduplicación descarta sola.
 */
export const webhookRoutes = new Hono<Env>()

  .post('/twitch', async (c) => {
    const secret = c.env.TWITCH_WEBHOOK_SECRET;
    if (!secret) return c.text('Webhook de Twitch no configurado', 503);

    const body = await c.req.text();
    const envelope = await verifyTwitchRequest(c.req.raw.headers, body, secret);
    if (!envelope.verdict.valid) {
      return c.text(envelope.verdict.reason ?? 'Firma inválida', 403);
    }

    const payload = safeJson(envelope.body) as Record<string, unknown> | null;
    if (!payload) return c.text('Cuerpo ilegible', 400);

    // Twitch confirma la suscripción devolviendo el reto en texto plano.
    if (envelope.messageType === 'webhook_callback_verification') {
      return c.text(String(payload.challenge ?? ''), 200);
    }

    if (envelope.messageType === 'revocation') {
      await c
        .get('container')
        .accounts.setStatus('twitch', 'error', 'Twitch revocó la suscripción');
      return new Response(null, { status: 204 });
    }

    const incoming = twitchNormalizer.normalize(payload as never, {
      nativeId: envelope.messageId,
      receivedAt: new Date().toISOString(),
    });
    if (!incoming) return new Response(null, { status: 204 });

    c.executionCtx.waitUntil(
      ingestStreamEvent(c.get('container').ingest, incoming, 'webhook').then(() => undefined),
    );
    return new Response(null, { status: 204 });
  })

  .post('/kick', async (c) => {
    const body = await c.req.text();

    const publicKey = await fetchKickPublicKey(c.env);
    if (!publicKey) return c.text('No se pudo obtener la clave pública de Kick', 503);

    const envelope = await verifyKickRequest(c.req.raw.headers, body, publicKey);
    if (!envelope.verdict.valid) {
      return c.text(envelope.verdict.reason ?? 'Firma inválida', 403);
    }

    const payload = safeJson(envelope.body) as Record<string, unknown> | null;
    if (!payload) return c.text('Cuerpo ilegible', 400);

    const incoming = kickNormalizer.normalize(
      { eventType: envelope.eventType, payload: payload as never },
      { nativeId: envelope.messageId, receivedAt: new Date().toISOString() },
    );
    if (!incoming) return new Response(null, { status: 204 });

    c.executionCtx.waitUntil(
      ingestStreamEvent(c.get('container').ingest, incoming, 'webhook').then(() => undefined),
    );
    return new Response(null, { status: 204 });
  });

/**
 * La clave pública de Kick cambia muy rara vez, así que se cachea en el borde.
 * Sin caché, cada webhook de chat costaría una petición extra a Kick.
 */
async function fetchKickPublicKey(env: WorkerEnv): Promise<string | null> {
  void env;
  try {
    const response = await fetch(KICK_PUBLIC_KEY_URL, {
      cf: { cacheTtl: 3600, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return null;

    const body = (await response.json()) as { data?: { public_key?: string } };
    return body.data?.public_key ?? null;
  } catch {
    return null;
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
