# VTuber Unified — Full-stack MVP

Base Cloudflare full-stack para la plataforma multistream:
- dashboard neon
- Overlay Studio
- una Browser Source para OBS
- API unificada de eventos
- D1 para layouts, comandos, reglas, eventos y UC
- Durable Object + WebSocket para el overlay en tiempo real
- endpoints webhook para Twitch, YouTube, Kick y TikTok

## Instalación

1. `npm install`
2. `npx wrangler login`
3. `npx wrangler d1 create vtuber-unified`
4. Reemplaza `REPLACE_WITH_YOUR_D1_DATABASE_ID` en `wrangler.jsonc`.
5. `npm run db:migrate:remote`
6. `npm run dev`
7. `npm run deploy`

## Endpoints

- `/` dashboard
- `/overlay/demo` overlay OBS
- `/ws?user=demo` WebSocket
- `/api/health`
- `/api/platforms`
- `POST /api/demo-event`
- `POST /api/webhooks/twitch`
- `POST /api/webhooks/youtube`
- `POST /api/webhooks/kick`
- `POST /api/webhooks/tiktok`
- `GET/PUT /api/overlay`
- `GET/POST /api/commands`

## Prueba local

```bash
curl -X POST http://localhost:8787/api/demo-event -H "content-type: application/json" -d '{"userId":"demo","platform":"twitch","type":"donation","actor":"Frank","uc":500}'
```

## Estado de integraciones

La capa de normalización ya está creada, pero las integraciones oficiales de cada plataforma deben conectarse con sus credenciales, OAuth, firma/verificación de webhooks y payloads reales. TikTok queda como `bridge` en esta versión para no asumir una API pública general de LIVE para todos los eventos.
