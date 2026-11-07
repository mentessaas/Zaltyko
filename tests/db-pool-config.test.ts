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

  it("uses the DB-only CA with no global Node extra CA", () => {
    const config = createDatabasePoolConfig({
      connectionString: "postgresql://u:p@example.com:5432/db?sslmode=no-verify",
      production: true,
      env: { DATABASE_CA_CERT_PATH: CA_PATH, NODE_EXTRA_CA_CERTS: "" },
    });

    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
    expect((config.ssl as { ca: string }).ca).toContain("BEGIN CERTIFICATE");
    expect(String(config.connectionString)).not.toContain("sslmode");
  });

  it("prefers the DB-only CA to a stale global Node path", () => {
    const config = createDatabasePoolConfig({
      connectionString: "postgresql://u:p@example.com:5432/db",
      production: true,
      env: {
        DATABASE_CA_CERT_PATH: CA_PATH,
        NODE_EXTRA_CA_CERTS: "certs/nonexistent-legacy-ca.crt",
      },
    });

    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
  });

  it("fails closed for a missing DB-only CA instead of falling back to legacy", () => {
    expect(() => createDatabasePoolConfig({
      connectionString: "postgresql://u:p@example.com:5432/db",
      production: true,
      env: {
        DATABASE_CA_CERT_PATH: "certs/nonexistent-db-ca.crt",
        NODE_EXTRA_CA_CERTS: CA_PATH,
      },
    })).toThrow(/DATABASE_CA_CERT_PATH/);
  });

  it("still accepts the legacy CA if the DB-only setting is absent or empty", () => {
    const config = createDatabasePoolConfig({
      connectionString: "postgresql://u:p@example.com:5432/db",
      production: true,
      env: { DATABASE_CA_CERT_PATH: "", NODE_EXTRA_CA_CERTS: CA_PATH },
    });

    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
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

