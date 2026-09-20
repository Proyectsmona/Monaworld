# MonaWorld v8 · Base funcional multiplataforma

MonaWorld unifica Twitch, YouTube, Kick y TikTok en un panel por streamer. Esta versión parte de la arquitectura de MonaWorld v7 y transforma el proyecto en una base multiusuario con portada pública, OAuth, recursos por usuario, economía Points/Coins, overlays individuales, Overlay Full 16:9, Multi Chat, Alerts, Stickers, Sounds y Media Request.

## Qué incluye

- Portada negra/morada/neón con el GIF de Mona como emblema principal.
- Apóyanos → PayPal (`lamonachinajuega@gmail.com`).
- Programas → MonaClips, ProjectMonena y MonaStudio.
- Suscripción reservada para planes futuros.
- Registro/login local y acceso social por Twitch, YouTube, Kick o TikTok.
- Aislamiento multiusuario: conexiones, recursos, viewers, balances, overlays y configuración pertenecen a un usuario concreto.
- Dashboard conjunto de las cuatro plataformas.
- Data & Reports: Activity Feed, Revenue History y Connections.
- Chat Bot: Commands, Timers, Counters, Spam Filters, Banned Words y Settings.
- Streaming Tools: Overlays, Overlay Full, Media Request, Stickers, Sounds, Alerts y Multi Chat.
- Loyalty: Leaderboard y Loyalty Settings.
- Coin: Settings y Pays por plataforma.
- Stickers y Sounds canjeables con comandos personalizados y coste individual en Points o Coins.
- Upload de GIF/imagen/video/audio a Cloudflare R2.
- URL individual para overlays, alerts, stickers, sounds y media request.
- URL única Overlay Full 16:9 para OBS.
- Multi Chat con URL propia.
- Durable Object/WebSocket por streamer.
- Twitch EventSub firmado y Kick webhooks firmados.
- Agente local para YouTube y TikTok LIVE.

## Requisitos

- Node.js 22+
- Cuenta Cloudflare con Workers, D1, Durable Objects y R2
- Aplicaciones OAuth registradas en las plataformas que vayas a conectar

## Primera instalación

```bash
npm install
npx wrangler r2 bucket create monaworld-media
npx wrangler d1 migrations apply monaworld --remote
npm run build
npm run deploy
```

La D1 configurada es la misma `monaworld` del proyecto actual. La migración `0002_monaworld_multiuser.sql` conserva los datos previos y añade aislamiento por usuario.

## Secretos de Cloudflare

Configura solo los proveedores que vayas a usar:

```bash
npx wrangler secret put AGENT_TOKEN
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
npx wrangler secret put TWITCH_WEBHOOK_SECRET
npx wrangler secret put KICK_CLIENT_ID
npx wrangler secret put KICK_CLIENT_SECRET
npx wrangler secret put YOUTUBE_CLIENT_ID
npx wrangler secret put YOUTUBE_CLIENT_SECRET
npx wrangler secret put TIKTOK_CLIENT_KEY
npx wrangler secret put TIKTOK_CLIENT_SECRET
```

## Redirect URLs OAuth

Con `APP_ORIGIN=https://monaworld.lamonachinajuega.workers.dev`:

- Twitch: `https://monaworld.lamonachinajuega.workers.dev/api/oauth/twitch/callback`
- YouTube/Google: `https://monaworld.lamonachinajuega.workers.dev/api/oauth/youtube/callback`
- Kick: `https://monaworld.lamonachinajuega.workers.dev/api/oauth/kick/callback`
- TikTok: `https://monaworld.lamonachinajuega.workers.dev/api/oauth/tiktok/callback`

Webhook Kick: `https://monaworld.lamonachinajuega.workers.dev/webhooks/kick`

Twitch crea automáticamente sus suscripciones EventSub hacia `/webhooks/twitch` cuando finaliza OAuth.

## Agente local: YouTube + TikTok

Copia el archivo:

```bash
cp apps/agent/.env.example apps/agent/.env
```

Completa `AGENT_TOKEN`, `OWNER_USER_ID` y las credenciales necesarias. Después:

```bash
npm run dev:agent
```

TikTok usa `tiktok-live-connector`, porque TikTok LIVE no ofrece la misma ruta oficial de lectura de chat/eventos que las otras integraciones. Está aislado para que un cambio de TikTok no afecte a Twitch, YouTube, Kick ni los overlays.

## Modelo de Points y Coins

**Loyalty Points** son gratuitos y se pueden otorgar por actividad/presencia. El streamer decide su nombre y cuánto entrega cada plataforma.

**Coins** son una moneda interna del canal generada por eventos monetarios. No son dinero, no sustituyen Bits/Coins/Gifts/Super Chats y no representan un saldo retirable. El streamer define sus equivalencias.

## Comandos de Stickers y Sounds

Cada sticker/sound guarda su propio:

- comando (`!fuego`, `!risa`, etc.);
- coste;
- moneda usada (`points` o `coins`);
- plataformas habilitadas;
- cooldown;
- media subida;
- posición/duración en stickers o volumen en sounds.

Al recibir un mensaje, el Event Engine identifica el comando, verifica saldo, descuenta el coste, registra el canje y lo transmite por WebSocket al overlay.

## OBS

En el panel se pueden copiar URLs individuales. Overlay Full genera una sola URL 16:9 que puede contener Alertas, Multi Chat, contadores, stickers, sounds, media y otros widgets.

Añade las URLs en OBS como **Fuente de navegador**.

## Seguridad

- Contraseñas PBKDF2.
- Sesión HttpOnly.
- Recursos filtrados por `user_id`.
- Token de overlay independiente por usuario y rotatable.
- Twitch verifica HMAC y ventana de replay.
- Kick verifica firma RSA y ventana de replay.
- Secretos fuera del repositorio mediante Wrangler Secrets.

## Limitaciones reales de las plataformas

La interfaz está diseñada para las cuatro plataformas, pero una acción solo puede ejecutarse donde la API o protocolo correspondiente la permita. Especialmente moderación/escritura de chat no tiene capacidades idénticas entre Twitch, YouTube, Kick y TikTok. MonaWorld no debe fingir soporte cuando una plataforma no expone una operación.

## Desarrollo

```bash
npm run dev
npm run dev:panel
npm run dev:overlay
npm run typecheck
npm test
```

Para desplegar el Worker usa `wrangler deploy`; no uses `wrangler versions upload` para este proyecto con Durable Objects.
MonaWorld 8 deployment

