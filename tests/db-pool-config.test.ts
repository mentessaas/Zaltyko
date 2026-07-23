import { describe, expect, it } from "vitest";

import {
  createDatabasePoolConfig,
  stripSslMode,
} from "@/db/pool-config";

const CA_PATH = "certs/supabase-root-ca.crt";

describe("database pool configuration", () => {
  it("fails closed for a remote database without a trusted CA", () => {
    expect(() =>
      createDatabasePoolConfig({
        connectionString:
          "postgresql://postgres:secret@aws-0-region.pooler.supabase.com:6543/postgres",
        production: true,
        env: {},
      })
    ).toThrow(/NODE_EXTRA_CA_CERTS/);
  });

  it("validates remote TLS and budgets five connections per production instance", () => {
    const config = createDatabasePoolConfig({
      connectionString:
        "postgresql://postgres:secret@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require",
      production: true,
      env: { NODE_EXTRA_CA_CERTS: CA_PATH },
    });

    expect(config.max).toBe(5);
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
    expect(String(config.connectionString)).not.toContain("sslmode");
  });

  it("keeps local development free of a CA requirement", () => {
    const config = createDatabasePoolConfig({
      connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      production: false,
      env: {},
    });

    expect(config.ssl).toBe(false);
    expect(config.max).toBe(10);
  });

  it("rejects invalid pool budgets", () => {
    expect(() =>
      createDatabasePoolConfig({
        connectionString: "postgresql://postgres:postgres@localhost:5432/postgres",
        production: true,
        env: { DATABASE_POOL_MAX: "0" },
      })
    ).toThrow(/positive integer/);
  });

  it("removes URL TLS parameters so they cannot override the verified config", () => {
    const value = stripSslMode(
      "postgresql://u:p@example.com:5432/db?sslmode=no-verify&application_name=zaltyko"
    );
    expect(value).not.toContain("sslmode");
    expect(value).toContain("application_name=zaltyko");
  });
});

