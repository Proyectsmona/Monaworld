export interface WorkerEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  OVERLAY_ROOM: DurableObjectNamespace;
  APP_ORIGIN: string;
  SUPPORT_PAYPAL_EMAIL?: string;
  AGENT_TOKEN?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  TWITCH_WEBHOOK_SECRET?: string;
  KICK_CLIENT_ID?: string;
  KICK_CLIENT_SECRET?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
}
