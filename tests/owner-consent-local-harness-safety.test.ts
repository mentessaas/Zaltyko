import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const verifierPath = join(root, "scripts/verify-owner-consent-store-local.ts");

function runVerifier(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [
    "DATABASE_URL",
    "DATABASE_URL_POOL",
    "DATABASE_URL_DIRECT",
    "ZALTYKO_OWNER_CONSENT_LOCAL_PG",
    "ZALTYKO_OWNER_CONSENT_TEST_PG_PORT",
  ]) {
    delete env[name];
  }
  Object.assign(env, overrides);
  return spawnSync(process.execPath, ["--import", "tsx", verifierPath], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15_000,
  });
}

describe("guard del harness PostgreSQL de consentimiento", () => {
  it("rechaza ejecución directa sin opt-in antes de abrir la base de datos", () => {
    const localUrl = "postgresql://127.0.0.1:55489/postgres";
    const result = runVerifier({
      NODE_ENV: "test",
      ZALTYKO_OWNER_CONSENT_TEST_PG_PORT: "55489",
      DATABASE_URL: localUrl,
      DATABASE_URL_POOL: localUrl,
      DATABASE_URL_DIRECT: localUrl,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("LOCAL_HARNESS_OPT_IN_REQUIRED");
  });

  it("rechaza URLs remotas antes del import dinámico del store", () => {
    const remoteUrl = "postgresql://project.supabase.co:5432/postgres";
    const result = runVerifier({
      NODE_ENV: "test",
      ZALTYKO_OWNER_CONSENT_LOCAL_PG: "1",
      ZALTYKO_OWNER_CONSENT_TEST_PG_PORT: "55489",
      DATABASE_URL: remoteUrl,
      DATABASE_URL_POOL: remoteUrl,
      DATABASE_URL_DIRECT: remoteUrl,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DATABASE_URLS_MUST_TARGET_LOCAL_POSTGRES");
  });

  it("no importa el store estáticamente y valida antes de llamar al runner", () => {
    const source = readFileSync(verifierPath, "utf8");
    expect(source).not.toMatch(/^import .*owner-consent-store/m);
    expect(
      source.indexOf("validateLocalDatabaseEnvironment(process.env)")
    ).toBeLessThan(source.indexOf("main(databaseUrl)"));
  });
});
