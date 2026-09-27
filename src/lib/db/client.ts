import path from "node:path";
import { mkdirSync } from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getConfig } from "@/lib/config/env";
import * as schema from "./schema";

/** Driver-agnostic database handle (postgres-js in production, PGlite locally/tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "src/lib/db/migrations");

async function connectPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

/** Embedded Postgres (WASM). `dataDir` undefined = in-memory. */
export async function connectPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

// Survive Next.js dev hot-reloads: keep one connection per process.
const globalForDb = globalThis as unknown as { walletcastDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.walletcastDb) {
    const config = getConfig();
    globalForDb.walletcastDb = config.databaseUrl
      ? connectPostgres(config.databaseUrl)
      : connectPglite(config.pgliteDir);
    globalForDb.walletcastDb.catch(() => {
      globalForDb.walletcastDb = undefined;
    });
  }
  return globalForDb.walletcastDb;
}
