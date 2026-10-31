import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";
import { env } from "../lib/env";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 5_000,
  ssl: env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: true }
});

attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export { pool };