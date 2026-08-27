# MonaWorld Cloudflare MVP

Estructura lista para GitHub + Cloudflare Workers.

## Archivos públicos
- public/index.html
- public/styles.css
- public/app.js
- public/overlay.html
- public/overlay.css

## Backend
- src/index.ts
- migrations/0001_init.sql
- wrangler.jsonc

## Cloudflare
Worker: monaworld
D1: monaworld

El primer deploy con Durable Object debe hacerse con `npx wrangler deploy`, no `npx wrangler versions upload`.
