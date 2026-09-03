import {
  buildAuthorizeUrl,
  exchangeCode,
  type OAuthTokens,
  type TokenExchangeError,
} from '../shared/oauth.js';
import { KICK_SUBSCRIPTIONS } from './kick-normalizer.js';

/**
 * Alta de Kick: OAuth 2.1 con PKCE y suscripción a webhooks.
 *
 * A diferencia de Twitch, Kick exige PKCE (`code_challenge_method=S256`) y
 * usa el token del propio usuario para crear las suscripciones, no un token
 * de aplicación.
 */

const AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';
const TOKEN_URL = 'https://id.kick.com/oauth/token';
const REVOKE_URL = 'https://id.kick.com/oauth/revoke';
const API = 'https://api.kick.com/public/v1';

/**
 * Solo lectura más la capacidad de suscribirse a eventos. `chat:write` y
 * `channel:write` existen y NO se piden: MonaWorld nunca publica.
 */
export const KICK_SCOPES = ['user:read', 'channel:read', 'events:subscribe'] as const;

export interface KickCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export function kickAuthorizeUrl(
  credentials: KickCredentials,
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string {
  return buildAuthorizeUrl(AUTHORIZE_URL, {
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: KICK_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

export function exchangeKickCode(
  credentials: KickCredentials,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<OAuthTokens | TokenExchangeError> {
  return exchangeCode(TOKEN_URL, {
    grant_type: 'authorization_code',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    code,
  });
}

export function refreshKickToken(
  credentials: KickCredentials,
  refreshToken: string,
): Promise<OAuthTokens | TokenExchangeError> {
  return exchangeCode(TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
  });
}

export interface KickChannel {
  readonly userId: string;
  readonly slug: string;
}

/** Identidad del streamer que acaba de autorizar. */
export async function getKickChannel(accessToken: string): Promise<KickChannel | null> {
  const response = await fetch(`${API}/channels`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!response.ok) return null;

  const body = (await response.json()) as {
    data?: Array<{ broadcaster_user_id?: number | string; slug?: string }>;
  };
  const channel = body.data?.[0];
  if (!channel) return null;

  return {
    userId: String(channel.broadcaster_user_id ?? ''),
    slug: channel.slug ?? '',
  };
}

export interface KickSubscriptionReport {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * Crea las suscripciones de webhook.
 *
 * Kick acepta la lista completa en una sola llamada, pero se informa por
 * evento para poder decirle al streamer exactamente cuál falló si su cuenta
 * no tiene permisos para alguno.
 */
export async function createKickSubscriptions(
  accessToken: string,
): Promise<KickSubscriptionReport[]> {
  const response = await fetch(`${API}/events/subscriptions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      // `webhook` usa la URL configurada en el panel de desarrollador de Kick.
      method: 'webhook',
      events: KICK_SUBSCRIPTIONS.map((s) => ({ name: s.name, version: s.version })),
    }),
  });

  if (!response.ok) {
    const detail = `${response.status} ${(await response.text()).slice(0, 200)}`;
    return KICK_SUBSCRIPTIONS.map((s) => ({ name: s.name, ok: false, detail }));
  }

  const body = (await response.json()) as {
    data?: Array<{ name?: string; error?: string; subscription_id?: string }>;
  };

  if (!body.data?.length) {
    return KICK_SUBSCRIPTIONS.map((s) => ({ name: s.name, ok: true }));
  }

  return body.data.map((item) => ({
    name: item.name ?? 'desconocido',
    ok: !item.error,
    detail: item.error,
  }));
}

export async function deleteKickSubscriptions(accessToken: string): Promise<number> {
  const headers = { authorization: `Bearer ${accessToken}`, accept: 'application/json' };

  const list = await fetch(`${API}/events/subscriptions`, { headers });
  if (!list.ok) return 0;

  const body = (await list.json()) as { data?: Array<{ id?: string }> };
  const ids = (body.data ?? []).map((s) => s.id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return 0;

  const params = new URLSearchParams();
  for (const id of ids) params.append('id', id);

  const response = await fetch(`${API}/events/subscriptions?${params}`, {
    method: 'DELETE',
    headers,
  });
  return response.ok ? ids.length : 0;
}

export async function revokeKickToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}&token_hint_type=access_token`, {
    method: 'POST',
  }).catch(() => undefined);
}
