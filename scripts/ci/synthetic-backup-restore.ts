import {
  createCipheriv,
  createDecipheriv,
  createHash,
  getCiphers,
  randomUUID,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { isIP, Socket } from "node:net";

import { Client } from "pg";

const BRANCH = "codex/disposable-backup-probe-20261105";
const BASELINE_NAME = "20261024172153_sandbox_schema_snapshot_baseline.sql";
const BASELINE_SHA256 = "fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36";
const RLS_MIGRATION_NAME = "20261024193934_rls_guard_missing_public_tables.sql";
const RLS_MIGRATION_SHA256 = "005d16a4b2f87727c2c47b3affe5ccd5433323fdcf02404135cbf5d11be07959";
const SEED_MIGRATION_NAME = "20261024223700_seed_owner_bootstrap_sport_profiles.sql";
const SEED_MIGRATION_SHA256 = "d8c2a0b81a0d7f75f1f94ebd0f131ab85775a6e7904e2606a980570cbc02c225";
const TENANT_FIXTURE_SHA256 = "51480aba756d3c1b581da0c28e1ac3bcfee024e3ba2eef038982bbb09f23b06c";
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const ENVELOPE_MAGIC = Buffer.from("ZKSBKR1\n", "ascii");
const EXTENSIONS = [
  ["btree_gist", "1.7", "extensions"],
  ["pg_stat_statements", "1.11", "extensions"],
  ["pgcrypto", "1.3", "extensions"],
  ["plpgsql", "1.0", "pg_catalog"],
  ["supabase_vault", "0.3.1", "vault"],
  ["uuid-ossp", "1.1", "extensions"],
] as const;
const APP_SCHEMAS = ["auth", "extensions", "public", "vault", "zaltyko", "zaltyko_domain_private", "zaltyko_private"];
const REQUIRED_ROLES = ["anon", "authenticated", "service_role", "postgres", "supabase_admin", "pg_database_owner"];
const LEDGER_AMOUNT_CENTS = 35025;
const LEDGER_PAYMENT_CENTS = 12550;
const LEDGER_BALANCE_CENTS = 22475;
const BUSY_GUARD_SENTINEL = "ci_synthetic_restore_busy_sentinel";
// Fixed startup option for this probe's private connections only. Never use a
// caller-provided PGOPTIONS value or change persistent role/database settings.
const SESSION_ROLE_OPTIONS = "-c role=none";
const IDENTITY_CODES = [
  "ROLE_RESET", "LOGIN_ROLE", "ACTIVE_ROLE", "SUPERUSER", "DB_NAME",
  "SERVER_MAJOR", "SERVER_ADDR", "SERVER_PORT", "RECOVERY", "ROLE_SET",
  "EXT_SET", "TEMPLATE", "URL_ROLE", "POOL_ROLE", "TCP_PEER", "SERVER_PAIR",
] as const;
type IdentityCode = (typeof IDENTITY_CODES)[number];

type SafePhase =
  | "environment"
  | "clients"
  | "postgres-identity"
  | "database-create"
  | "schema-replay"
  | "fixture"
  | "ledger-service"
  | "source-fingerprint"
  | "dump"
  | "archive-validation"
  | "restore"
  | "comparison"
  | "cleanup"
  | "ledger-child";

class SafeFailure extends Error {
  readonly phase: SafePhase;
  readonly safeCode?: string;

  constructor(phase: SafePhase, safeCode?: string) {
    super("Synthetic restore experiment failed");
    this.name = "SafeFailure";
    this.phase = phase;
    this.safeCode = safeCode;
  }
}
type Marker = {
  branch: string;
  expected_sha: string;
  run_id: string;
  run_attempt: string;
};

type ClientManifestItem = {
  name: string;
  path_relative: string | null;
  version: string | null;
  sha256: string | null;
};

type ClientManifest = {
  probe: string;
  marker: Marker;
  clients: ClientManifestItem[];
};

type LedgerFixture = {
  organizationId: string;
  ownerUserId: string;
  ownerMemberId: string;
  locationId: string;
  familyId: string;
  invoiceId: string;
  invoiceLineId: string;
  chargeId: string;
  currency: "EUR" | "MXN";
  idempotencyKey: string;
};

type DatabaseMarker = {
  name: string;
  comment: string;
  role: "source" | "target";
};

type ProcessResult = { stdout: Buffer; stderr: Buffer };

const ROOT = resolve(__dirname, "../..");
const BASELINE_PATH = join(ROOT, "supabase/schema-snapshots", BASELINE_NAME);
const RLS_MIGRATION_PATH = join(ROOT, "supabase/migrations", RLS_MIGRATION_NAME);
const SEED_MIGRATION_PATH = join(ROOT, "supabase/migrations", SEED_MIGRATION_NAME);
const TENANT_FIXTURE_PATH = join(ROOT, "scripts/ci/sandbox-tenant-isolation.sql");

function demand(condition: unknown, phase: SafePhase): asserts condition {
  if (!condition) throw new SafeFailure(phase);
}

function demandIdentity(condition: unknown, phase: SafePhase, code: IdentityCode): asserts condition {
  if (!condition) throw new SafeFailure(phase, code);
}

function isIdentityCode(value: unknown): value is IdentityCode {
  return typeof value === "string" && IDENTITY_CODES.some((code) => code === value);
}

function log(event: string, details: Record<string, string | number | boolean> = {}) {
  process.stdout.write(`${JSON.stringify({ status: "INFO", event, ...details })}\n`);
}

function digest(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = String((error as { code?: unknown }).code ?? "");
  return /^[A-Z0-9_]{2,12}$/.test(code) ? code : undefined;
}

function phaseFailure(phase: SafePhase, error: unknown): SafeFailure {
  if (error instanceof SafeFailure) return error;
  return new SafeFailure(phase, safeErrorCode(error));
}

function validateRuntimeEnvironment() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  demand(nodeMajor === 22, "environment");
  demand(Boolean(process.versions.openssl), "environment");
  demand(new Set(requireAesGcmCiphers()).has("aes-256-gcm"), "environment");
  demand(process.platform === "linux" && process.getuid?.() !== undefined, "environment");
  demand(process.env.GITHUB_ACTIONS === "true", "environment");
  demand(process.env.RUNNER_OS === "Linux", "environment");
  demand(process.env.DISPOSABLE_BACKUP_MODE === "synthetic-restore", "environment");
  demand(process.env.GITHUB_REF === `refs/heads/${BRANCH}`, "environment");
  demand(process.env.DISPATCH_REF === process.env.GITHUB_REF, "environment");
  demand(process.env.EXPECTED_SHA === process.env.DISPATCH_SHA, "environment");
  demand(/^[0-9a-f]{40}$/.test(process.env.EXPECTED_SHA ?? ""), "environment");
  demand(/^[0-9]+$/.test(process.env.GITHUB_RUN_ID ?? ""), "environment");
  demand(/^[0-9]+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? ""), "environment");

  for (const name of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "DATABASE_URL",
    "DATABASE_URL_POOL",
    "DATABASE_URL_DIRECT",
    "STRIPE_SECRET_KEY",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ]) {
    demand(!process.env[name], "environment");
  }
}

function requireAesGcmCiphers() {
  return getCiphers();
}

function privatePath(name: string): string {
  const value = process.env[name];
  demand(Boolean(value) && isAbsolute(value ?? ""), "environment");
  return value!;
}

function checkPrivateFile(path: string, phase: SafePhase, expectedBytes?: number): Buffer {
  try {
    const item = lstatSync(path);
    demand(item.isFile() && !item.isSymbolicLink(), phase);
    demand(item.uid === process.getuid?.(), phase);
    demand((item.mode & 0o077) === 0, phase);
    if (expectedBytes !== undefined) demand(item.size === expectedBytes, phase);
    return readFileSync(path);
  } catch (error) {
    throw phaseFailure(phase, error);
  }
}

function checkPrivateDirectory(path: string, phase: SafePhase): string {
  try {
    const info = lstatSync(path);
    demand(info.isDirectory() && !info.isSymbolicLink(), phase);
    demand(info.uid === process.getuid?.(), phase);
    demand((info.mode & 0o077) === 0, phase);
    const canonical = realpathSync(path);
    demand(canonical === resolve(path), phase);
    return canonical;
  } catch (error) {
    throw phaseFailure(phase, error);
  }
}

function checkRunnerTemp(path: string): string {
  try {
    const info = lstatSync(path);
    demand(info.isDirectory() && !info.isSymbolicLink(), "environment");
    demand(info.uid === process.getuid?.(), "environment");
    const canonical = realpathSync(path);
    demand(canonical === resolve(path), "environment");
    return canonical;
  } catch (error) {
    throw phaseFailure("environment", error);
  }
}

function writePrivateFile(path: string, content: Buffer | string, phase: SafePhase) {
  try {
    demand(!existsSync(path), phase);
    writeFileSync(path, content, { flag: "wx", mode: 0o600 });
    chmodSync(path, 0o600);
    const info = lstatSync(path);
    demand(info.isFile() && !info.isSymbolicLink(), phase);
    demand(info.uid === process.getuid?.() && (info.mode & 0o077) === 0, phase);
  } catch (error) {
    throw phaseFailure(phase, error);
  }
}

function removePrivateFile(path: string) {
  try {
    if (existsSync(path)) unlinkSync(path);
    demand(!existsSync(path), "cleanup");
  } catch (error) {
    throw phaseFailure("cleanup", error);
  }
}

function isWithin(path: string, directory: string) {
  const rel = relative(directory, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function readMarkerAndManifest(): { marker: Marker; manifest: ClientManifest } {
  const marker: Marker = {
    branch: BRANCH,
    expected_sha: process.env.EXPECTED_SHA ?? "",
    run_id: process.env.GITHUB_RUN_ID ?? "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT ?? "",
  };
  const manifestFile = privatePath("CLIENT_MANIFEST_FILE");
  const runnerTemp = checkRunnerTemp(privatePath("RUNNER_TEMP"));
  demand(isWithin(resolve(manifestFile), runnerTemp), "environment");
  let manifest: ClientManifest;
  try {
    manifest = JSON.parse(checkPrivateFile(manifestFile, "clients").toString("utf8")) as ClientManifest;
  } catch (error) {
    throw phaseFailure("clients", error);
  }
  demand(manifest.probe === "native-postgresql-client-inventory-only", "clients");
  demand(
    manifest.marker.branch === marker.branch &&
      manifest.marker.expected_sha === marker.expected_sha &&
      manifest.marker.run_id === marker.run_id &&
      manifest.marker.run_attempt === marker.run_attempt,
    "clients"
  );
  demand(Array.isArray(manifest.clients), "clients");
  return { marker, manifest };
}

function privateDirectories() {
  const workdir = checkPrivateDirectory(privatePath("CI_WORKDIR"), "environment");
  const cliHome = checkPrivateDirectory(privatePath("CLI_HOME"), "environment");
  const runnerTemp = checkRunnerTemp(privatePath("RUNNER_TEMP"));
  demand(isWithin(workdir, runnerTemp) && workdir !== runnerTemp, "environment");
  demand(isWithin(cliHome, runnerTemp) && cliHome !== runnerTemp, "environment");
  return { workdir, cliHome, runnerTemp };
}

function resolveClient(name: "pg_dump" | "pg_restore", manifest: ClientManifest, cliHome: string): string {
  const entries = manifest.clients.filter((item) => item.name === name);
  demand(entries.length === 1, "clients");
  const entry = entries[0]!;
  demand(typeof entry.path_relative === "string" && typeof entry.sha256 === "string", "clients");
  demand(typeof entry.version === "string" && /^17\.11(?:\.|\s+\(|$)/.test(entry.version), "clients");
  const expectedRelative = `cache/stack/slim-services/postgres/17.11.0.002-r0/linux-amd64/bin/${name}`;
  demand(entry.path_relative === expectedRelative, "clients");
  const path = resolve(cliHome, entry.path_relative);
  demand(isWithin(path, cliHome), "clients");
  try {
    const item = lstatSync(path);
    demand(item.isFile() && !item.isSymbolicLink(), "clients");
    demand(item.uid === process.getuid?.(), "clients");
    demand((item.mode & 0o022) === 0 && (item.mode & 0o111) !== 0, "clients");
    demand(realpathSync(path) === path, "clients");
    demand(digest(readFileSync(path)) === entry.sha256, "clients");
  } catch (error) {
    throw phaseFailure("clients", error);
  }
  const version = runProcessSync(path, ["--version"], { HOME: cliHome, LC_ALL: "C", PATH: "/usr/bin:/bin", NODE_ENV: "test" });
  const versionText = version.stdout.toString("ascii").trim();
  const match = versionText.match(new RegExp(`^${name} \\(PostgreSQL\\) (17\\.11(?:\\.[0-9]+)?(?: \\([A-Za-z0-9 ._+-]{1,80}\\))?)$`));
  demand(match?.[1] === entry.version, "clients");
  return path;
}

function runProcessSync(binary: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    env,
    encoding: null,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new SafeFailure("clients", safeErrorCode(result.error));
  }
  return { stdout: result.stdout };
}

function runProcess(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  phase: SafePhase,
  timeoutMs = 8 * 60_000,
  outputLimit = 4 * 1024 * 1024
): Promise<ProcessResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(binary, args, {
        cwd: ROOT,
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      rejectPromise(phaseFailure(phase, error));
      return;
    }

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let total = 0;
    let overflow = false;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = () => {
      child.kill("SIGTERM");
      hardTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    };
    const timer = setTimeout(terminate, timeoutMs);
    const onData = (target: Buffer[], chunk: Buffer) => {
      total += chunk.length;
      if (total > outputLimit) {
        overflow = true;
        terminate();
        return;
      }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on("data", (chunk: Buffer) => onData(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => onData(stderr, chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      rejectPromise(phaseFailure(phase, error));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      if (overflow || code !== 0) {
        // Only this fixed diagnostic allowlist can escape a failed ledger
        // child's captured stdout; never expose its stderr or arbitrary text.
        if (!overflow && phase === "ledger-service") {
          try {
            const lastLine = Buffer.concat(stdout).toString("utf8").trim().split(/\r?\n/).at(-1) ?? "";
            const result = JSON.parse(lastLine) as { status?: unknown; code?: unknown };
            if (result.status === "FAIL" && isIdentityCode(result.code)) {
              rejectPromise(new SafeFailure(phase, result.code));
              return;
            }
          } catch { /* Withhold malformed or unrecognized child output. */ }
        }
        rejectPromise(new SafeFailure(phase));
        return;
      }
      resolvePromise({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function parseLoopbackUrl(path: string): { url: URL; host: string; port: number; password: string } {
  const raw = checkPrivateFile(path, "postgres-identity").toString("utf8").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFailure("postgres-identity");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port);
  const query = [...url.searchParams.entries()];
  demand(url.protocol === "postgres:" || url.protocol === "postgresql:", "postgres-identity");
  demand(["127.0.0.1", "::1", "localhost"].includes(host), "postgres-identity");
  demand(Number.isInteger(port) && port > 0 && port <= 65535, "postgres-identity");
  demand(url.username === "supabase_admin" && Boolean(url.password), "postgres-identity");
  let password: string;
  try {
    password = decodeURIComponent(url.password);
  } catch {
    throw new SafeFailure("postgres-identity");
  }
  demand(!/[\r\n]/.test(password), "postgres-identity");
  demand(url.pathname === "/postgres" && !url.hash, "postgres-identity");
  demand(query.length === 1 && query[0]?.[0] === "sslmode" && query[0]?.[1] === "disable", "postgres-identity");
  return { url, host, port, password };
}

function makeDatabaseUrl(base: URL, databaseName: string): string {
  const url = new URL(base.toString());
  url.pathname = `/${databaseName}`;
  url.search = "";
  url.searchParams.set("sslmode", "disable");
  url.searchParams.set("options", SESSION_ROLE_OPTIONS);
  url.hash = "";
  return url.toString();
}

function parseOwnDatabaseUrl(value: string, phase: SafePhase): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SafeFailure(phase, "URL_ROLE");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const query = [...url.searchParams.entries()];
  demandIdentity(
    (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
    ["127.0.0.1", "::1", "localhost"].includes(host) &&
    Number.isInteger(Number(url.port)) && Number(url.port) > 0 && Number(url.port) <= 65535 &&
    url.username === "supabase_admin" && Boolean(url.password) && !url.hash &&
    /^\/zk_(src|dst)_[0-9]+_[0-9]+_[0-9a-f]{8}$/.test(url.pathname) &&
    query.length === 2 && url.searchParams.get("sslmode") === "disable" &&
    url.searchParams.get("options") === SESSION_ROLE_OPTIONS,
    phase, "URL_ROLE"
  );
  return url;
}

function writePgpass(path: string, host: string, port: number, password: string) {
  const escapePgpass = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
  const row = [host, String(port), "*", "supabase_admin", password].map(escapePgpass).join(":");
  writePrivateFile(path, `${row}\n`, "postgres-identity");
}

function buildClientEnvironment(host: string, port: number, pgpassfile: string, home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    NODE_ENV: "test",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
    PGPASSFILE: pgpassfile,
    PGCONNECT_TIMEOUT: "5",
    PGHOST: host,
    PGPORT: String(port),
    PGUSER: "supabase_admin",
    PGSSLMODE: "disable",
    PGOPTIONS: SESSION_ROLE_OPTIONS,
  };
}

function connectClient(connectionString: string) {
  return new Client({
    connectionString,
    options: SESSION_ROLE_OPTIONS,
    application_name: "zaltyko_synthetic_restore_ci",
    connectionTimeoutMillis: 8_000,
    query_timeout: 8 * 60_000,
    statement_timeout: 8 * 60_000,
  });
}

function clientTcpEvidence(client: Client, host: string, port: number) {
  // Both properties are public in @types/pg. Narrow Duplex to the actual
  // Node TCP socket; no private-property casts or fallback to configured host.
  const socket = client.connection.stream;
  const isTcp = socket instanceof Socket;
  const peerAddress = isTcp ? socket.remoteAddress : undefined;
  const loopback = peerAddress === "127.0.0.1" || peerAddress === "::1";
  return {
    socket_is_tcp: isTcp,
    socket_peer_loopback: loopback,
    socket_host_matches: loopback && (host === "localhost" || peerAddress === host),
    socket_port_matches: isTcp && Number.isInteger(socket.remotePort) && socket.remotePort === port,
  };
}

function verifyClientTcpEndpoint(client: Client, host: string, port: number, phase: SafePhase) {
  const evidence = clientTcpEvidence(client, host, port);
  log("postgres_client_socket_observed", { phase, ...evidence });
  demandIdentity(
    evidence.socket_is_tcp && evidence.socket_peer_loopback &&
    evidence.socket_host_matches && evidence.socket_port_matches,
    phase, "TCP_PEER"
  );
}

function sqlWithoutPsqlGuards(source: string, phase: SafePhase): string {
  const lines = source.split(/\r?\n/);
  const guards: { kind: string; token: string }[] = [];
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("\\")) {
      kept.push(line);
      continue;
    }
    const match = trimmed.match(/^\\(restrict|unrestrict)\s+([A-Za-z0-9_-]{1,128})$/);
    demand(Boolean(match), phase);
    guards.push({ kind: match![1]!, token: match![2]! });
  }
  if (guards.length > 0) {
    demand(guards.length === 2, phase);
    demand(guards[0]?.kind === "restrict" && guards[1]?.kind === "unrestrict", phase);
    demand(guards[0]?.token === guards[1]?.token, phase);
  }
  return kept.join("\n");
}

function markerForDatabase(marker: Marker, role: "source" | "target") {
  return `zaltyko-disposable-synthetic-restore;branch=${marker.branch};run=${marker.run_id};attempt=${marker.run_attempt};sha=${marker.expected_sha};role=${role}`;
}

function validateDatabaseNames(marker: Marker) {
  const suffix = `${marker.run_id}_${marker.run_attempt}_${marker.expected_sha.slice(0, 8)}`;
  const names = {
    source: `zk_src_${suffix}`,
    target: `zk_dst_${suffix}`,
  };
  demand(names.source.length <= 63 && names.target.length <= 63, "database-create");
  demand(/^[a-z0-9_]+$/.test(names.source) && /^[a-z0-9_]+$/.test(names.target), "database-create");
  return names;
}

async function verifyPostgresIdentity(
  admin: Client,
  host: string,
  port: number
): Promise<{ encoding: string; collate: string; ctype: string }> {
  await restoreSessionRole(admin, "postgres-identity");
  const identity = await admin.query<{
    current_database: string;
    session_user: string;
    current_user: string;
    is_superuser: boolean;
    server_version_num: number;
    server_address: string | null;
    server_port: number | null;
    in_recovery: boolean;
  }>(`
    SELECT current_database(), session_user, current_user,
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
      current_setting('server_version_num')::integer AS server_version_num,
      inet_server_addr()::text AS server_address,
      inet_server_port() AS server_port,
      pg_is_in_recovery() AS in_recovery
  `);
  const row = identity.rows[0];
  const tcp = clientTcpEvidence(admin, host, port);
  log("postgres_transport_observed", {
    ...tcp,
    sql_address_null: row?.server_address === null,
    sql_port_null: row?.server_port === null,
    sql_port_matches: Number.isInteger(row?.server_port) && row?.server_port === port,
  });
  demandIdentity(Boolean(row) && row!.current_database === "postgres", "postgres-identity", "DB_NAME");
  demandIdentity(row!.session_user === "supabase_admin", "postgres-identity", "LOGIN_ROLE");
  demandIdentity(row!.current_user === "supabase_admin", "postgres-identity", "ACTIVE_ROLE");
  demandIdentity(row!.is_superuser === true, "postgres-identity", "SUPERUSER");
  demandIdentity(Math.floor(Number(row!.server_version_num) / 10000) === 17, "postgres-identity", "SERVER_MAJOR");
  demandIdentity(row!.in_recovery === false, "postgres-identity", "RECOVERY");
  demandIdentity(
    tcp.socket_is_tcp && tcp.socket_peer_loopback && tcp.socket_host_matches && tcp.socket_port_matches,
    "postgres-identity", "TCP_PEER"
  );
  const unixBackend = row!.server_address === null && row!.server_port === null;
  demandIdentity(
    unixBackend || (row!.server_address !== null && row!.server_port !== null),
    "postgres-identity", "SERVER_PAIR"
  );
  // The existing native-stack control also accepts SQL's double-NULL Unix
  // backend. Here that path additionally requires the actual TCP peer above
  // to match the validated stack endpoint. Never accept a partial NULL pair.
  if (!unixBackend) {
    demandIdentity(Number.isInteger(row!.server_port) && row!.server_port === port, "postgres-identity", "SERVER_PORT");
    const address = String(row!.server_address).replace(/^\[|\]$/g, "");
    demandIdentity(isIP(address) !== 0 && (address === "127.0.0.1" || address === "::1"), "postgres-identity", "SERVER_ADDR");
    if (host !== "localhost") demandIdentity(address === host, "postgres-identity", "SERVER_ADDR");
  }
  log("postgres_backend_transport_verified", { transport: unixBackend ? "sql-unix" : "loopback-tcp" });
  log("postgres_session_identity_verified");

  const roles = await admin.query<{ rolname: string }>(
    "SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname",
    [REQUIRED_ROLES]
  );
  demandIdentity(
    JSON.stringify(roles.rows.map((item) => item.rolname).sort()) ===
      JSON.stringify([...REQUIRED_ROLES].sort()),
    "postgres-identity", "ROLE_SET"
  );
  const available = await admin.query<{ name: string; version: string }>(
    "SELECT name, version FROM pg_available_extension_versions"
  );
  const availableSet = new Set(available.rows.map((item) => `${item.name}\0${item.version}`));
  for (const [name, version] of EXTENSIONS) {
    demandIdentity(availableSet.has(`${name}\0${version}`), "postgres-identity", "EXT_SET");
  }
  log("postgres_roles_extensions_verified");

  const locale = await admin.query<{ encoding: string; collate: string; ctype: string }>(`
    SELECT pg_encoding_to_char(encoding) AS encoding, datcollate AS collate, datctype AS ctype
    FROM pg_database WHERE datname = 'template0'
  `);
  demandIdentity(locale.rows.length === 1, "postgres-identity", "TEMPLATE");
  return {
    encoding: locale.rows[0]!.encoding,
    collate: locale.rows[0]!.collate,
    ctype: locale.rows[0]!.ctype,
  };
}

async function assertNamesAbsent(admin: Client, names: string[]) {
  const result = await admin.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datname = ANY($1::text[]) ORDER BY datname",
    [names]
  );
  demand(result.rows.length === 0, "database-create");
}

async function createOwnedDatabase(
  admin: Client,
  marker: Marker,
  database: DatabaseMarker,
  locale: { encoding: string; collate: string; ctype: string }
) {
  const statement = [
    `CREATE DATABASE ${quoteIdentifier(database.name)}`,
    "WITH TEMPLATE template0",
    `OWNER ${quoteIdentifier("supabase_admin")}`,
    `ENCODING ${quoteLiteral(locale.encoding)}`,
    `LC_COLLATE ${quoteLiteral(locale.collate)}`,
    `LC_CTYPE ${quoteLiteral(locale.ctype)}`,
  ].join(" ");
  await admin.query(statement);
  await admin.query(
    `COMMENT ON DATABASE ${quoteIdentifier(database.name)} IS ${quoteLiteral(database.comment)}`
  );
  const check = await admin.query<{
    owner: string;
    comment: string | null;
    encoding: string;
    collate: string;
    ctype: string;
  }>(
    `SELECT pg_get_userbyid(d.datdba) AS owner,
      shobj_description(d.oid, 'pg_database') AS comment,
      pg_encoding_to_char(d.encoding) AS encoding,
      d.datcollate AS collate, d.datctype AS ctype
     FROM pg_database d WHERE d.datname = $1`,
    [database.name]
  );
  demand(check.rows.length === 1, "database-create");
  const row = check.rows[0]!;
  demand(row.owner === "supabase_admin", "database-create");
  demand(row.comment === database.comment, "database-create");
  demand(row.encoding === locale.encoding && row.collate === locale.collate && row.ctype === locale.ctype, "database-create");
  demand(database.comment === markerForDatabase(marker, database.role), "database-create");
}

async function verifyOwnedDatabase(admin: Client, database: DatabaseMarker, phase: SafePhase) {
  const result = await admin.query<{
    owner: string;
    comment: string | null;
    allow_connections: boolean;
    encoding: string;
  }>(
    `SELECT pg_get_userbyid(d.datdba) AS owner,
      shobj_description(d.oid, 'pg_database') AS comment,
      d.datallowconn AS allow_connections,
      pg_encoding_to_char(d.encoding) AS encoding
     FROM pg_database d WHERE d.datname = $1`,
    [database.name]
  );
  demand(result.rows.length === 1, phase);
  const row = result.rows[0]!;
  demand(row.owner === "supabase_admin" && row.comment === database.comment, phase);
  demand(row.allow_connections === true && row.encoding === "UTF8", phase);
}

async function verifyConnectedDatabase(client: Client, databaseName: string, phase: SafePhase) {
  const result = await client.query<{
    database_name: string;
    session_user: string;
    current_user: string;
  }>("SELECT current_database() AS database_name, session_user, current_user");
  demand(result.rows.length === 1, phase);
  demand(result.rows[0]!.database_name === databaseName, phase);
  demand(result.rows[0]!.session_user === "supabase_admin" && result.rows[0]!.current_user === "supabase_admin", phase);
}

async function verifyTargetEmpty(target: Client, admin: Client, database: DatabaseMarker) {
  await verifyOwnedDatabase(admin, database, "restore");
  const state = await target.query<{
    database_name: string;
    relation_count: number;
    schema_count: number;
    routine_count: number;
    type_count: number;
  }>(`
    SELECT current_database() AS database_name,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE left(n.nspname, 3) <> 'pg_'
          AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')) AS relation_count,
      (SELECT count(*)::integer FROM pg_namespace n
        WHERE left(n.nspname, 3) <> 'pg_'
          AND n.nspname <> 'information_schema' AND n.nspname <> 'public') AS schema_count,
      (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema') AS routine_count,
      (SELECT count(*)::integer FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema') AS type_count
  `);
  demand(state.rows.length === 1 && state.rows[0]!.database_name === database.name, "restore");
  demand(Number(state.rows[0]!.relation_count) === 0, "restore");
  demand(Number(state.rows[0]!.schema_count) === 0, "restore");
  demand(Number(state.rows[0]!.routine_count) === 0, "restore");
  demand(Number(state.rows[0]!.type_count) === 0, "restore");
}

async function assertBusySentinelState(target: Client, database: DatabaseMarker, sentinelComment: string) {
  const table = `public.${quoteIdentifier(BUSY_GUARD_SENTINEL)}`;
  const ownership = await target.query<{ owner: string; comment: string | null }>(
    `SELECT pg_get_userbyid(c.relowner) AS owner, obj_description(c.oid, 'pg_class') AS comment
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'`,
    [BUSY_GUARD_SENTINEL]
  );
  demand(ownership.rows.length === 1, "restore");
  demand(ownership.rows[0]!.owner === "supabase_admin", "restore");
  demand(ownership.rows[0]!.comment === sentinelComment, "restore");
  const row = await target.query<{ run_marker: string; payload: string }>(
    `SELECT run_marker, payload FROM ${table}`
  );
  demand(row.rows.length === 1, "restore");
  demand(row.rows[0]!.run_marker === database.comment, "restore");
  demand(row.rows[0]!.payload === `${database.role}-busy-guard-sentinel`, "restore");
}

async function verifyEmptyGuardRejectsBusyTarget(
  target: Client,
  admin: Client,
  database: DatabaseMarker
) {
  await verifyOwnedDatabase(admin, database, "restore");
  const relation = await target.query<{ name: string | null }>(
    "SELECT to_regclass($1::text)::text AS name",
    [`public.${BUSY_GUARD_SENTINEL}`]
  );
  demand(relation.rows[0]?.name === null, "restore");

  const sentinelComment = `${database.comment};sentinel=busy-guard`;
  const table = `public.${quoteIdentifier(BUSY_GUARD_SENTINEL)}`;
  await target.query(
    `CREATE TABLE ${table} (run_marker text PRIMARY KEY, payload text NOT NULL)`
  );
  await target.query(`COMMENT ON TABLE ${table} IS ${quoteLiteral(sentinelComment)}`);
  await target.query(
    `INSERT INTO ${table} (run_marker, payload) VALUES ($1, $2)`,
    [database.comment, `${database.role}-busy-guard-sentinel`]
  );

  let rejected = false;
  try {
    await verifyTargetEmpty(target, admin, database);
  } catch (error) {
    rejected = error instanceof SafeFailure && error.phase === "restore" && error.safeCode === undefined;
    if (!rejected) throw error;
  }
  demand(rejected, "restore");
  await verifyOwnedDatabase(admin, database, "restore");
  await assertBusySentinelState(target, database, sentinelComment);
  await target.query(`DROP TABLE ${table}`);
  const absent = await target.query<{ name: string | null }>(
    "SELECT to_regclass($1::text)::text AS name",
    [`public.${BUSY_GUARD_SENTINEL}`]
  );
  demand(absent.rows[0]?.name === null, "restore");
  await verifyTargetEmpty(target, admin, database);
}

async function verifyEmptyGuardRejectsRestoredTarget(
  target: Client,
  admin: Client,
  database: DatabaseMarker
) {
  await verifyOwnedDatabase(admin, database, "restore");
  let rejected = false;
  try {
    await verifyTargetEmpty(target, admin, database);
  } catch (error) {
    rejected = error instanceof SafeFailure && error.phase === "restore" && error.safeCode === undefined;
    if (!rejected) throw error;
  }
  demand(rejected, "restore");
  await verifyOwnedDatabase(admin, database, "restore");
}

const ROLE_GUARD_SQL = `
DO $ci_supabase_admin_role_guard$
DECLARE v_is_superuser boolean;
BEGIN
  IF session_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'Synthetic replay requires the supabase_admin login role';
  END IF;
  EXECUTE 'SET ROLE NONE';
  IF session_user <> 'supabase_admin' OR current_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'Synthetic replay requires the supabase_admin session role';
  END IF;
  SELECT rolsuper INTO v_is_superuser FROM pg_roles WHERE rolname = current_user;
  IF v_is_superuser IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Synthetic replay principal is not a superuser';
  END IF;
END
$ci_supabase_admin_role_guard$;
`;

async function restoreSessionRole(client: Client, phase: SafePhase) {
  try {
    await client.query(ROLE_GUARD_SQL);
  } catch {
    throw new SafeFailure(phase, "ROLE_RESET");
  }
}

const AUTH_COMPATIBILITY_SQL = `
DO $ci_auth_prerequisite_guard$
BEGIN
  IF to_regnamespace('auth') IS NOT NULL OR to_regclass('auth.users') IS NOT NULL
    OR to_regprocedure('auth.uid()') IS NOT NULL OR to_regprocedure('auth.jwt()') IS NOT NULL THEN
    RAISE EXCEPTION 'Synthetic Auth compatibility schema must start absent';
  END IF;
END
$ci_auth_prerequisite_guard$;
CREATE SCHEMA auth AUTHORIZATION supabase_admin;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE
);
CREATE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $ci_auth_uid$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$ci_auth_uid$;
CREATE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE
AS $ci_auth_jwt$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')
  )::jsonb
$ci_auth_jwt$;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC;
`;

async function applyReviewedSchema(source: Client) {
  const baseline = readFileSync(BASELINE_PATH, "utf8");
  const rls = readFileSync(RLS_MIGRATION_PATH, "utf8");
  const seed = readFileSync(SEED_MIGRATION_PATH, "utf8");
  demand(digest(baseline) === BASELINE_SHA256, "schema-replay");
  demand(digest(rls) === RLS_MIGRATION_SHA256, "schema-replay");
  demand(digest(seed) === SEED_MIGRATION_SHA256, "schema-replay");

  await source.query(ROLE_GUARD_SQL);
  await source.query(AUTH_COMPATIBILITY_SQL);
  await source.query("SET app.schema_snapshot_replay = 'ci-empty-replay'");
  await source.query(sqlWithoutPsqlGuards(baseline, "schema-replay"));
  await source.query(ROLE_GUARD_SQL);
  await source.query(sqlWithoutPsqlGuards(rls, "schema-replay"));
  await source.query(ROLE_GUARD_SQL);
  await source.query(sqlWithoutPsqlGuards(seed, "schema-replay"));

  const extensionState = await source.query<{ extname: string; extversion: string; schema_name: string }>(`
    SELECT e.extname, e.extversion, n.nspname AS schema_name
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = ANY($1::text[]) ORDER BY e.extname
  `, [[...EXTENSIONS.map(([name]) => name)]]);
  const actual = extensionState.rows.map((item) => `${item.extname}\0${item.extversion}\0${item.schema_name}`).sort();
  const expected = EXTENSIONS.map(([name, version, schemaName]) => `${name}\0${version}\0${schemaName}`).sort();
  demand(JSON.stringify(actual) === JSON.stringify(expected), "schema-replay");
}

async function seedLedgerAcademy(source: Client, currency: "EUR" | "MXN"): Promise<LedgerFixture> {
  const fixture: LedgerFixture = {
    organizationId: randomUUID(),
    ownerUserId: randomUUID(),
    ownerMemberId: randomUUID(),
    locationId: randomUUID(),
    familyId: randomUUID(),
    invoiceId: randomUUID(),
    invoiceLineId: randomUUID(),
    chargeId: randomUUID(),
    currency,
    idempotencyKey: `ci-restore-payment-${randomUUID()}`,
  };
  const dueAt = new Date(Date.now() + 86_400_000).toISOString();
  const code = `ci-${fixture.organizationId.slice(0, 8)}`;
  await source.query("BEGIN");
  try {
    await source.query(
      "INSERT INTO auth.users (id, email) VALUES ($1::uuid, $2)",
      [fixture.ownerUserId, `ci-${fixture.ownerUserId}@example.invalid`]
    );
    await source.query(
      "INSERT INTO zaltyko.organizations (id, name, default_currency) VALUES ($1::uuid, $2, $3)",
      [fixture.organizationId, `CI synthetic academy ${fixture.organizationId}`, currency]
    );
    await source.query(
      "INSERT INTO zaltyko.locations (id, organization_id, code, name, timezone) VALUES ($1::uuid, $2::uuid, $3, $4, 'Europe/Madrid')",
      [fixture.locationId, fixture.organizationId, code, `CI synthetic site ${currency}`]
    );
    await source.query(
      `INSERT INTO zaltyko.organization_members
        (id, organization_id, user_id, role, status, location_scope_mode)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'owner', 'active', 'all')`,
      [fixture.ownerMemberId, fixture.organizationId, fixture.ownerUserId]
    );
    await source.query(
      "INSERT INTO zaltyko.families (id, organization_id, is_active) VALUES ($1::uuid, $2::uuid, true)",
      [fixture.familyId, fixture.organizationId]
    );
    await source.query(
      `INSERT INTO zaltyko.invoices
        (id, organization_id, location_id, family_id, reference, status, currency,
         total_amount_cents, issued_at, due_at, idempotency_key)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'issued', $6,
         $7, now(), $8::timestamptz, $9)`,
      [fixture.invoiceId, fixture.organizationId, fixture.locationId, fixture.familyId,
        `CI-${currency}-${fixture.organizationId}`, currency, LEDGER_AMOUNT_CENTS,
        dueAt, `ci-invoice-${fixture.organizationId}`]
    );
    await source.query(
      `INSERT INTO zaltyko.invoice_lines
        (id, organization_id, invoice_id, location_id, line_type, quantity,
         unit_amount_cents, amount_cents, currency, service_period_start, service_period_end)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ci_synthetic_monthly_fee',
         1, $5, $5, $6, DATE '2026-11-01', DATE '2026-11-30')`,
      [fixture.invoiceLineId, fixture.organizationId, fixture.invoiceId,
        fixture.locationId, LEDGER_AMOUNT_CENTS, currency]
    );
    await source.query(
      `INSERT INTO zaltyko.charges
        (id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
         status, amount_cents, currency, due_at, service_period_start, service_period_end, idempotency_key)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
         'due', $7, $8, $9::timestamptz, DATE '2026-11-01', DATE '2026-11-30', $10)`,
      [fixture.chargeId, fixture.organizationId, fixture.locationId, fixture.invoiceId,
        fixture.invoiceLineId, fixture.familyId, LEDGER_AMOUNT_CENTS, currency,
        dueAt, `ci-charge-${fixture.organizationId}`]
    );
    await source.query("COMMIT");
  } catch (error) {
    await source.query("ROLLBACK").catch(() => undefined);
    throw phaseFailure("fixture", error);
  }
  return fixture;
}

async function writeLedgersAndRunService(
  fixtures: LedgerFixture[],
  sourceUrlFile: string,
  fixtureFile: string,
  workdir: string
) {
  writePrivateFile(fixtureFile, JSON.stringify({ fixtures }), "fixture");
  const sourceUrl = checkPrivateFile(sourceUrlFile, "ledger-service").toString("utf8").trim();
  const parsed = parseOwnDatabaseUrl(sourceUrl, "ledger-service");
  demand(parsed.pathname.startsWith("/zk_src_"), "ledger-service");

  const childEnv: NodeJS.ProcessEnv = {
    CI: "true",
    DOTENV_CONFIG_PATH: "/dev/null",
    DATABASE_URL: sourceUrl,
    DATABASE_URL_POOL: sourceUrl,
    DATABASE_URL_DIRECT: sourceUrl,
    HOME: process.env.HOME ?? workdir,
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    FIXTURE_FILE: fixtureFile,
    SOURCE_DB_URL_FILE: sourceUrlFile,
    SOURCE_DATABASE_NAME: parsed.pathname.slice(1),
    GITHUB_ACTIONS: "true",
    RUNNER_OS: "Linux",
  };
  const script = __filename;
  const result = await runProcess(
    process.execPath,
    ["--import", "tsx", script, "--record-ledger"],
    childEnv,
    "ledger-service",
    180_000,
    64 * 1024
  );
  let childResult: { status?: unknown; recorded?: unknown };
  try {
    const lines = result.stdout.toString("utf8").trim().split(/\r?\n/);
    childResult = JSON.parse(lines[lines.length - 1] ?? "") as { status?: unknown; recorded?: unknown };
  } catch {
    throw new SafeFailure("ledger-service");
  }
  demand(childResult.status === "PASS" && childResult.recorded === fixtures.length, "ledger-service");
}

async function assertLedgerChildPoolClosed(admin: Client, sourceName: string, sourcePid: number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await admin.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM pg_stat_activity
       WHERE datname = $1 AND usename = 'supabase_admin' AND pid <> $2`,
      [sourceName, sourcePid]
    );
    if (Number(result.rows[0]?.count) === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new SafeFailure("ledger-service");
}

async function runLedgerChild() {
  let exitCode = 1;
  try {
    const fixtureFile = privatePath("FIXTURE_FILE");
    const sourceUrlFile = privatePath("SOURCE_DB_URL_FILE");
    const sourceUrl = checkPrivateFile(sourceUrlFile, "ledger-child").toString("utf8").trim();
    let fixtures: LedgerFixture[];
    try {
      const content = JSON.parse(checkPrivateFile(fixtureFile, "ledger-child").toString("utf8")) as { fixtures?: LedgerFixture[] };
      demand(Array.isArray(content.fixtures) && content.fixtures.length === 2, "ledger-child");
      fixtures = content.fixtures;
      for (const fixture of fixtures) {
        demand(fixture.currency === "EUR" || fixture.currency === "MXN", "ledger-child");
        demand(/^[0-9a-f-]{36}$/.test(fixture.organizationId), "ledger-child");
        demand(/^[0-9a-f-]{36}$/.test(fixture.chargeId), "ledger-child");
        demand(/^[0-9a-f-]{36}$/.test(fixture.ownerUserId), "ledger-child");
        demand(/^[0-9a-f-]{36}$/.test(fixture.ownerMemberId), "ledger-child");
      }
    } catch (error) {
      throw phaseFailure("ledger-child", error);
    }
    const parsed = parseOwnDatabaseUrl(sourceUrl, "ledger-child");
    const sourceName = process.env.SOURCE_DATABASE_NAME;
    demandIdentity(
      typeof sourceName === "string" && /^zk_src_[0-9]+_[0-9]+_[0-9a-f]{8}$/.test(sourceName) &&
      parsed.pathname === `/${sourceName}`,
      "ledger-child", "DB_NAME"
    );
    // Validate this exact private URL before importing the application's DB or
    // ledger modules. The same literal startup option reaches every Pool
    // connection: createDatabasePoolConfig only removes TLS URL parameters.
    const preflight = connectClient(sourceUrl);
    try {
      await preflight.connect();
      verifyClientTcpEndpoint(preflight, parsed.hostname.replace(/^\[|\]$/g, ""), Number(parsed.port), "ledger-child");
      await restoreSessionRole(preflight, "ledger-child");
      await verifyConnectedDatabase(preflight, sourceName, "ledger-child");
    } finally {
      await preflight.end();
    }
    for (const name of ["DATABASE_URL", "DATABASE_URL_POOL", "DATABASE_URL_DIRECT"]) {
      process.env[name] = sourceUrl;
    }
    process.env.DOTENV_CONFIG_PATH = "/dev/null";
    demand(process.env.NODE_ENV === "test", "ledger-child");

    const { db } = await import("../../src/db");
    const { sql } = await import("drizzle-orm");
    const poolIdentity = await db.execute(sql`
      SELECT current_database() AS database_name, session_user, current_user,
        (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser
    `);
    const poolRow = poolIdentity.rows[0];
    demandIdentity(
      poolIdentity.rows.length === 1 && poolRow?.database_name === sourceName &&
      poolRow.session_user === "supabase_admin" && poolRow.current_user === "supabase_admin" &&
      poolRow.is_superuser === true,
      "ledger-child", "POOL_ROLE"
    );
    const { recordManualPaymentForCharge } = await import("../../src/modules/billing/application/ledger-service");
    for (const fixture of fixtures) {
      await recordManualPaymentForCharge({
        organizationId: fixture.organizationId,
        chargeId: fixture.chargeId,
        amountCents: LEDGER_PAYMENT_CENTS,
        method: "bank_transfer",
        receivedAt: new Date().toISOString(),
        idempotencyKey: fixture.idempotencyKey,
        actor: { userId: fixture.ownerUserId, memberId: fixture.ownerMemberId },
      });
    }
    await new Promise<void>((resolveWrite) => {
      process.stdout.write(JSON.stringify({ status: "PASS", recorded: fixtures.length }), () => resolveWrite());
    });
    exitCode = 0;
  } catch (error) {
    const code = error instanceof SafeFailure ? error.safeCode : safeErrorCode(error);
    await new Promise<void>((resolveWrite) => {
      process.stdout.write(JSON.stringify({ status: "FAIL", code }), () => resolveWrite());
    });
  }
  process.exit(exitCode);
}

const FIXED_TENANT_FIXTURE_IDS = [
  "90000000-0000-4000-8000-000000000011",
  "90000000-0000-4000-8000-000000000022",
  "90000000-0000-4000-8000-000000000001",
  "90000000-0000-4000-8000-000000000002",
  "90000000-0000-4000-8000-000000000101",
  "90000000-0000-4000-8000-000000000202",
  "90000000-0000-4000-8000-000000000301",
  "90000000-0000-4000-8000-000000000302",
  "90000000-0000-4000-8000-000000000399",
];

async function assertTenantFixtureIdsDoNotCollide(client: Client) {
  const result = await client.query<{ collision: boolean }>(`
    SELECT
      EXISTS (SELECT 1 FROM auth.users WHERE id = ANY($1::uuid[])) OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = ANY($1::uuid[]) OR user_id = ANY($1::uuid[]) OR tenant_id = ANY($1::uuid[])) OR
      EXISTS (SELECT 1 FROM public.academies WHERE id = ANY($1::uuid[]) OR tenant_id = ANY($1::uuid[]) OR owner_id = ANY($1::uuid[])) OR
      EXISTS (SELECT 1 FROM public.memberships WHERE user_id = ANY($1::uuid[]) OR academy_id = ANY($1::uuid[])) AS collision
  `, [FIXED_TENANT_FIXTURE_IDS]);
  demand(result.rows[0]?.collision === false, "fixture");
}

async function runLegacyTenantFixture(client: Client, fixtureSql: string) {
  demand(digest(fixtureSql) === TENANT_FIXTURE_SHA256, "fixture");
  await assertTenantFixtureIdsDoNotCollide(client);
  await client.query(fixtureSql);
}

async function assertCanonicalReadsDenied(client: Client, fixture: LedgerFixture) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [fixture.ownerUserId]);
    await client.query("SAVEPOINT canonical_read_denial");
    let denied = false;
    try {
      await client.query(
        "SELECT id FROM zaltyko.outbox_events WHERE organization_id = $1::uuid LIMIT 1",
        [fixture.organizationId]
      );
    } catch (error) {
      denied = safeErrorCode(error) === "42501";
    }
    demand(denied, "fixture");
    await client.query("ROLLBACK TO SAVEPOINT canonical_read_denial");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw phaseFailure("fixture", error);
  }
}

async function verifyLedgerAmounts(client: Client, fixtures: LedgerFixture[]) {
  for (const fixture of fixtures) {
    const result = await client.query<{
      invoice_total: string;
      charge_amount: string;
      charge_status: string;
      currency: string;
      payment_total: string;
      allocation_total: string;
      payment_count: number;
      valid_manual_payment_count: number;
      payment_currency: string | null;
      allocation_currency: string | null;
      invoice_status: string;
      outbox_events: string[];
      audit_actions: string[];
    }>(`
      SELECT i.total_amount_cents::text AS invoice_total,
        c.amount_cents::text AS charge_amount, c.status::text AS charge_status,
        c.currency, COALESCE(sum(p.amount_cents), 0)::text AS payment_total,
        COALESCE(sum(pa.amount_cents), 0)::text AS allocation_total,
        count(DISTINCT p.id)::integer AS payment_count,
        count(DISTINCT p.id) FILTER (
          WHERE p.source::text = 'manual' AND p.manual_method::text = 'bank_transfer'
            AND p.status::text = 'succeeded'
        )::integer AS valid_manual_payment_count,
        min(p.currency) AS payment_currency,
        min(pa.currency) AS allocation_currency,
        i.status::text AS invoice_status,
        ARRAY(SELECT e.event_name FROM zaltyko.outbox_events e
          WHERE e.organization_id = c.organization_id
            AND e.payload ->> 'chargeId' = c.id::text ORDER BY e.event_name) AS outbox_events,
        ARRAY(SELECT a.action FROM zaltyko.audit_log a
          WHERE a.organization_id = c.organization_id
            AND a.action IN ('payment.allocated', 'payment.manual_recorded')
          ORDER BY a.action) AS audit_actions
      FROM zaltyko.charges c
      JOIN zaltyko.invoices i ON i.organization_id = c.organization_id AND i.id = c.invoice_id
      LEFT JOIN zaltyko.payment_allocations pa ON pa.organization_id = c.organization_id AND pa.charge_id = c.id
      LEFT JOIN zaltyko.payments p ON p.organization_id = pa.organization_id AND p.id = pa.payment_id
      WHERE c.organization_id = $1::uuid AND c.id = $2::uuid
      GROUP BY i.total_amount_cents, c.id, c.amount_cents, c.status, c.currency, i.status, c.organization_id
    `, [fixture.organizationId, fixture.chargeId]);
    demand(result.rows.length === 1, "comparison");
    const row = result.rows[0]!;
    demand(row.invoice_total === String(LEDGER_AMOUNT_CENTS), "comparison");
    demand(row.charge_amount === String(LEDGER_AMOUNT_CENTS), "comparison");
    demand(row.currency === fixture.currency, "comparison");
    demand(row.payment_total === String(LEDGER_PAYMENT_CENTS), "comparison");
    demand(row.allocation_total === String(LEDGER_PAYMENT_CENTS), "comparison");
    demand(Number(row.payment_count) === 1, "comparison");
    demand(Number(row.valid_manual_payment_count) === 1, "comparison");
    demand(row.payment_currency === fixture.currency && row.allocation_currency === fixture.currency, "comparison");
    demand(row.charge_status === "partially_paid" && row.invoice_status === "partially_paid", "comparison");
    demand(row.outbox_events.join(",") === "payment.allocated,payment.manual_recorded", "comparison");
    demand(row.audit_actions.join(",") === "payment.allocated,payment.manual_recorded", "comparison");
    demand(LEDGER_AMOUNT_CENTS - LEDGER_PAYMENT_CENTS === LEDGER_BALANCE_CENTS, "comparison");
  }
}

async function catalogAndDataFingerprint(client: Client): Promise<string> {
  await client.query("SET TIME ZONE 'UTC'");
  await client.query("SET extra_float_digits = 3");
  const database = await client.query(`
    SELECT pg_get_userbyid(d.datdba) AS owner, d.datacl::text AS acl,
      pg_encoding_to_char(d.encoding) AS encoding, d.datcollate AS collate,
      d.datctype AS ctype, d.datconnlimit AS connection_limit
    FROM pg_database d WHERE d.datname = current_database()
  `);
  const databaseSettings = await client.query(`
    SELECT d.datname AS database_name, r.rolname AS role_name, s.setconfig::text AS settings
    FROM pg_db_role_setting s
    LEFT JOIN pg_database d ON d.oid = s.setdatabase AND s.setdatabase <> 0
    LEFT JOIN pg_roles r ON r.oid = s.setrole AND s.setrole <> 0
    WHERE s.setdatabase = 0 OR d.datname = current_database()
    ORDER BY database_name NULLS FIRST, role_name NULLS FIRST, settings
  `);
  const schemas = await client.query(`
    SELECT n.nspname AS name, pg_get_userbyid(n.nspowner) AS owner,
      n.nspacl::text AS acl
    FROM pg_namespace n WHERE n.nspname = ANY($1::text[])
    ORDER BY n.nspname
  `, [APP_SCHEMAS]);
  demand(schemas.rows.length === APP_SCHEMAS.length, "source-fingerprint");
  const extensions = await client.query(`
    SELECT e.extname AS name, e.extversion AS version,
      n.nspname AS schema_name, pg_get_userbyid(e.extowner) AS owner,
      e.extrelocatable AS relocatable,
      CASE WHEN e.extconfig IS NULL THEN NULL ELSE ARRAY(
        SELECT format('%I.%I', config_ns.nspname, config_rel.relname)
        FROM unnest(e.extconfig) WITH ORDINALITY AS config(relid, ordinal)
        JOIN pg_class config_rel ON config_rel.oid = config.relid
        JOIN pg_namespace config_ns ON config_ns.oid = config_rel.relnamespace
        ORDER BY config.ordinal
      ) END AS config_tables,
      e.extcondition::text AS conditions
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    ORDER BY e.extname
  `);
  const relations = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS name, c.relkind AS kind,
      pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl,
      c.relrowsecurity AS row_security, c.relforcerowsecurity AS force_row_security,
      c.relpersistence AS persistence, c.reloptions::text AS options,
      c.relreplident AS replica_identity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m','S','f')
    ORDER BY n.nspname, c.relname
  `, [APP_SCHEMAS]);
  const columns = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
      a.attnum AS ordinal, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
      a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_expression,
      a.attidentity AS identity_kind, a.attgenerated AS generated_kind,
      coll_ns.nspname AS collation_schema, coll.collname AS collation_name,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
          'grantor', grantor.rolname,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        ) ORDER BY
          CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
          grantor.rolname, acl.privilege_type, acl.is_grantable)
        FROM aclexplode(a.attacl) AS acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
        LEFT JOIN pg_roles grantor ON grantor.oid = acl.grantor
      ), '[]'::jsonb) AS column_privileges
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    LEFT JOIN pg_collation coll ON coll.oid = a.attcollation AND a.attcollation <> 0
    LEFT JOIN pg_namespace coll_ns ON coll_ns.oid = coll.collnamespace
    WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m','f')
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY n.nspname, c.relname, a.attnum
  `, [APP_SCHEMAS]);
  const types = await client.query(`
    SELECT n.nspname AS schema_name, t.typname AS name, t.typtype AS kind,
      pg_get_userbyid(t.typowner) AS owner, t.typacl::text AS acl,
      format_type(t.typbasetype, t.typtypmod) AS base_type,
      t.typnotnull AS not_null, t.typdefault AS default_expression,
      t.typcategory AS category, t.typdelim AS delimiter,
      ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid = t.oid
        ORDER BY e.enumsortorder) AS enum_labels
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = ANY($1::text[]) AND t.typtype <> 'p'
      AND t.typname NOT LIKE '\\_%' ESCAPE '\\'
    ORDER BY n.nspname, t.typname
  `, [APP_SCHEMAS]);
  const constraints = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
      con.conname AS name, con.contype AS kind,
      pg_get_constraintdef(con.oid, true) AS definition,
      con.convalidated AS validated, con.condeferrable AS deferrable,
      con.condeferred AS initially_deferred, con.confupdtype AS update_action,
      con.confdeltype AS delete_action, con.confmatchtype AS match_type
    FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    LEFT JOIN pg_class c ON c.oid = con.conrelid
    WHERE n.nspname = ANY($1::text[])
    ORDER BY n.nspname, c.relname NULLS FIRST, con.conname
  `, [APP_SCHEMAS]);
  const indexes = await client.query(`
    SELECT n.nspname AS schema_name, tbl.relname AS table_name,
      idx.relname AS name, pg_get_indexdef(i.indexrelid) AS definition,
      i.indisunique AS is_unique, i.indisprimary AS is_primary,
      i.indisvalid AS is_valid, i.indislive AS is_live,
      pg_get_expr(i.indpred, i.indrelid) AS predicate,
      pg_get_expr(i.indexprs, i.indrelid) AS expressions
    FROM pg_index i
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    WHERE n.nspname = ANY($1::text[])
    ORDER BY n.nspname, tbl.relname, idx.relname
  `, [APP_SCHEMAS]);
  const policies = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name,
      p.polname AS name, p.polpermissive AS permissive,
      p.polcmd AS command,
      ARRAY(SELECT CASE WHEN role_id = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END
        FROM unnest(p.polroles) AS roles(role_id) ORDER BY 1) AS roles,
      pg_get_expr(p.polqual, p.polrelid) AS using_expression,
      pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::text[])
    ORDER BY n.nspname, c.relname, p.polname
  `, [APP_SCHEMAS]);
  const routines = await client.query(`
    SELECT n.nspname AS schema_name, p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_function_result(p.oid) AS result,
      l.lanname AS language, p.prokind AS kind,
      pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl,
      p.prosrc AS source, p.provolatile AS volatility,
      p.prosecdef AS security_definer, p.proisstrict AS strict,
      p.proleakproof AS leakproof, p.proparallel AS parallel,
      p.proconfig::text AS configuration,
      CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) ELSE NULL END AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = ANY($1::text[])
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  `, [APP_SCHEMAS]);
  const triggers = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name,
      t.tgname AS name, pg_get_triggerdef(t.oid, true) AS definition,
      t.tgenabled AS enabled, t.tgisinternal AS internal,
      t.tgconstraint <> 0 AS is_constraint_trigger
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::text[])
    ORDER BY n.nspname, c.relname, t.tgname
  `, [APP_SCHEMAS]);
  const sequences = await client.query(`
    SELECT schemaname AS schema_name, sequencename AS name,
      data_type, start_value::text, min_value::text, max_value::text,
      increment_by::text, cycle, cache_size::text, last_value::text
    FROM pg_sequences WHERE schemaname = ANY($1::text[])
    ORDER BY schemaname, sequencename
  `, [APP_SCHEMAS]);
  const defaultAcls = await client.query(`
    SELECT pg_get_userbyid(d.defaclrole) AS role,
      CASE WHEN d.defaclnamespace = 0 THEN NULL ELSE n.nspname END AS schema_name,
      d.defaclobjtype AS object_type, d.defaclacl::text AS acl
    FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    ORDER BY role, schema_name NULLS FIRST, object_type
  `);
  const tables = await client.query<{ schema_name: string; table_name: string }>(`
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','m')
    ORDER BY n.nspname, c.relname
  `, [APP_SCHEMAS]);
  const rows: Array<{ schema_name: string; table_name: string; count: string; hash: string }> = [];
  for (const table of tables.rows) {
    const relation = `${quoteIdentifier(table.schema_name)}.${quoteIdentifier(table.table_name)}`;
    const result = await client.query<{ count: string; hash: string }>(
      `SELECT count(*)::text AS count,
        encode(extensions.digest(
          COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), ''),
          'sha256'
        ), 'hex') AS hash
       FROM ${relation} t`
    );
    rows.push({
      schema_name: table.schema_name,
      table_name: table.table_name,
      count: result.rows[0]!.count,
      hash: result.rows[0]!.hash,
    });
  }
  const fingerprint = {
    database: database.rows,
    databaseSettings: databaseSettings.rows,
    schemas: schemas.rows,
    extensions: extensions.rows,
    relations: relations.rows,
    columns: columns.rows,
    types: types.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    policies: policies.rows,
    routines: routines.rows,
    triggers: triggers.rows,
    sequences: sequences.rows,
    defaultAcls: defaultAcls.rows,
    rows,
  };
  return digest(JSON.stringify(fingerprint));
}

function assertArtifactDirectory(path: string, workdir: string) {
  demand(isWithin(path, workdir) && path !== workdir, "environment");
  demand(!existsSync(path), "environment");
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
  return checkPrivateDirectory(path, "environment");
}

function assertOwnedArtifact(path: string, maxBytes?: number) {
  try {
    const info = lstatSync(path);
    demand(info.isFile() && !info.isSymbolicLink(), "dump");
    demand(info.uid === process.getuid?.(), "dump");
    demand((info.mode & 0o077) === 0, "dump");
    if (maxBytes !== undefined) demand(info.size <= maxBytes, "dump");
    return info.size;
  } catch (error) {
    throw phaseFailure("dump", error);
  }
}

async function dropOwnedDatabase(admin: Client, database: DatabaseMarker): Promise<void> {
  const result = await admin.query<{
    owner: string;
    comment: string | null;
  }>(
    `SELECT pg_get_userbyid(d.datdba) AS owner,
      shobj_description(d.oid, 'pg_database') AS comment
     FROM pg_database d WHERE d.datname = $1`,
    [database.name]
  );
  if (result.rows.length === 0) return;
  const row = result.rows[0]!;
  demand(row.owner === "supabase_admin" && row.comment === database.comment, "cleanup");
  await admin.query(`DROP DATABASE ${quoteIdentifier(database.name)} WITH (FORCE)`);
  const absent = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database.name]);
  demand(absent.rows.length === 0, "cleanup");
}

async function runExperiment() {
  let primaryError: SafeFailure | undefined;
  let cleanupFailed = false;
  let activePhase: SafePhase = "environment";
  let key: Buffer | undefined;
  let admin: Client | undefined;
  let source: Client | undefined;
  let target: Client | undefined;
  let sourceDatabase: DatabaseMarker | undefined;
  let targetDatabase: DatabaseMarker | undefined;
  let artifacts: string[] = [];

  try {
    validateRuntimeEnvironment();
    const { workdir, cliHome, runnerTemp } = privateDirectories();
    const { marker, manifest } = readMarkerAndManifest();
    activePhase = "clients";
    const pgDump = resolveClient("pg_dump", manifest, cliHome);
    const pgRestore = resolveClient("pg_restore", manifest, cliHome);
    activePhase = "postgres-identity";
    const localUrlFile = privatePath("LOCAL_DB_URL_FILE");
    demand(isWithin(resolve(localUrlFile), runnerTemp), "postgres-identity");
    const localConnection = parseLoopbackUrl(localUrlFile);
    const passfilePath = privatePath("PGPASSFILE");
    demand(isWithin(resolve(passfilePath), runnerTemp), "postgres-identity");
    writePgpass(passfilePath, localConnection.host, localConnection.port, localConnection.password);
    const clientEnv = buildClientEnvironment(localConnection.host, localConnection.port, passfilePath, cliHome);
    const sourceUrlFile = privatePath("SOURCE_DB_URL_FILE");
    const targetUrlFile = privatePath("TARGET_DB_URL_FILE");
    const fixtureFile = privatePath("FIXTURE_FILE");
    for (const path of [sourceUrlFile, targetUrlFile, fixtureFile]) {
      demand(isWithin(resolve(path), runnerTemp), "environment");
      demand(!existsSync(path), "environment");
    }

    admin = connectClient(localConnection.url.toString());
    await admin.connect();
    const locale = await verifyPostgresIdentity(admin, localConnection.host, localConnection.port);
    const names = validateDatabaseNames(marker);
    activePhase = "database-create";
    sourceDatabase = {
      name: names.source,
      role: "source",
      comment: markerForDatabase(marker, "source"),
    };
    targetDatabase = {
      name: names.target,
      role: "target",
      comment: markerForDatabase(marker, "target"),
    };
    await assertNamesAbsent(admin, [sourceDatabase.name, targetDatabase.name]);
    await createOwnedDatabase(admin, marker, sourceDatabase, locale);
    await createOwnedDatabase(admin, marker, targetDatabase, locale);

    const sourceUrl = makeDatabaseUrl(localConnection.url, sourceDatabase.name);
    const targetUrl = makeDatabaseUrl(localConnection.url, targetDatabase.name);
    demand(parseOwnDatabaseUrl(sourceUrl, "database-create").pathname === `/${sourceDatabase.name}`, "database-create");
    demand(parseOwnDatabaseUrl(targetUrl, "database-create").pathname === `/${targetDatabase.name}`, "database-create");
    writePrivateFile(sourceUrlFile, `${sourceUrl}\n`, "postgres-identity");
    writePrivateFile(targetUrlFile, `${targetUrl}\n`, "postgres-identity");
    source = connectClient(sourceUrl);
    target = connectClient(targetUrl);
    await source.connect();
    await target.connect();
    verifyClientTcpEndpoint(source, localConnection.host, localConnection.port, "database-create");
    verifyClientTcpEndpoint(target, localConnection.host, localConnection.port, "database-create");
    await restoreSessionRole(source, "database-create");
    await restoreSessionRole(target, "database-create");
    await source.query("SET TIME ZONE 'UTC'");
    await target.query("SET TIME ZONE 'UTC'");
    await verifyConnectedDatabase(source, sourceDatabase.name, "database-create");
    await verifyConnectedDatabase(target, targetDatabase.name, "database-create");
    log("private_database_sessions_verified");
    const sourcePidResult = await source.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const sourcePid = Number(sourcePidResult.rows[0]?.pid);
    demand(Number.isInteger(sourcePid) && sourcePid > 0, "database-create");
    await verifyOwnedDatabase(admin, sourceDatabase, "database-create");
    await verifyOwnedDatabase(admin, targetDatabase, "database-create");
    await verifyTargetEmpty(target, admin, targetDatabase);
    activePhase = "schema-replay";
    await applyReviewedSchema(source);

    const fixtureSql = readFileSync(TENANT_FIXTURE_PATH, "utf8");
    demand(digest(fixtureSql) === TENANT_FIXTURE_SHA256, "fixture");
    await assertTenantFixtureIdsDoNotCollide(source);
    activePhase = "fixture";
    const fixtures = [
      await seedLedgerAcademy(source, "EUR"),
      await seedLedgerAcademy(source, "MXN"),
    ];
    activePhase = "ledger-service";
    await writeLedgersAndRunService(fixtures, sourceUrlFile, fixtureFile, workdir);
    await assertLedgerChildPoolClosed(admin, sourceDatabase.name, sourcePid);
    activePhase = "comparison";
    await verifyLedgerAmounts(source, fixtures);
    activePhase = "fixture";
    await runLegacyTenantFixture(source, fixtureSql);
    for (const fixture of fixtures) await assertCanonicalReadsDenied(source, fixture);
    activePhase = "source-fingerprint";
    const sourceInitialFingerprint = await catalogAndDataFingerprint(source);

    activePhase = "dump";
    const artifactDir = assertArtifactDirectory(join(workdir, ".synthetic-restore"), workdir);
    const rawArchive = join(artifactDir, "source.custom.dump");
    const encryptedArchive = join(artifactDir, "source.custom.dump.aesgcm");
    const decryptedArchive = join(artifactDir, "restore.custom.dump");
    artifacts = [rawArchive, encryptedArchive, decryptedArchive];
    for (const path of artifacts) demand(!existsSync(path), "dump");

    await runProcess(
      pgDump,
      [
        `--host=${localConnection.host}`,
        `--port=${localConnection.port}`,
        "--username=supabase_admin",
        "--role=supabase_admin",
        `--dbname=${sourceDatabase.name}`,
        "--format=custom",
        "--no-password",
        `--file=${rawArchive}`,
      ],
      clientEnv,
      "dump"
    );
    const archiveBytes = assertOwnedArtifact(rawArchive, MAX_ARCHIVE_BYTES);
    demand(archiveBytes > 0, "dump");
    const plainArchive = readFileSync(rawArchive);
    const archiveHash = digest(plainArchive);
    key = randomBytes(32);
    const aad = makeArchiveAad(marker, sourceDatabase.name, targetDatabase.name);
    const encrypted = encryptArchive(plainArchive, key, aad);
    writePrivateFile(encryptedArchive, encrypted, "archive-validation");
    removePrivateFile(rawArchive);
    activePhase = "archive-validation";
    verifyTamperRejected(encrypted, key, aad);
    const decrypted = decryptArchive(checkPrivateFile(encryptedArchive, "archive-validation"), key, aad);
    demand(digest(decrypted) === archiveHash, "archive-validation");
    writePrivateFile(decryptedArchive, decrypted, "archive-validation");

    const toc = await runProcess(
      pgRestore,
      ["--list", decryptedArchive],
      clientEnv,
      "archive-validation",
      60_000,
      8 * 1024 * 1024
    );
    validateArchiveToc(toc.stdout.toString("utf8"), sourceDatabase.name, targetDatabase.name);

    activePhase = "restore";
    const sourceBeforeRestore = await catalogAndDataFingerprint(source);
    demand(sourceBeforeRestore === sourceInitialFingerprint, "source-fingerprint");
    await verifyOwnedDatabase(admin, sourceDatabase, "restore");
    await verifyOwnedDatabase(admin, targetDatabase, "restore");
    await verifyTargetEmpty(target, admin, targetDatabase);
    await verifyEmptyGuardRejectsBusyTarget(target, admin, targetDatabase);
    demand(await catalogAndDataFingerprint(source) === sourceInitialFingerprint, "source-fingerprint");
    await verifyOwnedDatabase(admin, targetDatabase, "restore");
    await verifyTargetEmpty(target, admin, targetDatabase);
    await runProcess(
      pgRestore,
      [
        `--host=${localConnection.host}`,
        `--port=${localConnection.port}`,
        "--username=supabase_admin",
        "--role=supabase_admin",
        `--dbname=${targetDatabase.name}`,
        "--exit-on-error",
        "--single-transaction",
        "--no-password",
        decryptedArchive,
      ],
      clientEnv,
      "restore"
    );

    activePhase = "comparison";
    await verifyOwnedDatabase(admin, targetDatabase, "comparison");
    const sourceAfterRestore = await catalogAndDataFingerprint(source);
    const targetAfterRestore = await catalogAndDataFingerprint(target);
    demand(sourceAfterRestore === sourceInitialFingerprint, "comparison");
    demand(targetAfterRestore === sourceInitialFingerprint, "comparison");
    await verifyLedgerAmounts(source, fixtures);
    await verifyLedgerAmounts(target, fixtures);
    await runLegacyTenantFixture(target, fixtureSql);
    for (const fixture of fixtures) await assertCanonicalReadsDenied(target, fixture);
    const sourceBeforeRepeatedGuard = await catalogAndDataFingerprint(source);
    const targetBeforeRepeatedGuard = await catalogAndDataFingerprint(target);
    demand(sourceBeforeRepeatedGuard === sourceInitialFingerprint, "comparison");
    demand(targetBeforeRepeatedGuard === sourceInitialFingerprint, "comparison");
    await verifyEmptyGuardRejectsRestoredTarget(target, admin, targetDatabase);
    demand(await catalogAndDataFingerprint(source) === sourceBeforeRepeatedGuard, "comparison");
    demand(await catalogAndDataFingerprint(target) === targetBeforeRepeatedGuard, "comparison");

    log("verified", {
      source_database: sourceDatabase.name,
      target_database: targetDatabase.name,
      archive_bytes: archiveBytes,
      archive_sha256: archiveHash,
      ledgers: fixtures.length,
      currencies: "EUR,MXN",
      amount_cents: LEDGER_AMOUNT_CENTS,
      payment_cents: LEDGER_PAYMENT_CENTS,
      balance_cents: LEDGER_BALANCE_CENTS,
    });
  } catch (error) {
    primaryError = phaseFailure(activePhase, error);
  } finally {
    if (key) key.fill(0);
    for (const path of artifacts) {
      try {
        if (existsSync(path)) removePrivateFile(path);
      } catch {
        cleanupFailed = true;
      }
    }
    for (const client of [source, target]) {
      if (client) {
        try {
          await client.end();
        } catch {
          cleanupFailed = true;
        }
      }
    }
    if (admin && sourceDatabase) {
      try {
        if (targetDatabase) await dropOwnedDatabase(admin, targetDatabase);
      } catch {
        cleanupFailed = true;
      }
      try {
        await dropOwnedDatabase(admin, sourceDatabase);
      } catch {
        cleanupFailed = true;
      }
    }
    if (admin) {
      try {
        await admin.end();
      } catch {
        cleanupFailed = true;
      }
    }
    if (primaryError || cleanupFailed) {
      process.stdout.write(JSON.stringify({
        status: "FAIL",
        phase: primaryError?.phase ?? "cleanup",
        code: primaryError?.safeCode,
        cleanup: cleanupFailed ? "failed" : "verified",
      }) + "\n");
      process.exitCode = 1;
    } else {
      process.stdout.write(JSON.stringify({ status: "PASS", cleanup: "verified" }) + "\n");
    }
  }
}

if (process.argv.includes("--record-ledger")) {
  void runLedgerChild();
} else {
  void runExperiment();
}

function makeArchiveAad(marker: Marker, sourceName: string, targetName: string) {
  return Buffer.from(JSON.stringify({
    purpose: "zaltyko-synthetic-postgresql-backup-restore",
    branch: marker.branch,
    run_id: marker.run_id,
    run_attempt: marker.run_attempt,
    expected_sha: marker.expected_sha,
    source_database: sourceName,
    target_database: targetName,
  }), "utf8");
}

function encryptArchive(plain: Buffer, key: Buffer, aad: Buffer) {
  demand(plain.length > 0 && plain.length <= MAX_ARCHIVE_BYTES, "archive-validation");
  demand(key.length === 32, "archive-validation");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([ENVELOPE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptArchive(envelope: Buffer, key: Buffer, aad: Buffer) {
  demand(envelope.length > ENVELOPE_MAGIC.length + 28, "archive-validation");
  demand(envelope.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC), "archive-validation");
  const offset = ENVELOPE_MAGIC.length;
  const iv = envelope.subarray(offset, offset + 12);
  const tag = envelope.subarray(offset + 12, offset + 28);
  const ciphertext = envelope.subarray(offset + 28);
  demand(ciphertext.length > 0 && ciphertext.length <= MAX_ARCHIVE_BYTES, "archive-validation");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  demand(plain.length <= MAX_ARCHIVE_BYTES, "archive-validation");
  return plain;
}

function verifyTamperRejected(envelope: Buffer, key: Buffer, aad: Buffer) {
  const corrupted = Buffer.from(envelope);
  corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 1;
  let rejected = false;
  try {
    decryptArchive(corrupted, key, aad);
  } catch {
    rejected = true;
  }
  demand(rejected, "archive-validation");
}

function validateArchiveToc(text: string, sourceName: string, targetName: string) {
  demand(
    text.split(/\r?\n/).some((line) => new RegExp(`^;\\s*dbname:\\s*${sourceName}\\s*$`, "i").test(line)),
    "archive-validation"
  );
  demand(!text.includes(targetName), "archive-validation");
  const entries = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith(";"));
  demand(entries.length > 0, "archive-validation");
  for (const entry of entries) {
    demand(!/\bDATABASE\b|\bTABLESPACE\b/i.test(entry), "archive-validation");
    demand(!entry.includes(sourceName) && !entry.includes(targetName), "archive-validation");
  }
}
