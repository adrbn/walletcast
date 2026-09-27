# Roadmap

v1 (shipped) is the notification channel: design a card, share a link or QR, broadcast to Apple and Google wallets.

## v2: Timing & loyalty

- **Scheduled notifications.** Add a `scheduled_messages` table and a cron-triggered route (`/api/cron/dispatch`, protected by a `CRON_SECRET`; Vercel Cron or system cron) that calls `broadcast()`.
- **Geo notifications (Apple).** Passes accept up to 10 `locations` (lat/lng + `relevantText`), and iOS shows the card on the lock screen near a shop. Add a locations editor to the card and put them in `pass.json` in `src/lib/apple/pass.ts`. Google no longer supports geofenced pass notifications.
- **Loyalty stamps / points.** Add a `balance` column on subscribers, show it as a field on both passes, and bump it via a POS scan.
- **POS scan page.** A `/scan` page (camera + barcode reader) for staff. Add a QR barcode with the serial number to the passes, scan it, add a stamp, and push the update.
- **Per-card sender limits.** Show "Google notifications left today" per card.

## v3: Growth

- **Automations.** Welcome message after X hours, "we miss you" after N days, birthday (needs a date field on the add form).
- **Referral.** Each pass carries a personal link, and referred adds count toward rewards.
- **Printable material.** Generate A6 and A5 posters, table tents and stickers from the card design, with pre-tagged QR placements.
- **Multi-account.** Several businesses on one instance: users table, roles, per-organisation Apple and Google credentials.
- **Segmentation.** Broadcast only to a placement source or platform.
- **Webhooks / API.** Trigger broadcasts from other tools (Zapier, n8n, POS systems).

## Maybe

- Wallet pass analytics: open rate isn't available from either wallet. Removal events (Apple unregister) are already tracked.
- i18n of the public page (labels, lang detection).
- Samsung Wallet support.
