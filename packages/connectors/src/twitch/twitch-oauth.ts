import {
  buildAuthorizeUrl,
  exchangeCode,
  isTokenError,
  toTokens,
  type OAuthTokens,
  type TokenExchangeError,
} from '../shared/oauth.js';
import { TWITCH_SCOPES, TWITCH_SUBSCRIPTIONS } from './twitch-normalizer.js';

/**
 * Alta de Twitch: autorización del usuario y suscripciones EventSub.
 *
 * Hay un detalle que confunde a mucha gente y que aquí importa: las
 * suscripciones de EventSub por webhook se crean con un **app access token**
 * (credenciales de la aplicación), NO con el token del usuario. El token de
 * usuario sirve únicamente para que el streamer conceda los permisos; después
 * se guarda para refrescos y para consultar su identidad, pero la llamada que
 * crea la suscripción va firmada con el token de aplicación.
 */

const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX = 'https://api.twitch.tv/helix';

export interface TwitchCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export function twitchAuthorizeUrl(
  credentials: TwitchCredentials,
  redirectUri: string,
  state: string,
): string {
  return buildAuthorizeUrl(AUTHORIZE_URL, {
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: TWITCH_SCOPES.join(' '),
    state,
    // Fuerza la pantalla de permisos: si el streamer reconecta es porque algo
    // iba mal, y reutilizar el consentimiento anterior esconde el problema.
    force_verify: 'true',
  });
}

export function exchangeTwitchCode(
  credentials: TwitchCredentials,
  code: string,
  redirectUri: string,
): Promise<OAuthTokens | TokenExchangeError> {
  return exchangeCode(TOKEN_URL, {
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
}

export function refreshTwitchToken(
  credentials: TwitchCredentials,
  refreshToken: string,
): Promise<OAuthTokens | TokenExchangeError> {
  return exchangeCode(TOKEN_URL, {
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
}

/** Token de aplicación: el único que puede crear suscripciones por webhook. */
export async function getTwitchAppToken(
  credentials: TwitchCredentials,
): Promise<OAuthTokens | TokenExchangeError> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) return { error: String(body.message ?? body.error ?? 'error') };
  return toTokens(body);
}

export interface TwitchUser {
  readonly id: string;
  readonly login: string;
  readonly displayName: string;
}

export async function getTwitchUser(
  clientId: string,
  userAccessToken: string,
): Promise<TwitchUser | null> {
  const response = await fetch(`${HELIX}/users`, {
    headers: { 'client-id': clientId, authorization: `Bearer ${userAccessToken}` },
  });
  if (!response.ok) return null;

  const body = (await response.json()) as {
    data?: Array<{ id: string; login: string; display_name: string }>;
  };
  const user = body.data?.[0];
  return user ? { id: user.id, login: user.login, displayName: user.display_name } : null;
}

/**
 * Cada tipo de suscripción exige una condición distinta. Equivocarse aquí
 * devuelve un 400 poco descriptivo, así que está centralizado.
 */
function conditionFor(type: string, broadcasterId: string): Record<string, string> {
  switch (type) {
    case 'channel.follow':
      // v2 exige además el moderador que observa; el propio canal vale.
      return { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId };
    case 'channel.raid':
      return { to_broadcaster_user_id: broadcasterId };
    case 'channel.chat.message':
      return { broadcaster_user_id: broadcasterId, user_id: broadcasterId };
    default:
      return { broadcaster_user_id: broadcasterId };
  }
}

export interface SubscriptionReport {
  readonly type: string;
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * Crea todas las suscripciones que MonaWorld necesita.
 *
 * Devuelve un informe por tipo en vez de fallar entera: si el streamer no
 * concedió `bits:read`, el resto de eventos debe seguir funcionando y hay que
 * poder decirle exactamente cuál faltó.
 */
export async function createTwitchSubscriptions(
  credentials: TwitchCredentials,
  appToken: string,
  broadcasterId: string,
  callbackUrl: string,
  webhookSecret: string,
): Promise<SubscriptionReport[]> {
  const reports: SubscriptionReport[] = [];

  for (const subscription of TWITCH_SUBSCRIPTIONS) {
    const response = await fetch(`${HELIX}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        'client-id': credentials.clientId,
        authorization: `Bearer ${appToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: subscription.type,
        version: subscription.version,
        condition: conditionFor(subscription.type, broadcasterId),
        transport: { method: 'webhook', callback: callbackUrl, secret: webhookSecret },
      }),
    });

    if (response.ok || response.status === 202) {
      reports.push({ type: subscription.type, ok: true });
      continue;
    }

    // 409 significa que ya existía: para nosotros es éxito.
    if (response.status === 409) {
      reports.push({ type: subscription.type, ok: true, detail: 'ya existía' });
      continue;
    }

    const body = (await response.text()).slice(0, 200);
    reports.push({ type: subscription.type, ok: false, detail: `${response.status} ${body}` });
  }

  return reports;
}

/** Borra las suscripciones al desconectar, para no dejar webhooks huérfanos. */
export async function deleteTwitchSubscriptions(
  credentials: TwitchCredentials,
  appToken: string,
): Promise<number> {
  const headers = {
    'client-id': credentials.clientId,
    authorization: `Bearer ${appToken}`,
  };

  const list = await fetch(`${HELIX}/eventsub/subscriptions`, { headers });
  if (!list.ok) return 0;

  const body = (await list.json()) as { data?: Array<{ id: string }> };
  let removed = 0;

  for (const subscription of body.data ?? []) {
    const response = await fetch(
      `${HELIX}/eventsub/subscriptions?id=${encodeURIComponent(subscription.id)}`,
      { method: 'DELETE', headers },
    );
    if (response.ok || response.status === 204) removed++;
  }

  return removed;
}

export { isTokenError };
