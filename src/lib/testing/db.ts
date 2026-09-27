import { connectPglite, type Db } from "@/lib/db/client";

/** Fresh in-memory Postgres (PGlite) with migrations applied. */
export function createTestDb(): Promise<Db> {
  return connectPglite();
}
