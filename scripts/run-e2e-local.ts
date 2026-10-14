/* eslint-disable no-console */
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

import {
  cleanupLocalProject,
  createTerminationHandler,
  LOCAL_E2E_TIMEOUTS,
  LocalCommandError,
  runLocalCommand,
} from "./lib/local-e2e-runner-core";
import {
  assertSupportedNodeVersion,
  findMissingImages,
  localCliPath,
  REQUIRED_LOCAL_SUPABASE_IMAGES,
  resolveExecutableOnPath,
  verifyInstalledRunnerPackages,
  verifySupabaseCliBinary,
} from "./lib/local-e2e-preflight";
import {
  E2E_DOMAIN_MIGRATIONS,
  E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
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
safeEnvironment.NEXT_TELEMETRY_DISABLED = "1";

function formatCommandError(command: string, error: LocalCommandError) {
  const output = `${error.stdout}\n${error.stderr}`
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "<redacted>")
    .replace(
      /((?:ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|SECRET_KEY|PUBLISHABLE_KEY|Access Key|Secret Key)\s*[=:|]\s*)[^\s|]+/gi,
      "$1<redacted>"
    );
  const details = output.trim().split("\n").slice(-35).join("\n");
  const reason = error.message.replace(
    /((?:ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|SECRET_KEY|PUBLISHABLE_KEY)\s*[=:|]\s*)[^\s|]+/gi,
    "$1<redacted>"
  );
  return new Error(`${command}: ${reason}\n${details}`);
}

async function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = safeEnvironment as NodeJS.ProcessEnv,
  timeoutMs: number = LOCAL_E2E_TIMEOUTS.setup,
  signal?: AbortSignal,
  stdio: "pipe" | "inherit" = "pipe"
) {
  try {
    const result = await runLocalCommand(command, args, {
      cwd: root,
      env,
      timeoutMs,
      signal,
      stdio,
    });
    return result.stdout;
  } catch (error) {
    if (error instanceof LocalCommandError) {
      throw formatCommandError(command, error);
    }
    throw error;
  }
}

async function runAllowExitCode(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  signal?: AbortSignal,
  stdio: "pipe" | "inherit" = "pipe"
) {
  return runLocalCommand(command, args, {
    cwd: root,
    env,
    timeoutMs,
    signal,
    stdio,
    allowNonZero: true,
  });
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
  let stackStartAttempted = false;
  let testExitCode = 1;
  let supabaseCli: string | undefined;
  let receivedSignal: NodeJS.Signals | undefined;
  const abortController = new AbortController();
  const signalHandler = createTerminationHandler(abortController, (signal) => {
    receivedSignal ??= signal;
  });
  const onSigint = () => signalHandler("SIGINT");
  const onSigterm = () => signalHandler("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    assertSupportedNodeVersion(process.versions.node);
    verifyInstalledRunnerPackages(root);
    const nextCli = localCliPath(root, "next");
    const playwrightCli = localCliPath(root, "playwright");
    supabaseCli = resolveExecutableOnPath("supabase", safeEnvironment.PATH);
    const dockerCli = resolveExecutableOnPath("docker", safeEnvironment.PATH);
    verifySupabaseCliBinary(supabaseCli);
    await run(
      dockerCli,
      ["info", "--format", "{{.ServerVersion}}"],
      safeEnvironment as NodeJS.ProcessEnv,
      LOCAL_E2E_TIMEOUTS.preflight,
      abortController.signal
    );
    const installedImages = (
      await run(
        dockerCli,
        ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}"],
        safeEnvironment as NodeJS.ProcessEnv,
        LOCAL_E2E_TIMEOUTS.preflight,
        abortController.signal
      )
    )
      .split(/\r?\n/)
      .filter(Boolean);
    const missingImages = findMissingImages(
      REQUIRED_LOCAL_SUPABASE_IMAGES,
      installedImages
    );
    if (missingImages.length > 0) {
      throw new Error(
        `Local E2E is fail-closed: Docker images are missing and will not be pulled:\n${missingImages.map((image) => `- ${image}`).join("\n")}`
      );
    }

    await run(
      supabaseCli,
      localProject(["init", "--yes"]),
      undefined,
      LOCAL_E2E_TIMEOUTS.setup,
      abortController.signal
    );

    const migrationDirectory = join(projectDirectory, "supabase", "migrations");
    mkdirSync(migrationDirectory, { recursive: true });
    const localMigrations = [
      ...E2E_DOMAIN_MIGRATIONS,
      ...E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
      ...E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
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
    writeFileSync(configPath, config);

    stackStartAttempted = true;
    await run(
      supabaseCli,
      localProject(["start", "--exclude", "supavisor"]),
      undefined,
      LOCAL_E2E_TIMEOUTS.setup,
      abortController.signal
    );

    const values = parseEnv(
      await run(
        supabaseCli,
        localProject(["status", "-o", "env"]),
        undefined,
        LOCAL_E2E_TIMEOUTS.setup,
        abortController.signal
      )
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
    await run(
      process.execPath,
      [nextCli, "build"],
      { ...childEnv, NODE_ENV: "production" },
      LOCAL_E2E_TIMEOUTS.build,
      abortController.signal
    );

    const playwrightArgs = ["test", "tests/e2e-owner-local-setup.spec.ts"];
    if (process.env.E2E_LOCAL_PROJECT) {
      playwrightArgs.push("--project", process.env.E2E_LOCAL_PROJECT);
    }

    const result = await runAllowExitCode(
      playwrightCli,
      playwrightArgs,
      childEnv,
      LOCAL_E2E_TIMEOUTS.browser,
      abortController.signal,
      "inherit"
    );
    testExitCode = result.status ?? 1;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown local E2E error.";
    console.error(message);
    testExitCode = 1;
  } finally {
    const cleanup = await cleanupLocalProject({
      startAttempted: stackStartAttempted,
      stop: async () => {
        await run(
          supabaseCli!,
          localProject(["stop", "--no-backup"]),
          undefined,
          LOCAL_E2E_TIMEOUTS.stop
        );
        console.log(
          "Supabase local stack stopped and disposable data volumes removed."
        );
      },
      removeProject: () =>
        rmSync(projectDirectory, { recursive: true, force: true }),
      onStopError: (error) => {
        const message =
          error instanceof Error ? error.message : "unknown stop error";
        console.error(
          `Could not fully stop the isolated Supabase stack; project files preserved at ${projectDirectory}: ${message}`
        );
        testExitCode = 1;
      },
    });
    if (cleanup.preserveProjectDirectory) testExitCode = 1;
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }

  if (receivedSignal) testExitCode = receivedSignal === "SIGINT" ? 130 : 143;
  process.exitCode = testExitCode;
})();
