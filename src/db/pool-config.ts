import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PoolConfig } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_PRODUCTION_POOL_MAX = 5;
const DEFAULT_DEVELOPMENT_POOL_MAX = 10;

export interface DatabasePoolEnvironment {
  NODE_EXTRA_CA_CERTS?: string;
  DATABASE_POOL_MAX?: string;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function stripSslMode(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslkey");
  url.searchParams.delete("sslrootcert");
  return url.toString();
}

export function createDatabasePoolConfig(args: {
  connectionString: string;
  production: boolean;
  env?: DatabasePoolEnvironment;
}): PoolConfig {
  const { connectionString, production, env = process.env } = args;
  const url = new URL(connectionString);
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  const caPath = env.NODE_EXTRA_CA_CERTS
    ? resolve(env.NODE_EXTRA_CA_CERTS)
    : undefined;

  if (!isLocal && (!caPath || !existsSync(caPath))) {
    throw new Error(
      "NODE_EXTRA_CA_CERTS must point to the trusted Supabase CA for remote PostgreSQL connections"
    );
  }

  const max = parsePositiveInteger(
    env.DATABASE_POOL_MAX,
    production ? DEFAULT_PRODUCTION_POOL_MAX : DEFAULT_DEVELOPMENT_POOL_MAX,
    "DATABASE_POOL_MAX"
  );

  return {
    connectionString: stripSslMode(connectionString),
    max,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: production ? 30_000 : undefined,
    allowExitOnIdle: true,
    ssl: isLocal
      ? false
      : {
          ca: readFileSync(caPath!, "utf8"),
          rejectUnauthorized: true,
        },
  };
}

