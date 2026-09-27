@AGENTS.md

# WalletCast: context for Claude

## What this is

An open-source, self-hosted "no-app push notification" tool. Businesses create a card, and customers add it to Apple or Google Wallet from a QR code or link. Every broadcast then updates the pass, and the wallet shows the change as a lock-screen notification.

It is the open-source counterpart to paid wallet-marketing SaaS (the original inspiration was tap2.ai). The owner is Adrien (GitHub `adrbn`), who speaks French and wants the whole pipeline public so anyone can run it. The product is the **notification channel**; loyalty features are secondary (roadmap).

- Design spec: `docs/specs/2026-09-27-walletcast-v1-design.md`
- Roadmap: `docs/ROADMAP.md`
- Setup guides: `docs/setup-apple.md`, `docs/setup-google.md`, `docs/deploy.md`

## Status (2026-09-27)

v1 is complete and smoke-tested end to end locally:
- login, card creation, public page, `.pkpass` issuance, the full Apple web-service loop, and broadcast with stats;
- 62 tests pass, with about 85% line coverage on `src/lib`.

**Not yet validated with real credentials:**
- no real iPhone or Apple certificate was used; the Apple tests use self-signed certs and a local HTTP/2 server;
- no real Google issuer was used; the Google tests fake `fetch`.

The first real-world test is the next milestone.

## Commands

```bash
pnpm dev | build | start
pnpm test            # vitest, PGlite in-memory, no network
pnpm test:coverage   # thresholds: 80% lines/functions/statements, 70% branches (src/lib)
pnpm typecheck       # MUST run `next typegen` first (RouteContext/PageProps are generated globals)
pnpm lint
pnpm db:generate     # after editing src/lib/db/schema.ts → new SQL in src/lib/db/migrations
```

## Architecture

```
src/lib/            framework-free business logic (tested, injected deps)
  config/env.ts     zod-parsed env → AppConfig {apple|null, google|null, warnings}
  db/               drizzle schema, migrations (auto-applied), client (Postgres or PGlite)
  cards/            validation (zod), repository, images (sharp), links + QR
  subscribers/      repository (passes, Apple devices/registrations), CSV export
  apple/            pass.ts (passkit-generator), webservice.ts (PassKit web service), apns.ts (HTTP/2)
  google/           objects.ts (GenericClass/Object mapping), client.ts (REST + save JWT)
  broadcast/        broadcast(): latest message → APNs pushes + Google PATCH/addMessage → stats
  passes/issue.ts   create subscriber + build pass / save link
  auth/session.ts   single admin password + HS256 JWT cookie
  http/             rate limiter, concurrency, Response helpers
  services.ts       wires config + db into the modules (cached on globalThis)
src/server/         Next glue: auth.ts (requireAdmin), actions.ts (server actions)
src/app/            pages (/login, /dashboard/**, /c/[slug]) + API routes
  api/apple/v1/**   Apple PassKit web service (webServiceURL = BASE_URL/api/apple)
  api/passes/{apple,google}/[slug]   public issuance (POST, rate limited)
  api/cards/[id]/{image/[kind],qr,subscribers.csv}
src/components/     client components (CardForm with live PassPreview, SendForm, QrPanel)
src/proxy.ts        optimistic auth gate for /dashboard (Next 16 name for middleware)
```

### How notifications work

- **Apple**:
  1. The pass has a `latest` field with `changeMessage: "%@"`.
  2. On broadcast, `cards.setLatestMessage` updates the card and bumps `updatedAt` on every active subscriber.
  3. An empty APNs push goes to each registered device (topic = pass type ID, client cert = pass cert).
  4. The device calls `listUpdated`, then `getPass`, sees the field change, and shows the notification.
  5. Tokens that come back 410 or `Unregistered` are pruned.
- **Google**: for each active Google subscriber, WalletCast PATCHes the object (design and text) and then POSTs `addMessage` with `TEXT_AND_NOTIFY`. Google allows about 3 notifications per pass per 24h.

## Conventions

- Business logic goes in `src/lib`, with no Next imports. Platform clients (`ApnsSender`, `GoogleWalletApi`) are interfaces injected into it so tests can fake them.
- Tests sit next to the code (`*.test.ts`) and use a real SQL engine via `createTestDb()` (PGlite in-memory). Don't mock the database.
- Validate every input with zod at the boundary; public endpoints are rate limited.
- Every server action calls `requireAdmin()`; the proxy is only an optimistic gate.
- Secrets live only in env vars (see `.env.example`) and are never stored in the database or committed. `certs/`, `*.pem` and `*.p12` are gitignored.
- Commits use conventional-commit format with no attribution lines. Keep UI text in English, since the project targets an international audience.

## Gotchas learned the hard way

- **Next 16**: read `node_modules/next/dist/docs/` before using an API.
  - `params`, `searchParams`, `cookies()` and `headers()` are async.
  - `middleware.ts` is now `proxy.ts`.
  - `RouteContext<'/path'>` and `PageProps<'/path'>` are generated globals, so run `next typegen` before `tsc`.
- **Don't name a route folder `icon.png` / `logo.png`**: Next treats `icon.*` as a metadata file convention. That's why images are served at `/api/cards/[id]/image/[kind]`.
- **Tailwind 4**: a custom class that must be `@apply`-able by another class has to be declared with `@utility`, not in `@layer components` (see `globals.css`).
- **ESLint `react-hooks/set-state-in-effect`**: derive values with `useMemo`; don't `setState` inside effects.
- **Design edits must bump `subscribers.updatedAt`** (`cards.update` does this in a transaction). Otherwise Apple's `passesUpdatedSince` query reports nothing changed.
- **`clientIp`** uses the right-most `X-Forwarded-For` entry; the left-most entries are spoofable.
- **Standalone output**: the Docker image must copy `src/lib/db/migrations`, since migrations are read from `process.cwd()`. `next.config.ts` also traces them for Vercel.
- **Apple requires HTTPS** for the web service; `http://` works only for downloading the pass.
- **Smoke-testing locally**: generate throwaway Apple certs with `createSelfSignedCert()` from `src/lib/testing/certs.ts` and set the `APPLE_*` env vars to their base64. The pass downloads and the web service works; APNs rejects the fake cert, which is expected.

## Next steps

1. Test with real Apple credentials on an iPhone (via a tunnel or a deployed HTTPS instance) and with a real Google issuer in demo mode.
2. Deploy a public demo instance.
3. Build the v2 items in `docs/ROADMAP.md`, starting with scheduled notifications and geo (Apple `locations`).
