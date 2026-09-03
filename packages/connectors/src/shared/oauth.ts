/**
 * Piezas comunes de OAuth para los conectores.
 *
 * MonaWorld solo lee: en ninguna plataforma se pide un scope que permita
 * publicar, moderar o modificar la cuenta. Si un permiso deja escribir, no se
 * pide — es la regla que mantiene el proyecto del lado correcto de los
 * términos de servicio.
 */

export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  /** Marca de tiempo absoluta, no «segundos restantes»: sobrevive al reinicio. */
  readonly expiresAt: number | null;
  readonly scope?: string;
}

export interface TokenExchangeError {
  readonly error: string;
  readonly description?: string;
}

/** Verificador y desafío PKCE (S256), como exige OAuth 2.1. */
export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

const base64UrlEncode = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function randomToken(bytes = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomToken(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(digest) };
}

/**
 * Intercambia un código por tokens. Devuelve `null` en vez de lanzar: un
 * fallo aquí es casi siempre culpa del usuario (canceló, tardó demasiado) y el
 * llamante quiere enseñarle un mensaje, no una traza.
 */
export async function exchangeCode(
  tokenUrl: string,
  params: Record<string, string>,
): Promise<OAuthTokens | TokenExchangeError> {
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      return {
        error: String(body.error ?? `HTTP ${response.status}`),
        description: typeof body.error_description === 'string' ? body.error_description : undefined,
      };
    }

    return toTokens(body);
  } catch (error) {
    return { error: 'network_error', description: (error as Error).message };
  }
}

export function isTokenError(value: OAuthTokens | TokenExchangeError): value is TokenExchangeError {
  return 'error' in value;
}

export function toTokens(body: Record<string, unknown>): OAuthTokens {
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null;
  return {
    accessToken: String(body.access_token ?? ''),
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
    scope: typeof body.scope === 'string' ? body.scope : undefined,
  };
}

/** Un token se considera caducado un minuto antes, para no apurar. */
export function isExpired(expiresAt: number | null, skewMs = 60_000): boolean {
  return expiresAt !== null && Date.now() >= expiresAt - skewMs;
}

export function buildAuthorizeUrl(
  base: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
