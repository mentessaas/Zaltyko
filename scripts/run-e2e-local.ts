/* eslint-disable no-console */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

import {
  E2E_DOMAIN_MIGRATIONS,
  E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
} from "./lib/e2e-domain-migrations";

const root = process.cwd();
const projectDirectory = mkdtempSync(join(tmpdir(), "zaltyko-e2e-local-"));
const projectId = basename(projectDirectory);
const localProject = (args: string[]) => [
  ...args,
  "--workdir",
  projectDirectory,
];

const safeEnvironment = Object.fromEntries(
  [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "LANG",
    "LC_ALL",
    "CI",
    "E2E_LOCAL_PROJECT",
  ].flatMap((key) =>
    process.env[key] ? [[key, process.env[key] as string]] : []
  )
) as NodeJS.ProcessEnv & { NODE_ENV?: "development" | "production" | "test" };
safeEnvironment.NODE_ENV = "test";

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = safeEnvironment as NodeJS.ProcessEnv
) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
      .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "<redacted>")
      .replace(
        /((?:ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|SECRET_KEY|PUBLISHABLE_KEY|Access Key|Secret Key)\s*[=:|]\s*)[^\s|]+/gi,
        "$1<redacted>"
      );
    const details = output.trim().split("\n").slice(-35).join("\n");
    throw new Error(
      `${command} failed with exit code ${result.status}.\n${details}`
    );
  }
  return result.stdout ?? "";
}

function parseEnv(output: string) {
  const parsed = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    parsed.set(line.slice(0, separator).trim(), value);
  }
  return parsed;
}

function required(values: Map<string, string>, name: string) {
  const value = values.get(name);
  if (!value) throw new Error(`Supabase local status omitted ${name}.`);
  return value;
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not select an isolated local app port.");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

void (async () => {
  let stackStarted = false;
  let testExitCode = 1;

  try {
    execFileSync("supabase", localProject(["init", "--yes"]), {
      cwd: root,
      env: safeEnvironment as NodeJS.ProcessEnv,
      stdio: "ignore",
    });

    const migrationDirectory = join(projectDirectory, "supabase", "migrations");
    mkdirSync(migrationDirectory, { recursive: true });
    const localMigrations = [
      ...E2E_DOMAIN_MIGRATIONS,
      ...E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
    ];
    for (const filename of localMigrations) {
      cpSync(
        resolve(root, "supabase", "migrations", filename),
        join(migrationDirectory, filename)
      );
    }

    // Keep this stack's identity unique even when multiple local runs overlap.
    const configPath = join(projectDirectory, "supabase", "config.toml");
    const config = readFileSync(configPath, "utf8").replace(
      /^project_id\s*=.*$/m,
      `project_id = "${projectId}"`
    );
    require("node:fs").writeFileSync(configPath, config);

    run("supabase", localProject(["start"]));
    stackStarted = true;

    const values = parseEnv(
      run("supabase", localProject(["status", "-o", "env"]))
    );
    const supabaseUrl = required(values, "API_URL");
    const databaseUrl = required(values, "DB_URL");
    const appPort = await findAvailablePort();
    const appUrl = `http://127.0.0.1:${appPort}`;
    const childEnv: NodeJS.ProcessEnv = {
      ...safeEnvironment,
      NODE_ENV: "test",
      E2E_LOCAL_SUPABASE: "true",
      E2E_LOCAL_RUN_ID: randomUUID(),
      BASE_URL: appUrl,
      PORT: String(appPort),
      NEXT_PUBLIC_APP_URL: appUrl,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: required(values, "ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: required(values, "SERVICE_ROLE_KEY"),
      SUPABASE_JWT_SECRET: required(values, "JWT_SECRET"),
      DATABASE_URL: databaseUrl,
      DATABASE_URL_DIRECT: databaseUrl,
      DATABASE_URL_POOL: databaseUrl,
      INTERNAL_AUTH_SECRET: randomUUID() + randomUUID(),
      STRIPE_SECRET_KEY: "sk_test_local_e2e_disabled",
      STRIPE_WEBHOOK_SECRET: "whsec_local_e2e_disabled",
      STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_local_e2e_disabled",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_local_e2e_disabled",
    };

    console.log(
      "Building the app against the disposable local Supabase stack."
    );
    run("pnpm", ["build"], {
      ...childEnv,
      NODE_ENV: "production",
    });

    const playwrightArgs = [
      "exec",
      "playwright",
      "test",
      "tests/e2e-owner-local-setup.spec.ts",
    ];
    if (process.env.E2E_LOCAL_PROJECT) {
      playwrightArgs.push("--project", process.env.E2E_LOCAL_PROJECT);
    }

    const result = spawnSync("pnpm", playwrightArgs, {
      cwd: root,
      env: childEnv,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    testExitCode = result.status ?? 1;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown local E2E error.";
    console.error(message);
    testExitCode = 1;
  } finally {
    if (stackStarted) {
      try {
        run("supabase", localProject(["stop", "--no-backup"]));
        console.log(
          "Supabase local stack stopped and disposable data volumes removed."
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown stop error";
        console.error(
          `Could not fully stop the isolated Supabase stack: ${message}`
        );
        testExitCode = 1;
      }
    }
    rmSync(projectDirectory, { recursive: true, force: true });
  }

  process.exitCode = testExitCode;
})();
