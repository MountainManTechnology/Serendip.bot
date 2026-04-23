import { createDb, type Db } from "@serendip-bot/db";

const connectionString =
  process.env["DATABASE_URL"] ??
  "postgres://postgres:postgres@localhost:5432/stumble";

export const db: Db = createDb(connectionString);
