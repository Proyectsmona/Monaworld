/**
 * Contadores: metas, monedas internas y temporizador.
 *
 * MonaCoins y MonaPoints son moneda interna sin valor fuera de MonaWorld. No
 * representan ni sustituyen créditos de ninguna plataforma, que es justo lo que
 * mantiene el proyecto dentro de sus términos de servicio.
 */

export type CounterKey = string;
export type CounterTotals = Readonly<Record<CounterKey, number>>;

export const RESERVED_COUNTERS = {
  coins: 'monacoins',
  points: 'monopoints',
  timer: 'timer',
} as const;

/** Aplica un conjunto de deltas y devuelve el estado nuevo, sin mutar el previo. */
export function applyDeltas(
  totals: CounterTotals,
  deltas: ReadonlyMap<CounterKey, number>,
): CounterTotals {
  if (deltas.size === 0) return totals;

  const next: Record<CounterKey, number> = { ...totals };
  for (const [key, delta] of deltas) {
    next[key] = round(clampToZero((next[key] ?? 0) + delta));
  }
  return next;
}

/**
 * El temporizador nunca baja de cero: un subatón en negativo no significa nada
 * y rompe el formato de la cuenta atrás en el overlay.
 */
const clampToZero = (value: number): number => (value < 0 ? 0 : value);

/** Evita que las sumas fraccionarias arrastren error de coma flotante. */
const round = (value: number): number => Math.round(value * 100) / 100;

export function formatTimer(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
