# Deploying WalletCast

WalletCast is a standard Next.js server. It needs:

- a public **HTTPS** URL (`BASE_URL`), because Apple devices refuse plain HTTP;
- a database. The embedded PGlite (a file on disk) works for a single long-running server; on serverless hosts, use Postgres.

Database migrations run automatically at startup.

## Option A: Docker Compose (VPS, home server)

```bash
git clone https://github.com/adrbn/walletcast.git && cd walletcast
cp .env.example .env        # fill BASE_URL, ADMIN_PASSWORD, SESSION_SECRET, Apple/Google
docker compose up -d        # app on :3000 + Postgres
```

Put a reverse proxy with TLS in front. With [Caddy](https://caddyserver.com), the whole `Caddyfile` is:

```
wallet.example.com {
  reverse_proxy localhost:3000
}
```

To run without Postgres, drop the `db` service and `DATABASE_URL`, and mount a volume on `/app/.data`. The Docker image stores PGlite there.

## Option B: Vercel + Neon (free tiers)

1. Create a Postgres database on [Neon](https://neon.tech) (or Supabase) and copy its connection string.
2. Import the repo on [Vercel](https://vercel.com/new).
3. Set the environment variables: `DATABASE_URL`, `BASE_URL=https://your-app.vercel.app` (or your domain), `ADMIN_PASSWORD`, `SESSION_SECRET`, plus the Apple and Google variables.
4. Deploy.

Notes:

- PGlite does **not** persist on Vercel. `DATABASE_URL` is required there.
- The rate limiter is in-memory, so each serverless instance counts separately.
- Very large broadcasts (tens of thousands of passes) can exceed the function timeout. Use a long-running host for those.

## Option C: any Node host (Railway, Render, Fly.io, bare metal)

```bash
pnpm install --frozen-lockfile
pnpm build
node .next/standalone/server.js    # after copying .next/static and src/lib/db/migrations next to it (see Dockerfile)
```

The Dockerfile is the reference for that layout, and most of these platforms can build it directly.

## Day glow

Cards with "Glow that follows the hour" get a colour strip that moves from violet at night to amber by day, in six 4-hour slots. The pass only changes when the slot changes, and the update is silent (no notification).

1. Set `CRON_SECRET` on the server (`openssl rand -base64 32`) and, if needed, `GLOW_TIMEZONE` (default `Europe/Rome`).
2. In your GitHub fork, add the repository secrets `GLOW_CRON_URL=https://<your-host>/api/cron/glow` and the same `CRON_SECRET`.
3. `.github/workflows/glow.yml` calls the route every hour. Any other scheduler works too: `POST` with `Authorization: Bearer <CRON_SECRET>`.

Without `CRON_SECRET` the route answers 404 and the workflow skips itself.

## Backups

Everything lives in the database: cards, subscribers and history. Back up Postgres, or the PGlite folder, regularly. Apple and Google credentials stay in environment variables, never in the database.

## Changing the domain

Passes store the web service URL they were issued with. If you move to a new `BASE_URL`, existing Apple passes keep calling the old one, so keep the old domain redirecting (HTTP 308) to the new one.
