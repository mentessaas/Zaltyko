import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const isProduction = process.env.NODE_ENV === "production";

const connectionString = isProduction
  ? process.env.DATABASE_URL_POOL ?? process.env.DATABASE_URL
  : process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL_POOL o DATABASE_URL_DIRECT no están definidos");
}

const pool = new Pool({
  connectionString,
  max: isProduction ? 20 : undefined,
});

export const db = drizzle(pool);
