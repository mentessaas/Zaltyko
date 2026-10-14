import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const verifierPath = join(root, "scripts/verify-owner-signup-consent-local.ts");
const localUrl = "postgresql://127.0.0.1:55491/postgres";

function runVerifier(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [
    "DATABASE_URL",
    "DATABASE_URL_POOL",
    "DATABASE_URL_DIRECT",
    "ZALTYKO_OWNER_SIGNUP_CONSENT_LOCAL_PG",
    "ZALTYKO_OWNER_SIGNUP_CONSENT_TEST_PG_PORT",
  ])
    delete env[name];
  Object.assign(env, overrides);
  return spawnSync(process.execPath, ["--import", "tsx", verifierPath], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15_000,
  });
}

function validEnv() {
  return {
    NODE_ENV: "test",
    ZALTYKO_OWNER_SIGNUP_CONSENT_LOCAL_PG: "1",
    ZALTYKO_OWNER_SIGNUP_CONSENT_TEST_PG_PORT: "55491",
    DATABASE_URL: localUrl,
    DATABASE_URL_POOL: localUrl,
    DATABASE_URL_DIRECT: localUrl,
  };
}

describe("guard del harness PostgreSQL canónico de consentimiento", () => {
  it("rechaza ejecución directa sin opt-in antes de importar el servicio", () => {
    const env: Record<string, string | undefined> = { ...validEnv() };
    delete env.ZALTYKO_OWNER_SIGNUP_CONSENT_LOCAL_PG;
    const result = runVerifier(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("LOCAL_HARNESS_OPT_IN_REQUIRED");
  });

  it("rechaza destinos remotos, credenciales embebidas y URLs distintas", () => {
    const remote = runVerifier({
      ...validEnv(),
      DATABASE_URL: "postgresql://project.supabase.co:5432/postgres",
    });
    expect(remote.status).toBe(1);
    expect(remote.stderr).toContain("DATABASE_URLS_MUST_TARGET_LOCAL_POSTGRES");

    const userinfo = runVerifier({
      ...validEnv(),
      DATABASE_URL_POOL: "postgresql://user:pass@127.0.0.1:55491/postgres",
    });
    expect(userinfo.status).toBe(1);
    expect(userinfo.stderr).toContain(
      "DATABASE_URLS_MUST_TARGET_LOCAL_POSTGRES"
    );

    const mismatch = runVerifier({
      ...validEnv(),
      DATABASE_URL_DIRECT: "postgresql://127.0.0.1:55492/postgres",
    });
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain(
      "DATABASE_URLS_MUST_TARGET_LOCAL_POSTGRES"
    );
  });

  it("no importa estáticamente DB/servicio y valida URLs antes del import dinámico", () => {
    const source = readFileSync(verifierPath, "utf8");
    expect(source).not.toMatch(/^import .*@\/db/m);
    expect(source).not.toMatch(/^import .*owner-signup-consent/m);
    const guard = source.indexOf(
      "validateLocalDatabaseEnvironment(process.env)"
    );
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf("main(databaseUrl)", guard));
  });
});
