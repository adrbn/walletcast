# WalletCast v1 — Design

Date: 2026-09-27
Status: approved (owner gave "carte blanche", design decisions below are final for v1)

## 1. What WalletCast is

WalletCast is an open-source, self-hostable alternative to Tap2 (tap2.ai).
It turns an **Apple Wallet / Google Wallet pass into a notification channel**:

1. An operator creates a branded *card* (name, logo, colors, text).
2. People add the card to their phone's Wallet from a public link / QR code —
   **no app to install, no account to create**.
3. The operator writes a message; WalletCast updates every installed pass and
   Apple/Google show it as a **lock-screen notification**.

Tap2 sells this as SaaS (loyalty cards for cafés, bars, events + a pass API).
WalletCast gives the full pipeline away: one deploy = your own Tap2.

### Non-goals for v1 (see ROADMAP.md)
Scheduled / geo-triggered notifications, loyalty stamps & rewards, POS scanning,
automations, referrals, printable material, multi-tenant SaaS signup.

## 2. Users

- **Operator**: the person who deploys WalletCast (café owner, creator, event
  organiser, developer). Single-tenant in v1: one deployment = one operator,
  protected by an admin password.
- **Subscriber**: anyone who adds a card to their Wallet.

## 3. Constraints that shape the design

| Constraint | Consequence |
|---|---|
| Apple passes must be signed with a Pass Type ID certificate (Apple Developer Program, 99 $/yr) | Each operator brings their own certificate via env vars. Without it, Apple features are disabled, not broken. |
| Apple pass updates: device registers with our web service, we push an empty APNs notification, device fetches the new pass. A lock-screen notification appears only when a field with `changeMessage` changes value. | The "latest message" field carries `changeMessage: "%@"`. Every broadcast changes its value. |
| Apple web service must be HTTPS in production. | Deploy docs require HTTPS (Vercel/Railway give it for free). |
| Google Wallet: issuer account + service account; notifications via `addMessage` with `TEXT_AND_NOTIFY`, limited by Google (~3 notifying messages / pass / 24h). New issuers can only save passes for test accounts until Google grants publishing access. | Documented in setup guide; broadcast reports per-platform results. |
| Must be trivially self-hostable. | Next.js single app, Postgres via `DATABASE_URL`, **embedded PGlite fallback** when no DB is configured (zero-setup local dev), Dockerfile + Vercel deploy. |

## 4. Architecture

Single Next.js 16 (App Router, TypeScript) app. Business logic lives in
framework-free modules under `src/lib/` so it can be unit-tested and later
extracted as a standalone engine/SDK.

```
src/
  app/                       UI + HTTP routes (thin)
    (public) c/[slug]        public "add to wallet" page
    login, dashboard/...     operator UI
    api/apple/v1/...         Apple PassKit web service
    api/passes/...           pass issuance (apple .pkpass, google save link)
    api/cards/[id]/...       card images, QR code
  lib/
    config/env.ts            zod-validated env, feature flags (appleEnabled, googleEnabled)
    db/                      drizzle schema, client (postgres-js | PGlite), migrations
    auth/                    admin session (signed JWT cookie via jose)
    cards/                   card repository, validation schemas, image processing
    subscribers/             pass issuance records, repository
    apple/                   pass builder, APNs client, web-service logic
    google/                  REST client, class/object mapping, save-URL JWT
    broadcast/               fan-out of a message to all platforms, result stats
    http/                    rate limiter, small helpers
  proxy.ts                   redirects unauthenticated /dashboard/* to /login
```

### Data model (Postgres, drizzle)

- `cards` — id (uuid), slug (unique, url-safe), name, description, organizationName,
  bgColor, fgColor, labelColor, logo (bytea, png, nullable), icon (bytea, png, nullable),
  welcomeText, websiteUrl, latestMessage (text), latestMessageAt, createdAt, updatedAt.
- `subscribers` — id (uuid), cardId → cards, platform ('apple' | 'google'),
  serialNumber (unique), authToken (apple web-service token), email (nullable),
  source (nullable, e.g. `?src=window-sticker` for placement tracking),
  status ('active' | 'removed'), createdAt, updatedAt.
- `apple_devices` — deviceLibraryId (pk), pushToken, updatedAt.
- `apple_registrations` — deviceLibraryId, serialNumber, passTypeId, createdAt; pk(device, serial).
- `messages` — id, cardId, title, body, createdAt, and delivery stats:
  appleTargets, appleSent, appleFailed, googleTargets, googleSent, googleFailed.

### Key flows

**Add to Apple Wallet**: `/c/[slug]` → POST `/api/passes/apple/[slug]` (email optional,
src) → create subscriber (serial, authToken) → build & sign `.pkpass`
(passTypeIdentifier, teamIdentifier, webServiceURL = `${BASE_URL}/api/apple`,
authenticationToken, generic pass: header = card name, secondary = latest message
with `changeMessage`, back = description + website + "powered by WalletCast")
→ `application/vnd.apple.pkpass` response. Wallet then calls the web service to
register the device.

**Apple web service** (PassKit spec, paths under `/api/apple/v1`):
- `POST   devices/{dev}/registrations/{passType}/{serial}` (auth `ApplePass <token>`) → 201/200
- `DELETE devices/{dev}/registrations/{passType}/{serial}` → 200 (marks subscriber removed when no registrations left)
- `GET    devices/{dev}/registrations/{passType}?passesUpdatedSince=` → `{serialNumbers, lastUpdated}` or 204
- `GET    passes/{passType}/{serial}` (auth) → latest signed pass, honours `If-Modified-Since` (304)
- `POST   log` → logs, 200

**Add to Google Wallet**: `/c/[slug]` → POST `/api/passes/google/[slug]` → ensure
GenericClass exists (`{issuerId}.wc_{cardId}`), create subscriber, return
`https://pay.google.com/gp/v/save/{jwt}` where the JWT embeds the GenericObject.

**Broadcast**: dashboard form (title, body) → `broadcast(cardId, msg)`:
1. persist message, set card.latestMessage(+At) and bump subscribers.updatedAt;
2. Apple: collect push tokens for active registrations of the card, send empty
   APNs pushes over HTTP/2 (topic = passTypeId, production gateway, client cert),
   concurrency-limited; tokens answered 410 are deleted;
3. Google: for each active google subscriber, `PATCH` object text + `addMessage`
   (`TEXT_AND_NOTIFY`), concurrency-limited;
4. store per-platform stats on the message; return them to the UI.

Platform clients are injected (interfaces `ApnsSender`, `GoogleWalletApi`) so the
broadcast logic is tested without network.

## 5. Operator UI (v1)

- `/login` — admin password (env `ADMIN_PASSWORD`), signed session cookie (7 days).
- `/dashboard` — cards list with subscriber counts; integration status banner.
- `/dashboard/cards/new` & `/dashboard/cards/[id]` — edit design (live preview),
  upload logo/icon (PNG/JPEG → resized PNG via sharp), public link, QR code
  (PNG/SVG download, optional `src` tag), subscribers table, send-notification form,
  message history with delivery stats.
- `/dashboard/settings` — which integrations are configured, links to setup docs.

## 6. Security

- Admin routes: session cookie (HS256, `SESSION_SECRET` ≥ 32 chars), `httpOnly`, `sameSite=lax`, `secure` in prod; server actions re-check the session.
- Apple web-service: constant-time token comparison per serial.
- Public issuance endpoints: in-memory rate limit per IP (documented as best-effort; put a CDN/WAF in front for scale).
- Input validation with zod at every boundary; image uploads limited to 2 MB and re-encoded.
- Secrets only via env; `.env.example` documents every variable; nothing secret in the repo.

## 7. Testing

- Vitest unit tests for `src/lib/**` (env parsing, validation, pass building,
  web-service handlers, broadcast fan-out, google mapping/JWT, rate limiter, session).
- DB tests run against in-memory PGlite (real SQL, no mocks).
- Apple signing tested with a throw-away self-signed certificate generated in the
  test setup (the pass structure is verified; Apple itself cannot be called in CI).
- Coverage target 80 % on `src/lib`.

## 8. Deployment

- `vercel` one-click (Postgres from Neon/Supabase via `DATABASE_URL`).
- `Dockerfile` (standalone output) + `docker-compose.yml` (app + postgres).
- Migrations applied automatically at startup (`drizzle-orm` migrator).
