import type { OverlayRoom } from './realtime/overlay-room.js';

/**
 * Enlaces y secretos del Worker.
 *
 * Todo lo sensible entra por `wrangler secret put`, nunca por `vars`: `vars`
 * queda escrito en wrangler.jsonc y por tanto en el repositorio.
 */
export interface WorkerEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  OVERLAY_ROOM: DurableObjectNamespace<OverlayRoom>;

  APP_ORIGIN: string;
  UC_PER_UNIT: string;

  SESSION_SECRET?: string;
  OVERLAY_TOKEN?: string;
  AGENT_TOKEN?: string;

  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  TWITCH_WEBHOOK_SECRET?: string;

  KICK_CLIENT_ID?: string;
  KICK_CLIENT_SECRET?: string;

  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Canal único: MonaWorld es una herramienta personal, no un servicio multiusuario. */
export const CHANNEL_NAME = 'default';

export type AppEnv = { Bindings: WorkerEnv };
