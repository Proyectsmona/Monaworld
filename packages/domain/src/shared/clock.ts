/**
 * El tiempo y la aleatoriedad son efectos: entran por parámetro para que la
 * lógica de dominio sea determinista en los tests. Un cooldown se prueba
 * avanzando el reloj, no esperando diez segundos.
 */
export interface Clock {
  now(): number;
}

export interface IdGenerator {
  next(): string;
}

export const systemClock: Clock = { now: () => Date.now() };

export const uuidGenerator: IdGenerator = { next: () => crypto.randomUUID() };

/** Reloj controlable, para tests. */
export function fixedClock(start = 0): Clock & { advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}
