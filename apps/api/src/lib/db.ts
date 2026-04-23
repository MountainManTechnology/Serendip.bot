import { createDb, type Db } from "@serendip-bot/db";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const db: Db = createDb(connectionString);
