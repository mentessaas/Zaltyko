import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { resolve } from "path";

config({ path: ".env.local" });
config({ path: ".env" });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("Debes definir DATABASE_URL");
}

if (process.env.NODE_EXTRA_CA_CERTS) {
  process.env.NODE_EXTRA_CA_CERTS = resolve(process.env.NODE_EXTRA_CA_CERTS);
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
  verbose: true,
  strict: true,
});
