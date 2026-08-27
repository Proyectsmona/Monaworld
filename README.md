# MonaWorld v6
Cloudflare Workers + Assets + D1 + Durable Object OverlayRoom.

Workers Builds:
- Build: `bun install`
- Deploy: `npx wrangler deploy`

Important: use `wrangler deploy`, not `wrangler versions upload`, because the Worker has a Durable Object migration.

D1 schema: `npx wrangler d1 execute monaworld --remote --file=./schema.sql`

Demo-only frontend accounts:
- ADMIN: lamonachinajuega / Monatest1234
- MODERATOR_ADMIN: moderadormona / modtest1234

Replace these with server-side hashed accounts before production. Never commit OAuth/API secrets.
