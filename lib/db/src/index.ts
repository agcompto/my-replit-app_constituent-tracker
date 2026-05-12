import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * Close the underlying PG pool. Call once during graceful shutdown after
 * the HTTP server has stopped accepting new connections and in-flight
 * requests have drained. Safe to call multiple times: subsequent calls
 * resolve immediately because `pool.end()` is idempotent on an ended pool.
 */
export async function closeDb(): Promise<void> {
  if (pool.ended) return;
  await pool.end();
}

export * from "./schema";
