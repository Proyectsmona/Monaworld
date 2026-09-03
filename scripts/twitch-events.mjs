#!/usr/bin/env node
/**
 * Envía eventos de Twitch EventSub firmados de verdad al webhook local.
 *
 * Hace lo mismo que `twitch event trigger` de la CLI oficial —firma con
 * HMAC-SHA256 sobre `messageId + timestamp + cuerpo`— pero sin instalar nada:
 * el secreto se lee de `.dev.vars`.
 *
 *   npm run test:twitch              # tanda completa
 *   npm run test:twitch -- cheer     # un solo tipo
 *   npm run test:twitch -- --bad     # firma manipulada, debe rechazarse
 *
 * Ejercita el camino real completo: verificación de firma, normalizador,
 * motor de reglas, cola de alertas y difusión al overlay.
 */

import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.env.MW_WEBHOOK_URL ?? 'http://127.0.0.1:8787/webhooks/twitch';

function readDevVars() {
  try {
    const raw = readFileSync(join(root, '.dev.vars'), 'utf8');
    return Object.fromEntries(
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const index = line.indexOf('=');
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}

const secret = process.env.TWITCH_WEBHOOK_SECRET ?? readDevVars().TWITCH_WEBHOOK_SECRET;

if (!secret) {
  console.error('\nFalta TWITCH_WEBHOOK_SECRET en .dev.vars.\n');
  process.exit(1);
}

const viewer = { id: '55512345', login: 'espectador_demo', name: 'EspectadorDemo' };

/** Cuerpos con la forma exacta que entrega Twitch. */
const EVENTS = {
  follow: {
    type: 'channel.follow',
    version: '2',
    event: {
      user_id: viewer.id,
      user_login: viewer.login,
      user_name: viewer.name,
      broadcaster_user_id: '1',
      followed_at: new Date().toISOString(),
    },
  },
  subscribe: {
    type: 'channel.subscribe',
    version: '1',
    event: {
      user_id: viewer.id,
      user_name: viewer.name,
      broadcaster_user_id: '1',
      tier: '2000',
      is_gift: false,
    },
  },
  resub: {
    type: 'channel.subscription.message',
    version: '1',
    event: {
      user_id: viewer.id,
      user_name: viewer.name,
      broadcaster_user_id: '1',
      tier: '1000',
      cumulative_months: 14,
      streak_months: 3,
      message: { text: '¡Catorce meses ya, Mona!' },
    },
  },
  giftsub: {
    type: 'channel.subscription.gift',
    version: '1',
    event: {
      user_id: viewer.id,
      user_name: viewer.name,
      broadcaster_user_id: '1',
      total: 5,
      tier: '1000',
      is_anonymous: false,
    },
  },
  cheer: {
    type: 'channel.cheer',
    version: '1',
    event: {
      user_id: viewer.id,
      user_name: viewer.name,
      broadcaster_user_id: '1',
      bits: 500,
      message: 'cheer500 ¡vamos!',
      is_anonymous: false,
    },
  },
  raid: {
    type: 'channel.raid',
    version: '1',
    event: {
      from_broadcaster_user_id: '99911',
      from_broadcaster_user_name: 'OtraStreamer',
      to_broadcaster_user_id: '1',
      viewers: 42,
    },
  },
  chat: {
    type: 'channel.chat.message',
    version: '1',
    event: {
      broadcaster_user_id: '1',
      chatter_user_id: viewer.id,
      chatter_user_name: viewer.name,
      message_id: randomUUID(),
      message: { text: 'hola mona, probando el chat' },
      badges: [{ set_id: 'subscriber', id: '12', info: '12' }],
    },
  },
};

async function send(name, { tamper = false } = {}) {
  const body = EVENTS[name];
  if (!body) {
    console.error(`Evento desconocido: ${name}`);
    console.error(`Disponibles: ${Object.keys(EVENTS).join(', ')}`);
    process.exit(1);
  }

  const messageId = randomUUID();
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({
    subscription: {
      id: randomUUID(),
      type: body.type,
      version: body.version,
      status: 'enabled',
      condition: { broadcaster_user_id: '1' },
    },
    event: body.event,
  });

  let signature =
    'sha256=' + createHmac('sha256', secret).update(messageId + timestamp + payload).digest('hex');
  if (tamper) signature = signature.slice(0, -4) + 'dead';

  const response = await fetch(TARGET, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Twitch-Eventsub-Message-Id': messageId,
      'Twitch-Eventsub-Message-Timestamp': timestamp,
      'Twitch-Eventsub-Message-Signature': signature,
      'Twitch-Eventsub-Message-Type': 'notification',
      'Twitch-Eventsub-Subscription-Type': body.type,
    },
    body: payload,
  });

  const detail = response.status === 204 ? '' : ` · ${(await response.text()).trim().slice(0, 60)}`;
  const expected = tamper ? 403 : 204;
  const mark = response.status === expected ? '✓' : '✗';

  console.log(`  ${mark} ${name.padEnd(10)} ${body.type.padEnd(32)} HTTP ${response.status}${detail}`);
  return response.status === expected;
}

async function main() {
  const args = process.argv.slice(2);
  const tamper = args.includes('--bad');
  const names = args.filter((a) => !a.startsWith('--'));

  console.log(`\nMonaWorld · eventos de Twitch firmados → ${TARGET}\n`);

  if (tamper) {
    console.log('  Modo firma manipulada: se espera 403 en todos.\n');
  }

  const targets = names.length > 0 ? names : Object.keys(EVENTS);
  let ok = 0;

  for (const name of targets) {
    // Una pausa corta deja ver las alertas salir una a una en el overlay.
    if (await send(name, { tamper })) ok++;
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n  ${ok}/${targets.length} como se esperaba\n`);
  process.exit(ok === targets.length ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nNo se pudo contactar con ${TARGET}`);
  console.error(`${error.message}\n¿Está corriendo "npm run dev"?\n`);
  process.exit(1);
});
