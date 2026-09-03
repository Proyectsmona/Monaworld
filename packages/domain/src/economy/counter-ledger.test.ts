import { describe, expect, it } from 'vitest';
import { applyDeltas, formatTimer } from './counter-ledger.js';

describe('contadores', () => {
  it('aplica deltas sin mutar el estado anterior', () => {
    const before = { monacoins: 100 };
    const after = applyDeltas(before, new Map([['monacoins', 50]]));

    expect(after.monacoins).toBe(150);
    expect(before.monacoins).toBe(100);
  });

  it('crea el contador si no existía', () => {
    expect(applyDeltas({}, new Map([['nuevo', 7]])).nuevo).toBe(7);
  });

  it('nunca baja de cero: un subatón en negativo no significa nada', () => {
    expect(applyDeltas({ timer: 30 }, new Map([['timer', -100]])).timer).toBe(0);
  });

  it('no arrastra error de coma flotante al sumar fracciones', () => {
    let totals = applyDeltas({}, new Map([['x', 0.1]]));
    totals = applyDeltas(totals, new Map([['x', 0.2]]));
    expect(totals.x).toBe(0.3);
  });

  it('devuelve el mismo objeto si no hay nada que aplicar', () => {
    const totals = { a: 1 };
    expect(applyDeltas(totals, new Map())).toBe(totals);
  });

  it('formatea el temporizador con y sin horas', () => {
    expect(formatTimer(75)).toBe('01:15');
    expect(formatTimer(3675)).toBe('01:01:15');
    expect(formatTimer(-5)).toBe('00:00');
  });
});
