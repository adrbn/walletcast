# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PGLITE_DIR=/app/.data/pglite
RUN addgroup -S walletcast && adduser -S walletcast -G walletcast \
    && mkdir -p /app/.data && chown walletcast:walletcast /app/.data
COPY --from=build --chown=walletcast:walletcast /app/.next/standalone ./
COPY --from=build --chown=walletcast:walletcast /app/.next/static ./.next/static
# Migrations are applied automatically at startup.
COPY --from=build --chown=walletcast:walletcast /app/src/lib/db/migrations ./src/lib/db/migrations
USER walletcast
VOLUME ["/app/.data"]
EXPOSE 3000
CMD ["node", "server.js"]
