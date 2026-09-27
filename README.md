# WalletCast

**Send lock-screen notifications to your customers without building an app.**

WalletCast is a free, open-source, self-hosted way to use Apple Wallet and Google Wallet as a notification channel. People scan a QR code, tap **Add to Apple Wallet** or **Add to Google Wallet**, and your card sits in their wallet. From then on, every message you send shows up on their lock screen like a push notification.

- **No app** to build, publish or get people to install
- **No account** for your customers: one tap, done
- **No per-message fees** and no monthly SaaS subscription. It runs on your server.
- **Your data**: subscribers, emails and history stay in your database

Wallet-marketing SaaS products sell this for a monthly fee. WalletCast publishes the whole pipeline so anyone can run it.

## How it works

```
 QR code / link ──► /c/your-card ──► "Add to Wallet"
                                         │
            ┌────────────────────────────┴───────────────────────────┐
            ▼                                                        ▼
   Apple Wallet (.pkpass signed                          Google Wallet ("Save" link,
   with your Pass Type ID cert)                          JWT signed by your service account)
            │ device registers with                                  │
            │ WalletCast's web service                               │
            ▼                                                        ▼
   You send a message ─► WalletCast updates the card text ─► Apple: silent APNs push → device
                                                               downloads the new pass → the
                                                               changed field shows as a
                                                               lock-screen notification
                                                             ► Google: object PATCH + addMessage
                                                               (TEXT_AND_NOTIFY) → notification
```

Both wallets only notify when a pass changes, so WalletCast keeps a **Latest** field on the card. Each broadcast updates it, and the wallet shows the change on the lock screen.

## Features (v1)

- Card designer with live preview: colours, logo, icon, texts, website
- Public add-to-wallet page with device detection and an optional email field
- QR codes (PNG/SVG) with **placement tags** (`?src=window`, `?src=flyer`…) to see which QR works best
- One-click broadcast to every Apple and Google wallet, with delivery stats and history
- Full Apple PassKit web service (registration, updates, 304 caching, dead-token pruning)
- Subscriber CSV export
- Embedded database (zero setup) or any Postgres
- Docker image, docker-compose, and Vercel support

The [roadmap](docs/ROADMAP.md) covers scheduled and geo-targeted notifications, loyalty stamps, automations and multi-account.

## Quick start (local)

Requirements: Node 22+ and pnpm (`corepack enable`).

```bash
git clone https://github.com/adrbn/walletcast.git
cd walletcast
pnpm install
cp .env.example .env.local   # set ADMIN_PASSWORD and SESSION_SECRET (openssl rand -base64 48)
pnpm dev
```

Open http://localhost:3000/dashboard and create your first card. The dashboard works without any wallet credentials; the Add-to-Wallet buttons appear as soon as you configure a platform:

| Platform | Cost | Guide |
|---|---|---|
| Apple Wallet | Apple Developer Program, 99 $/year | [docs/setup-apple.md](docs/setup-apple.md) |
| Google Wallet | Free | [docs/setup-google.md](docs/setup-google.md) |

Apple devices only talk to an **HTTPS** server, so real iPhones need a deployed instance (or a tunnel like `cloudflared` / `ngrok` during development).

## Deploy

See [docs/deploy.md](docs/deploy.md) for Docker Compose (+ Caddy for HTTPS), Vercel + Neon, or any Node host.

```bash
cp .env.example .env && docker compose up -d
```

## Limits to know

- **Google** shows at most about **3 notifications per pass per 24 hours**. Extra messages still update the card without a notification. New Google issuers start in demo mode, and you must [request publishing access](docs/setup-google.md#4-go-live) before the public can save passes.
- **Apple** shows the notification when the text changes. Sending the exact same text twice produces no second notification.
- People can turn off notifications for a pass, or delete it. Removed passes are detected and marked as removed.

## Development

```bash
pnpm dev             # dev server
pnpm test            # unit + integration tests (PGlite in-memory, local TLS/HTTP2 fakes)
pnpm test:coverage   # coverage report (src/lib, 80% threshold)
pnpm typecheck       # next typegen + tsc
pnpm lint
pnpm db:generate     # new SQL migration after editing src/lib/db/schema.ts
```

Architecture, conventions and gotchas: [CLAUDE.md](CLAUDE.md) and [docs/specs](docs/specs).

## License

[AGPL-3.0](LICENSE). You can use, modify and self-host it freely. If you offer a modified WalletCast as a hosted service, you must publish your changes under the same license.

*Apple Wallet is a trademark of Apple Inc. Google Wallet is a trademark of Google LLC. WalletCast is not affiliated with either.*
