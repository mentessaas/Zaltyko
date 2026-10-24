#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { appendFileSync, readFileSync, writeFileSync } = require("node:fs");
const core = require("./project-vite-lockfile-core.cjs");

const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;
const OUTPUT_FIELDS = [
  ["base_manifest_sha256", "BASE_MANIFEST_SHA256"],
  ["raw_manifest_sha256", "RAW_MANIFEST_SHA256"],
  ["projected_manifest_sha256", "PROJECTED_MANIFEST_SHA256"],
  ["base_lockfile_sha256", "BASE_LOCKFILE_SHA256"],
  ["raw_lockfile_sha256", "RAW_LOCKFILE_SHA256"],
  ["projected_lockfile_sha256", "PROJECTED_LOCKFILE_SHA256"],
];
const VERIFY_ENV = Object.fromEntries(OUTPUT_FIELDS.map(([output, field]) => [output, `EXPECTED_${field}`]));
const FAILURE_CODES = new Set([
  "BASE_SHA_INVALID", "BASE_HEAD_MISMATCH", "GIT_ERROR", "GIT_OUTPUT_LIMIT",
  "STATUS_SCOPE", "RAW_READ", "BASE_READ", "WRITE", "POST_WRITE_HASH",
  "HASH_FORMAT", "HASH_MISMATCH", "OUTPUT_WRITE", "DIFF_SCOPE", "VERIFY_MODE",
  "MANIFEST_JSON", "MANIFEST_DUPLICATE_KEY", "MANIFEST_PIN", "MANIFEST_SCOPE",
  "LOCK_FORMAT", "LOCK_TARGET_SET", "LOCK_REFERENCE", "LOCK_METADATA",
  "LOCK_IMPORTER", "LOCK_SNAPSHOT", "LOCK_OFFSCOPE", "INPUT",
]);

class CliFailure extends Error {
  constructor(code) {
    const safe = FAILURE_CODES.has(code) ? code : "INPUT";
    super(safe);
    this.name = "CliFailure";
    this.code = safe;
  }
}

function fail(code) { throw new CliFailure(code); }
function ensure(condition, code) { if (!condition) fail(code); }
function validSha(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function bytes(value) { return Buffer.byteLength(value, "utf8"); }

function safeGitArgs(args) {
  if (args.length === 2 && args[0] === "rev-parse" && args[1] === "HEAD") return true;
  if (args.length === 3 && args[0] === "status" && args[1] === "--porcelain=v1" && args[2] === "--untracked-files=normal") return true;
  if (
    args.length === 2 && args[0] === "show" &&
    /^[a-f0-9]{40}:(?:package\.json|pnpm-lock\.yaml)$/.test(args[1])
  ) return true;
  if (
    args.length === 4 && args[0] === "diff" && args[1] === "--name-only" &&
    /^[a-f0-9]{40}$/.test(args[2]) && args[3] === "--"
  ) return true;
  if (args.length === 4 && args[0] === "diff" && args[1] === "--" &&
      args[2] === "package.json" && args[3] === "pnpm-lock.yaml") return true;
  return false;
}

function execGit(args, io) {
  ensure(safeGitArgs(args), "GIT_ERROR");
  let output;
  try {
    output = io.execGit(args, { encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES });
  } catch {
    fail("GIT_ERROR");
  }
  ensure(typeof output === "string" && bytes(output) <= MAX_GIT_OUTPUT_BYTES, "GIT_OUTPUT_LIMIT");
  return output;
}

function parseStatus(text) {
  ensure(typeof text === "string" && bytes(text) <= MAX_GIT_OUTPUT_BYTES, "GIT_OUTPUT_LIMIT");
  const entries = text.split(/\r?\n/).filter(Boolean);
  let manifest = 0;
  let lockfile = 0;
  let modules = 0;
  for (const entry of entries) {
    if (entry === " M package.json") manifest += 1;
    else if (entry === " M pnpm-lock.yaml") lockfile += 1;
    else if (entry === "?? node_modules/") modules += 1;
    else fail("STATUS_SCOPE");
  }
  ensure(manifest === 1 && lockfile === 1 && modules <= 1 && entries.length === manifest + lockfile + modules,
    "STATUS_SCOPE");
  return { manifest, lockfile, modules };
}

function assertHashBundle(hashes) {
  ensure(hashes && typeof hashes === "object", "HASH_FORMAT");
  for (const [name] of OUTPUT_FIELDS) ensure(validSha(hashes[name]), "HASH_FORMAT");
}

function baseFiles(baseSha, io) {
  return {
    manifest: execGit(["show", `${baseSha}:package.json`], io),
    lockfile: execGit(["show", `${baseSha}:pnpm-lock.yaml`], io),
  };
}

function assertHeadAndStatus(baseSha, io) {
  ensure(/^[a-f0-9]{40}$/.test(baseSha || ""), "BASE_SHA_INVALID");
  const head = execGit(["rev-parse", "HEAD"], io).trim();
  ensure(head === baseSha, "BASE_HEAD_MISMATCH");
  parseStatus(execGit(["status", "--porcelain=v1", "--untracked-files=normal"], io));
}

function expectedHashes(env) {
  const hashes = {};
  for (const [outputName] of OUTPUT_FIELDS) {
    const key = VERIFY_ENV[outputName];
    hashes[outputName] = env[key] || "";
  }
  assertHashBundle(hashes);
  return hashes;
}

function outputHashLines(baseSha, hashes) {
  const lines = [`base_sha=${baseSha}`];
  for (const [outputName] of OUTPUT_FIELDS) lines.push(`${outputName}=${hashes[outputName]}`);
  return lines.join("\n") + "\n";
}

function verifyMode(baseSha, env, io) {
  assertHeadAndStatus(baseSha, io);
  const expected = expectedHashes(env);
  const base = baseFiles(baseSha, io);
  const manifestText = io.readFile("package.json");
  const lockfileText = io.readFile("pnpm-lock.yaml");
  ensure(typeof manifestText === "string" && typeof lockfileText === "string", "RAW_READ");

  ensure(core.sha256(base.manifest) === expected.base_manifest_sha256, "HASH_MISMATCH");
  ensure(core.sha256(base.lockfile) === expected.base_lockfile_sha256, "HASH_MISMATCH");
  ensure(core.sha256(manifestText) === expected.projected_manifest_sha256, "HASH_MISMATCH");
  ensure(core.sha256(lockfileText) === expected.projected_lockfile_sha256, "HASH_MISMATCH");
  core.assertManifestEquivalentToBase(base.manifest, manifestText);
  core.assertCandidateEquivalentToBase(base.lockfile, lockfileText);

  const statusAfter = execGit(["status", "--porcelain=v1", "--untracked-files=normal"], io);
  parseStatus(statusAfter);
  const changed = execGit(["diff", "--name-only", baseSha, "--"], io).split(/\r?\n/).filter(Boolean).sort();
  ensure(sameList(changed, ["package.json", "pnpm-lock.yaml"]), "DIFF_SCOPE");
  const diff = execGit(["diff", "--", "package.json", "pnpm-lock.yaml"], io);
  io.writeStdout(diff);
  return 0;
}

function sameList(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }

function safeSnapshotDiagnostic(error) {
  if (!(error instanceof core.ViteProjectionFailure) || error.code !== "LOCK_SNAPSHOT") return "";
  const diagnostic = error.diagnostic;
  const targets = core.SNAPSHOT_DIAGNOSTIC_KEYS;
  const fields = new Set([...core.SNAPSHOT_DIAGNOSTIC_FIELDS, "<unknown>"]);
  if (!diagnostic || !Object.prototype.hasOwnProperty.call(targets, diagnostic.target)) return "";
  if (diagnostic.key !== targets[diagnostic.target]) return "";
  if (diagnostic.status !== "missing" && diagnostic.status !== "different") return "";
  if (!fields.has(diagnostic.field)) return "";
  const validHashOrMissing = (value) => value === undefined || /^[a-f0-9]{64}$/.test(value);
  if (!validHashOrMissing(diagnostic.baseSha256) || !validHashOrMissing(diagnostic.candidateSha256)) return "";
  if (diagnostic.status === "different" && (!diagnostic.baseSha256 || !diagnostic.candidateSha256)) return "";

  const parts = [
    `target=${diagnostic.target}`,
    `key=${targets[diagnostic.target]}`,
    `status=${diagnostic.status}`,
    `field=${diagnostic.field}`,
  ];
  if (diagnostic.baseSha256) parts.push(`base_sha256=${diagnostic.baseSha256}`);
  if (diagnostic.candidateSha256) parts.push(`candidate_sha256=${diagnostic.candidateSha256}`);
  return ` ${parts.join(" ")}`;
}

function projectMode(baseSha, env, io) {
  assertHeadAndStatus(baseSha, io);
  const base = baseFiles(baseSha, io);
  let rawManifest;
  let rawLockfile;
  try {
    rawManifest = io.readFile("package.json");
    rawLockfile = io.readFile("pnpm-lock.yaml");
  } catch {
    fail("RAW_READ");
  }
  ensure(typeof rawManifest === "string" && typeof rawLockfile === "string", "RAW_READ");

  const result = core.projectViteLockfileCore({
    baseManifestText: base.manifest,
    rawManifestText: rawManifest,
    baseLockfileText: base.lockfile,
    rawLockfileText: rawLockfile,
  });
  core.assertManifestEquivalentToBase(base.manifest, result.manifestText);
  core.assertCandidateEquivalentToBase(base.lockfile, result.lockfileText);
  assertHashBundle({
    base_manifest_sha256: result.hashes.baseManifestSha256,
    raw_manifest_sha256: result.hashes.rawManifestSha256,
    projected_manifest_sha256: result.hashes.projectedManifestSha256,
    base_lockfile_sha256: result.hashes.baseLockfileSha256,
    raw_lockfile_sha256: result.hashes.rawLockfileSha256,
    projected_lockfile_sha256: result.hashes.projectedLockfileSha256,
  });

  const statusBeforeWrite = execGit(["status", "--porcelain=v1", "--untracked-files=normal"], io);
  parseStatus(statusBeforeWrite);
  try {
    io.writeFile("package.json", result.manifestText);
    io.writeFile("pnpm-lock.yaml", result.lockfileText);
  } catch {
    fail("WRITE");
  }

  const writtenManifest = io.readFile("package.json");
  const writtenLockfile = io.readFile("pnpm-lock.yaml");
  ensure(core.sha256(writtenManifest) === result.hashes.projectedManifestSha256, "POST_WRITE_HASH");
  ensure(core.sha256(writtenLockfile) === result.hashes.projectedLockfileSha256, "POST_WRITE_HASH");
  core.assertManifestEquivalentToBase(base.manifest, writtenManifest);
  core.assertCandidateEquivalentToBase(base.lockfile, writtenLockfile);
  parseStatus(execGit(["status", "--porcelain=v1", "--untracked-files=normal"], io));

  const lines = outputHashLines(baseSha, {
    base_manifest_sha256: result.hashes.baseManifestSha256,
    raw_manifest_sha256: result.hashes.rawManifestSha256,
    projected_manifest_sha256: result.hashes.projectedManifestSha256,
    base_lockfile_sha256: result.hashes.baseLockfileSha256,
    raw_lockfile_sha256: result.hashes.rawLockfileSha256,
    projected_lockfile_sha256: result.hashes.projectedLockfileSha256,
  });
  if (env.GITHUB_OUTPUT) {
    try { io.appendFile(env.GITHUB_OUTPUT, lines); }
    catch { fail("OUTPUT_WRITE"); }
  }
  io.writeStdout(lines);
  return 0;
}

function createSystemIo() {
  return {
    execGit(args, options) {
      return execFileSync("git", args, { encoding: options.encoding, maxBuffer: options.maxBuffer });
    },
    readFile(path) { return readFileSync(path, "utf8"); },
    writeFile(path, content) { writeFileSync(path, content, "utf8"); },
    appendFile(path, content) { appendFileSync(path, content, { encoding: "utf8" }); },
    writeStdout(text) { process.stdout.write(text); },
    writeStderr(text) { process.stderr.write(text); },
  };
}

function runCli({ argv = [], env = process.env, io = createSystemIo() } = {}) {
  try {
    const baseSha = env.BASE_SHA || "";
    if (argv.length === 1 && argv[0] === "--verify") return verifyMode(baseSha, env, io);
    if (argv.length === 0) return projectMode(baseSha, env, io);
    fail("VERIFY_MODE");
  } catch (error) {
    const code = error && typeof error === "object" && FAILURE_CODES.has(error.code) ? error.code : "INPUT";
    const diagnostic = code === "LOCK_SNAPSHOT" ? safeSnapshotDiagnostic(error) : "";
    io.writeStderr(`Vite lockfile refresh rejected: code=${code}${diagnostic}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = runCli({ argv: process.argv.slice(2) });

module.exports = {
  MAX_GIT_OUTPUT_BYTES,
  OUTPUT_FIELDS,
  VERIFY_ENV,
  CliFailure,
  execGit,
  parseStatus,
  runCli,
};
