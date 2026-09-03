import { afterEach, describe, expect, it, vi } from 'vitest';
import { Uplink } from './uplink.ts';
import type { IncomingEvent } from '@monaworld/domain';

const event = (id: string): IncomingEvent => ({
  platform: 'tiktok',
  type: 'gift',
  actor: { platformUserId: 'u1', displayName: 'dizzy', isMod: false, isSubscriber: false },
  value: { rawAmount: 5, rawUnit: 'gift', giftName: 'Rose' },
  occurredAt: new Date().toISOString(),
  dedupeKey: `tiktok:${id}`,
  simulated: false,
});

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('enlace del agente con el Worker', () => {
  it('entrega los eventos en orden', async () => {
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(init.body as string).dedupeKey);
        return new Response('{}', { status: 200 });
      }),
    );

    const uplink = new Uplink({ baseUrl: 'https://x', token: 't' });
    uplink.publish(event('1'));
    uplink.publish(event('2'));
    await flushMicrotasks();

    expect(sent).toEqual(['tiktok:1', 'tiktok:2']);
    expect(uplink.queueSize).toBe(0);
  });

  it('trata un 409 como entregado: el duplicado ya estaba procesado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 409 })));

    const uplink = new Uplink({ baseUrl: 'https://x', token: 't' });
    uplink.publish(event('dup'));
    await flushMicrotasks();

    // Si se reintentara, la cola nunca se vaciaría.
    expect(uplink.queueSize).toBe(0);
  });

  it('conserva el evento cuando se cae la red, en vez de perderlo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));

    const uplink = new Uplink({ baseUrl: 'https://x', token: 't' });
    uplink.publish(event('offline'));
    await flushMicrotasks();

    expect(uplink.queueSize).toBe(1);
    uplink.stop();
  });

  it('reenvía lo pendiente al recuperar la conexión', async () => {
    let online = false;
    const sent: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (!online) throw new Error('sin red');
        sent.push(JSON.parse(init.body as string).dedupeKey);
        return new Response('{}', { status: 200 });
      }),
    );

    const uplink = new Uplink({ baseUrl: 'https://x', token: 't' });
    uplink.publish(event('a'));
    uplink.publish(event('b'));
    await flushMicrotasks();
    expect(uplink.queueSize).toBe(2);

    online = true;
    await uplink.flush();

    expect(sent).toEqual(['tiktok:a', 'tiktok:b']);
    expect(uplink.queueSize).toBe(0);
    uplink.stop();
  });

  it('descarta lo más antiguo cuando la cola se llena: en directo, lo reciente importa más', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('sin red');
    }));

    const uplink = new Uplink({ baseUrl: 'https://x', token: 't', maxQueue: 3 });
    for (const id of ['1', '2', '3', '4']) uplink.publish(event(id));
    await flushMicrotasks();

    expect(uplink.queueSize).toBe(3);
    uplink.stop();
  });

  it('no reintenta un 400: reenviar el mismo cuerpo no lo va a arreglar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));

    const uplink = new Uplink({ baseUrl: 'https://x', token: 't' });
    uplink.publish(event('malformado'));
    await flushMicrotasks();

    expect(uplink.queueSize).toBe(0);
  });
});
