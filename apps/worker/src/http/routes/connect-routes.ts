import { Hono } from 'hono';
import {
  createKickSubscriptions,
  createPkcePair,
  createTwitchSubscriptions,
  deleteKickSubscriptions,
  deleteTwitchSubscriptions,
  exchangeKickCode,
  exchangeTwitchCode,
  getKickChannel,
  getTwitchAppToken,
  getTwitchUser,
  isTokenError,
  kickAuthorizeUrl,
  randomToken,
  revokeKickToken,
  twitchAuthorizeUrl,
} from '@monaworld/connectors';
import type { Platform } from '@monaworld/domain';
import type { WorkerEnv } from '../../env.js';
import type { AppVariables } from '../container.js';
import { isSecureRequest, requireSession } from '../middleware.js';
import { readCookie } from '../../auth/session.js';

type Env = { Bindings: WorkerEnv; Variables: AppVariables };

/**
 * Conexión de cuentas de plataforma.
 *
 * El estado anti-CSRF y el verificador PKCE viajan en una cookie HttpOnly de
 * vida corta en vez de guardarse en la base: no hay nada que limpiar después y
 * el flujo funciona igual si el Worker atiende la vuelta en otra instancia.
 */

const FLOW_COOKIE = 'mw_oauth';
const FLOW_TTL_SECONDS = 600;

const flowCookie = (value: string, secure: boolean, maxAge = FLOW_TTL_SECONDS): string =>
  [
    `${FLOW_COOKIE}=${value}`,
    'Path=/api/connect',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join('; ');

/**
 * Origen real de esta petición.
 *
 * Se deriva de la URL entrante y NO de `APP_ORIGIN` a propósito: en desarrollo
 * el panel se abre en `127.0.0.1:8787`, y usar el origen de producción haría
 * que la plataforma devolviese al usuario al Worker desplegado en vez de a su
 * máquina. Basta con registrar ambas URLs de redirección en la consola de la
 * plataforma y cada entorno usa la suya.
 */
const originOf = (requestUrl: string, env: WorkerEnv): string => {
  try {
    return new URL(requestUrl).origin;
  } catch {
    return env.APP_ORIGIN.replace(/\/$/, '');
  }
};

const callbackUrl = (origin: string, platform: Platform): string =>
  `${origin}/api/connect/${platform}/callback`;

/** Vuelve al panel con el resultado en la URL, para que lo muestre. */
const backToPanel = (origin: string, params: Record<string, string>): string => {
  const url = new URL(origin);
  url.pathname = '/';
  url.hash = `platforms?${new URLSearchParams(params)}`;
  return url.toString();
};

export const connectRoutes = new Hono<Env>()
  .use('*', requireSession)

  // ------------------------------------------------------------- arranque

  .get('/:platform/start', async (c) => {
    const platform = c.req.param('platform') as Platform;
    const secure = isSecureRequest(c.req.url);
    const origin = originOf(c.req.url, c.env);
    const state = randomToken(24);

    if (platform === 'twitch') {
      if (!c.env.TWITCH_CLIENT_ID || !c.env.TWITCH_CLIENT_SECRET) {
        return c.json({ error: 'Faltan TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET' }, 503);
      }
      c.header('Set-Cookie', flowCookie(`twitch.${state}.`, secure));
      return c.redirect(
        twitchAuthorizeUrl(
          { clientId: c.env.TWITCH_CLIENT_ID, clientSecret: c.env.TWITCH_CLIENT_SECRET },
          callbackUrl(origin, 'twitch'),
          state,
        ),
      );
    }

    if (platform === 'kick') {
      if (!c.env.KICK_CLIENT_ID || !c.env.KICK_CLIENT_SECRET) {
        return c.json({ error: 'Faltan KICK_CLIENT_ID y KICK_CLIENT_SECRET' }, 503);
      }
      const pkce = await createPkcePair();
      c.header('Set-Cookie', flowCookie(`kick.${state}.${pkce.verifier}`, secure));
      return c.redirect(
        kickAuthorizeUrl(
          { clientId: c.env.KICK_CLIENT_ID, clientSecret: c.env.KICK_CLIENT_SECRET },
          callbackUrl(origin, 'kick'),
          state,
          pkce.challenge,
        ),
      );
    }

    // YouTube y TikTok no se conectan desde aquí: viven en el agente local.
    return c.json(
      { error: `${platform} se configura en el agente local, no desde el panel` },
      400,
    );
  })

  // --------------------------------------------------------------- vuelta

  .get('/:platform/callback', async (c) => {
    const platform = c.req.param('platform') as Platform;
    const secure = isSecureRequest(c.req.url);
    const origin = originOf(c.req.url, c.env);
    const code = c.req.query('code');
    const state = c.req.query('state');

    // Limpiar la cookie del flujo pase lo que pase: no debe sobrevivir.
    c.header('Set-Cookie', flowCookie('', secure, 0));

    if (c.req.query('error')) {
      return c.redirect(
        backToPanel(origin, { connected: 'no', platform, reason: c.req.query('error')! }),
      );
    }

    const stored = readCookie(c.req.header('Cookie') ?? null, FLOW_COOKIE) ?? '';
    const [storedPlatform, storedState, verifier] = stored.split('.');

    if (!code || !state || storedPlatform !== platform || storedState !== state) {
      return c.redirect(backToPanel(origin, { connected: 'no', platform, reason: 'estado_invalido' }));
    }

    const container = c.get('container');

    if (platform === 'twitch') {
      const credentials = {
        clientId: c.env.TWITCH_CLIENT_ID!,
        clientSecret: c.env.TWITCH_CLIENT_SECRET!,
      };

      const tokens = await exchangeTwitchCode(credentials, code, callbackUrl(origin, 'twitch'));
      if (isTokenError(tokens)) {
        return c.redirect(backToPanel(origin, { connected: 'no', platform, reason: tokens.error }));
      }

      const user = await getTwitchUser(credentials.clientId, tokens.accessToken);
      if (!user) {
        return c.redirect(backToPanel(origin, { connected: 'no', platform, reason: 'sin_usuario' }));
      }

      await container.accounts.saveTokens({
        platform: 'twitch',
        channelName: user.displayName,
        platformUserId: user.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        status: 'offline',
        lastError: null,
      });

      // Las suscripciones por webhook se crean con el token de APLICACIÓN,
      // no con el del usuario. Twitch rechaza el token de usuario aquí.
      const appToken = await getTwitchAppToken(credentials);
      if (isTokenError(appToken)) {
        await container.accounts.setStatus('twitch', 'error', 'no se pudo obtener el token de app');
        return c.redirect(backToPanel(origin, { connected: 'parcial', platform, reason: 'app_token' }));
      }

      if (!c.env.TWITCH_WEBHOOK_SECRET) {
        await container.accounts.setStatus('twitch', 'error', 'falta TWITCH_WEBHOOK_SECRET');
        return c.redirect(backToPanel(origin, { connected: 'parcial', platform, reason: 'sin_secreto' }));
      }

      const reports = await createTwitchSubscriptions(
        credentials,
        appToken.accessToken,
        user.id,
        // El webhook siempre apunta a producción: Twitch exige URL pública
        // accesible desde internet, y localhost nunca lo es.
        `${c.env.APP_ORIGIN.replace(/\/$/, '')}/webhooks/twitch`,
        c.env.TWITCH_WEBHOOK_SECRET,
      );

      const failed = reports.filter((r) => !r.ok);
      await container.accounts.setStatus(
        'twitch',
        failed.length === 0 ? 'online' : 'error',
        failed.length === 0 ? undefined : failed.map((f) => `${f.type}: ${f.detail}`).join(' · '),
      );

      return c.redirect(
        backToPanel(origin, {
          connected: failed.length === 0 ? 'si' : 'parcial',
          platform,
          suscripciones: `${reports.length - failed.length}/${reports.length}`,
        }),
      );
    }

    if (platform === 'kick') {
      const credentials = {
        clientId: c.env.KICK_CLIENT_ID!,
        clientSecret: c.env.KICK_CLIENT_SECRET!,
      };

      const tokens = await exchangeKickCode(
        credentials,
        code,
        callbackUrl(origin, 'kick'),
        verifier ?? '',
      );
      if (isTokenError(tokens)) {
        return c.redirect(backToPanel(origin, { connected: 'no', platform, reason: tokens.error }));
      }

      const channel = await getKickChannel(tokens.accessToken);

      await container.accounts.saveTokens({
        platform: 'kick',
        channelName: channel?.slug ?? 'kick',
        platformUserId: channel?.userId ?? null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        status: 'offline',
        lastError: null,
      });

      const reports = await createKickSubscriptions(tokens.accessToken);
      const failed = reports.filter((r) => !r.ok);

      await container.accounts.setStatus(
        'kick',
        failed.length === 0 ? 'online' : 'error',
        failed.length === 0 ? undefined : failed.map((f) => `${f.name}: ${f.detail}`).join(' · '),
      );

      return c.redirect(
        backToPanel(origin, {
          connected: failed.length === 0 ? 'si' : 'parcial',
          platform,
          suscripciones: `${reports.length - failed.length}/${reports.length}`,
        }),
      );
    }

    return c.redirect(backToPanel(origin, { connected: 'no', platform, reason: 'no_soportado' }));
  })

  // --------------------------------------------------------- desconexión

  .post('/:platform/disconnect', async (c) => {
    const platform = c.req.param('platform') as Platform;
    const container = c.get('container');
    const account = await container.accounts.find(platform);

    // Retirar también las suscripciones remotas: dejar webhooks huérfanos
    // apuntando a un canal desconectado es basura que se acumula.
    if (account?.accessToken) {
      if (platform === 'twitch' && c.env.TWITCH_CLIENT_ID && c.env.TWITCH_CLIENT_SECRET) {
        const credentials = {
          clientId: c.env.TWITCH_CLIENT_ID,
          clientSecret: c.env.TWITCH_CLIENT_SECRET,
        };
        const appToken = await getTwitchAppToken(credentials);
        if (!isTokenError(appToken)) {
          await deleteTwitchSubscriptions(credentials, appToken.accessToken);
        }
      }

      if (platform === 'kick') {
        await deleteKickSubscriptions(account.accessToken);
        await revokeKickToken(account.accessToken);
      }
    }

    await container.accounts.disconnect(platform);
    return c.json({ ok: true });
  });
