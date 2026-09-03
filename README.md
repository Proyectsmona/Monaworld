# MonaWorld v7

Centro de control para directos multiplataforma. Lee los eventos de Twitch,
YouTube, Kick y TikTok por el método que cada plataforma permite, los convierte
todos al mismo evento, y ejecuta acciones: alertas, sonidos, contadores y
control de OBS.

MonaWorld **solo lee**. Nunca publica, nunca modera y nunca modifica cuentas. No
se crean, venden ni alteran Bits, Coins, Gifts ni suscripciones de las
plataformas.

## Cómo entra cada plataforma

No son cuatro APIs: son cuatro mecanismos distintos.

| Plataforma | Método | Oficial | Entra por |
| --- | --- | --- | --- |
| Twitch | EventSub por webhook (HMAC) | Sí | Worker |
| Kick | API pública por webhook (RSA) | Sí | Worker |
| YouTube | Data API v3, chat en directo | Sí | Agente local |
| TikTok | Protocolo interno del LIVE | **No** | Agente local |

Twitch y Kick llegan directos al Worker y **funcionan aunque el agente esté
apagado**. YouTube necesita una conexión abierta durante horas y TikTok funciona
mucho peor desde una IP de centro de datos: por eso los dos viven en un proceso
que corre en el PC del streamer.

## Estructura

Arquitectura hexagonal. Los detalles y las convenciones están en
[ARCHITECTURE.md](./ARCHITECTURE.md).

```
packages/
  domain/         tipos + lógica pura · cero dependencias de runtime
  contracts/      esquemas Zod atados al dominio por el compilador
  application/    casos de uso + puertos
  connectors/     normalizadores de las cuatro plataformas
  db/             esquema Drizzle sobre D1
apps/
  worker/         Cloudflare: Hono, webhooks, Durable Object, repositorios
  agent/          Node: TikTok, YouTube y control de OBS
  panel/          React + Vite + PrimeReact + Tailwind
  overlay/        renderer para las fuentes del navegador de OBS
```

## Puesta en marcha

```bash
npm install
npx wrangler d1 migrations apply monaworld --local
npm run build          # panel y overlay → ./public
npm run dev            # Worker en http://127.0.0.1:8787
```

Crea `.dev.vars` en la raíz (no se versiona):

```
OVERLAY_TOKEN="un-token-cualquiera"
AGENT_TOKEN="otro-token-cualquiera"
TWITCH_WEBHOOK_SECRET="secreto-de-pruebas"
```

Al abrir el panel por primera vez no hay ninguna cuenta: la pantalla de acceso
te deja crearla. La contraseña se guarda como hash PBKDF2 en D1 y la sesión es
una cookie HttpOnly revocable.

### Ver una alerta en OBS

1. Panel → **Alertas y reglas** → «Crear reglas de ejemplo».
2. Panel → **Fuentes OBS** → pega el token y copia la URL de Alertas.
3. En OBS: Fuentes → + → Navegador → pega la URL.
4. Panel → **Eventos** → pulsa cualquier preajuste del simulador.

## Conectar las cuentas

**Twitch y Kick** se conectan desde el panel → **Plataformas** → «Conectar».
El flujo OAuth crea las suscripciones de webhook automáticamente y te dice
cuántas quedaron activas.

Antes hay que registrar la aplicación en cada plataforma:

| | Dónde | URL de redirección |
| --- | --- | --- |
| Twitch | [dev.twitch.tv/console](https://dev.twitch.tv/console) | `<APP_ORIGIN>/api/connect/twitch/callback` |
| Kick | Panel de desarrollador de Kick | `<APP_ORIGIN>/api/connect/kick/callback` |

En Kick hay que configurar además la URL de webhook:
`<APP_ORIGIN>/webhooks/kick`.

Los scopes que se piden son de lectura. En Twitch:
`moderator:read:followers`, `channel:read:subscriptions`, `bits:read`,
`user:read:chat`, `user:bot` y `channel:bot`. En Kick: `user:read`,
`channel:read`, `events:subscribe`.

Los dos últimos de Twitch llaman la atención, pero no otorgan escritura: Twitch
los exige para leer el chat cuando la suscripción se crea con un app access
token, que es lo que obliga el transporte por webhook. Publicar en el chat
requeriría `user:write:chat`, y ese no se pide nunca.

**YouTube** se autoriza desde la terminal, con el flujo loopback de aplicación
de escritorio que exige Google:

```bash
npm run agent:youtube-auth
```

Imprime una URL, la abres, y al volver te da el `YOUTUBE_REFRESH_TOKEN` para
pegar en `apps/agent/.env`. Se hace una sola vez.

**TikTok** no necesita credenciales: basta poner `TIKTOK_USERNAME` en el
`.env` del agente.

### El agente local

```bash
cp apps/agent/.env.example apps/agent/.env   # y rellénalo
npm run dev:agent
```

Cada conector es independiente: si TikTok se cae, YouTube y OBS siguen. Sin
`TIKTOK_USERNAME` o sin credenciales de YouTube, ese conector simplemente no
arranca y el resto funciona igual.

## Despliegue

```bash
npx wrangler d1 migrations apply monaworld --remote
npm run deploy
```

Usa `wrangler deploy`, no `wrangler versions upload`: el Worker tiene una
migración de Durable Object.

Los secretos van con `wrangler secret put`, nunca en `vars`:

```bash
npx wrangler secret put OVERLAY_TOKEN
npx wrangler secret put AGENT_TOKEN
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
npx wrangler secret put TWITCH_WEBHOOK_SECRET
npx wrangler secret put KICK_CLIENT_ID
npx wrangler secret put KICK_CLIENT_SECRET
```

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Worker local con D1 y Durable Objects |
| `npm run dev:panel` | Vite del panel con proxy al Worker |
| `npm run dev:agent` | Agente local |
| `npm run agent:youtube-auth` | Obtiene el refresh token de YouTube |
| `npm run build` | Panel y overlay → `./public` |
| `npm test` | Suite completa |
| `npm run typecheck` | Tipos de los cuatro proyectos |
| `npm run db:local` / `db:remote` | Migraciones de D1 |

## Estado

**Verificado en ejecución:** evento común, motor de reglas con cooldown, cola
serial de alertas, difusión por WebSocket con hibernación, ingesta idempotente,
sesión de un usuario, simulador, webhook de Twitch con firma HMAC real
(incluido el rechazo de firmas manipuladas y de reenvíos), enlace del agente,
construcción de las URLs de autorización de Twitch y Kick con PKCE, guardas
anti-CSRF del callback, panel y overlay.

**Verificado contra Twitch real:** el intercambio de código por tokens, el alta
de las siete suscripciones de EventSub y la recepción de eventos firmados en el
Worker desplegado.

**Escrito y probado con fixtures, pendiente de credenciales reales:** el alta de
suscripciones en Kick y los conectores de YouTube, TikTok y OBS del agente.

**Pendiente:** editor visual de overlays, biblioteca de sonidos, empaquetado
del agente como servicio.
