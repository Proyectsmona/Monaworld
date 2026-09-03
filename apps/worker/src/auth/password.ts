/**
 * Hash de contraseña con PBKDF2-SHA256 vía WebCrypto.
 *
 * PBKDF2 es lo que Workers ofrece de forma nativa: Argon2 exigiría cargar un
 * módulo WASM en cada arranque en frío. Suficiente para una aplicación de un
 * solo usuario.
 *
 * El tope de 100.000 iteraciones no es una elección: es el máximo que acepta
 * `crypto.subtle` en Workers. Pedir más —OWASP recomienda 210.000 para
 * PBKDF2-SHA256— falla en ejecución con `NotSupportedError`, y solo en
 * producción, porque el runtime local no impone el límite.
 */

const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return toHex(bits);
}

/** Formato almacenado: `pbkdf2$<iteraciones>$<salt hex>$<hash hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer)}$${await derive(password, salt, ITERATIONS)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltHex, expected] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltHex || !expected) return false;

  // Las iteraciones se leen del propio hash, no de la constante: así cambiarla
  // no invalida las contraseñas ya guardadas con el valor anterior.
  const iterations = Number.parseInt(iterationsRaw ?? '', 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  return timingSafeEqual(await derive(password, fromHex(saltHex), iterations), expected);
}

/** Comparación en tiempo constante: no filtra el hash por temporización. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
