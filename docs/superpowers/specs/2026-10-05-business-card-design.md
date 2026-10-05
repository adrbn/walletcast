# WalletCast as a living business card

Date: 2026-10-05. Deadline: usable on an iPhone by Thursday 8 Oct, shown at DevFest Roma on Saturday 10 Oct.

## Goal

Adrien shows a QR, the other person adds his card to Apple Wallet in one tap. The card looks like adrbn.dev (dark, one glow), its glow follows the hour of the day, it carries a QR so anyone holding it can pass it on, and Adrien can later push one message to everyone who added it.

The changes land in WalletCast itself as generic, optional card features. His card is then just one card on his own instance.

## What the pass looks like (variant A, "Nuit")

- Style: Apple `storeCard` (needed for a full-width strip image behind the primary field). Cards without a strip keep the current `generic` style, so existing passes are unchanged.
- Background `#0c0c0d`, foreground `#f4f2ee`, labels `#8d8a84`.
- Header: logo (the `</>` mark on the glow) and "adrbn".
- Strip: the day glow (mesh of three hues from DayHue, fading into the background) with a faint 16 px grid, one line in five stronger, as on adrbn.dev and Aura. Primary field over it: label "AI ENGINEER", value "Adrien Robino".
- Secondary field: the latest message, label configurable ("NOW" on his card, "LATEST" by default).
- Barcode: QR of the card's public page `BASE_URL/c/<slug>?src=pass`.
- Back: description (links, each on its own line, made tappable by Wallet), website, "Powered by WalletCast, open-source wallet notifications" (no em dash).
- No green, no monospace, no emoji, no middle dot, no em dash in any visible text.

## New card options (all optional, default off)

| Option | Type | Effect |
|---|---|---|
| `barcode` | boolean | Adds the share QR to Apple passes (and Google passes when configured) |
| `latestLabel` | string ≤ 12 | Label of the latest-message field, default "LATEST" |
| `contactUrl` | URL | Public page shows a "Save contact" button (his: a `.vcf` hosted on adrbn.dev) |
| `dayGlow` | boolean | Pass uses `storeCard` with a generated strip whose hue follows the hour in `GLOW_TIMEZONE` (default `Europe/Rome`) |

Schema change through a Drizzle migration; validation in `CardInputSchema`; fields in `CardForm` with the live preview updated.

## Day glow

- `src/lib/glow/hue.ts`: port of Aura's `DayHue` anchors and smoothstep easing (pure, unit tested against a few hours).
- `src/lib/glow/strip.ts`: builds an SVG (three radial gradients from the hue ±0.11, fade to background, grid lines) and rasterises it with `sharp` at 375×123, 750×246, 1125×369.
- The hue is quantised to 6 slots per day (every 4 h) so a pass only changes when a slot changes.
- `POST /api/cron/glow` protected by `CRON_SECRET`: for every `dayGlow` card whose slot changed since its last push, bump the pass `updatedAt` and send APNs pushes. Only the strip changes, no field with `changeMessage` changes, so the update is silent.
- Trigger: a GitHub Actions scheduled workflow every hour calling that route (Vercel Hobby cron is limited to once a day).

## Public page

- iPhone: existing "Add to Apple Wallet" button.
- Android or desktop without Google configured: "Save contact" (if `contactUrl`) and the website link, instead of a dead button.
- Restyled only through card colours; no new page design.

## Hosting

- New Vercel project for his instance, Neon Postgres via the Vercel marketplace, domain `card.adrbn.dev` (CNAME at Porkbun → Vercel). The domain is permanent: passes keep calling the URL they were issued with.
- Env: `DATABASE_URL`, `BASE_URL=https://card.adrbn.dev`, `ADMIN_PASSWORD`, `SESSION_SECRET`, Apple vars (from the working local setup), `CRON_SECRET`, `GLOW_TIMEZONE`.
- The `.vcf` lives in the private portfolio repo (`public/adrien-robino.vcf`): name, title, email, adrbn.dev, GitHub. No phone.

## Not in scope

- Google Wallet (issuer review takes days; Adrien can request it now, it switches on with env vars later).
- Per-person messages (broadcast is to everyone).

## Testing

- Unit: hue anchors and easing, slot quantisation, strip size per scale, schema validation of the new options, pass JSON (`storeCard` + barcode + label) for a `dayGlow` card and unchanged `generic` JSON for a plain card, cron route auth and "only changed slots push".
- Coverage thresholds of the repo stay green (`pnpm test:coverage`, `pnpm typecheck`, `pnpm lint`).
- Real device: add the card from `card.adrbn.dev` on his iPhone, broadcast one message (notification shows), trigger the glow route with a forced slot (strip changes, no notification).

## Risks

- Apple may throttle very frequent silent updates; 6 per day per pass is far below anything reported.
- If Neon can't be added from the CLI, Adrien accepts the marketplace terms in the browser (one click).
