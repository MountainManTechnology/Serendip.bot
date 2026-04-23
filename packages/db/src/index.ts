import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema.js";

export * from "./schema.js";
// Re-export commonly used drizzle operators so consumers don't import drizzle-orm directly
export {
  eq,
  and,
  or,
  desc,
  asc,
  inArray,
  isNull,
  isNotNull,
  sql,
  count,
  gt,
  lt,
  gte,
  lte,
} from "drizzle-orm";

export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema });
}

export type Db = ReturnType<typeof createDb>;

/**
 * Ensure required Postgres extensions exist.
 * Must be called BEFORE runMigrations — the first migration references
 * uuid_generate_v4() (uuid-ossp) and vector columns (pgvector).
 */
export async function bootstrapExtensions(
  connectionString: string,
): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);
  } finally {
    await pool.end();
  }
}

/**
 * Run all pending Drizzle migrations from the given folder.
 * Intended to be called once at API startup before the server begins accepting traffic.
 */
export async function runMigrations(
  connectionString: string,
  migrationsFolder: string,
): Promise<void> {
  const db = drizzle(connectionString, { schema });
  await migrate(db, { migrationsFolder });
}
