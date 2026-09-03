import { describe, expect, it } from 'vitest';
import {
  ALERT_GRACE_MS,
  EMPTY_QUEUE,
  MAX_PENDING,
  complete,
  enqueue,
  expire,
  queueDepth,
  type AlertQueueState,
  type PendingAlert,
} from './alert-queue.js';

const alert = (id: string, durationMs = 5000): PendingAlert => ({
  id,
  widget: 'alert',
  text: `alerta ${id}`,
  durationMs,
  platform: 'tiktok',
});

describe('cola de alertas', () => {
  it('la primera alerta sale de inmediato', () => {
    const t = enqueue(EMPTY_QUEUE, alert('a'), 1000);

    expect(t.broadcast?.id).toBe('a');
    expect(t.state.playing?.id).toBe('a');
    expect(t.state.pending).toHaveLength(0);
    expect(t.alarmAt).toBe(1000 + 5000 + ALERT_GRACE_MS);
  });

  it('la segunda espera: no se difunden dos a la vez', () => {
    const first = enqueue(EMPTY_QUEUE, alert('a'), 0);
    const second = enqueue(first.state, alert('b'), 100);

    expect(second.broadcast).toBeNull();
    expect(second.state.playing?.id).toBe('a');
    expect(second.state.pending.map((p) => p.id)).toEqual(['b']);
  });

  it('al confirmar el overlay sale la siguiente', () => {
    let state: AlertQueueState = enqueue(EMPTY_QUEUE, alert('a'), 0).state;
    state = enqueue(state, alert('b'), 10).state;

    const done = complete(state, 'a', 5000);

    expect(done.broadcast?.id).toBe('b');
    expect(done.state.playing?.id).toBe('b');
    expect(done.state.pending).toHaveLength(0);
  });

  it('ignora la confirmación de una alerta que ya no está en pantalla', () => {
    const state = enqueue(EMPTY_QUEUE, alert('a'), 0).state;
    const stray = complete(state, 'otra', 100);

    expect(stray.broadcast).toBeNull();
    expect(stray.state.playing?.id).toBe('a');
  });

  it('si OBS no confirma, la cola avanza al vencer el plazo', () => {
    let state = enqueue(EMPTY_QUEUE, alert('a', 4000), 0).state;
    state = enqueue(state, alert('b'), 10).state;

    // Antes del plazo no se mueve.
    const tooSoon = expire(state, 2000);
    expect(tooSoon.broadcast).toBeNull();
    expect(tooSoon.state.playing?.id).toBe('a');

    // Pasado el plazo, avanza sin confirmación.
    const after = expire(state, 4000 + ALERT_GRACE_MS + 1);
    expect(after.broadcast?.id).toBe('b');
  });

  it('al vaciarse deja de pedir alarma', () => {
    const state = enqueue(EMPTY_QUEUE, alert('a'), 0).state;
    const done = complete(state, 'a', 100);

    expect(done.state.playing).toBeNull();
    expect(done.broadcast).toBeNull();
    expect(done.alarmAt).toBeNull();
  });

  it('descarta cuando la cola está llena: en una avalancha, encolar sin fin es peor', () => {
    let state = enqueue(EMPTY_QUEUE, alert('playing'), 0).state;
    for (let i = 0; i < MAX_PENDING; i++) {
      state = enqueue(state, alert(`p${i}`), 0).state;
    }
    expect(state.pending).toHaveLength(MAX_PENDING);

    const overflow = enqueue(state, alert('descartada'), 0);
    expect(overflow.state.pending).toHaveLength(MAX_PENDING);
    expect(overflow.state.pending.some((p) => p.id === 'descartada')).toBe(false);
  });

  it('respeta el orden de llegada', () => {
    let state = enqueue(EMPTY_QUEUE, alert('1'), 0).state;
    state = enqueue(state, alert('2'), 0).state;
    state = enqueue(state, alert('3'), 0).state;

    const salidas: string[] = [];
    let cursor = state;
    for (let i = 0; i < 3; i++) {
      const t = complete(cursor, cursor.playing!.id, 0);
      if (t.broadcast) salidas.push(t.broadcast.id);
      cursor = t.state;
    }

    expect(salidas).toEqual(['2', '3']);
  });

  it('cuenta la profundidad incluyendo la que está en pantalla', () => {
    let state = enqueue(EMPTY_QUEUE, alert('a'), 0).state;
    state = enqueue(state, alert('b'), 0).state;
    expect(queueDepth(state)).toBe(2);
  });
});
