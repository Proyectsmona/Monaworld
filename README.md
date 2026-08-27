# MonaWorld

Unified creator dashboard prototype for Twitch, YouTube, Kick and TikTok LIVE.

## Deploy
1. Create/apply D1 schema: `npx wrangler d1 execute monaworld --remote --file=schema.sql`
2. Cloudflare Workers Builds: build command `bun install`; deploy command `npx wrangler deploy` (NOT `wrangler versions upload`).
3. Keep `wrangler.json` in the repository root.
4. Open the worker URL.

## Demo accounts
- admin: `lamonachinajuega` / `Monatest1234`
- moderator: `moderadormona` / `modtest1234`

Change these passwords before any public/production deployment.

The platform connectors are intentionally demo-ready. Real OAuth/EventSub/webhook credentials must be added server-side.


## v3 additions
- Public landing page is the login screen.
- PayPal support section for lamonachinajuega@gmail.com. Replace the prototype URL with the official PayPal-generated donation/checkout link before production.
- MonaWorld Pro subscription and MonaProyect/MonaClips product sections are included as storefront prototype UI.
- Real subscription/product payments require a payment provider checkout plus server-side webhooks and entitlement records.
