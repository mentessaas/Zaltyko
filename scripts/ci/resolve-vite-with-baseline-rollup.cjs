#!/usr/bin/env node
"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const core = require("./project-vite-lockfile-core.cjs");

const OVERRIDE = "vite@6.4.5>rollup";
const ROLLUP = "4.63.1";
const VITE = "6.4.5";
const UPDATE_ARGS = ["update", "vite@6.4.5", "--lockfile-only", "--save-exact", "--ignore-scripts"];

class ResolveFailure extends Error {
  constructor(code) { super(code); this.name = "ResolveFailure"; this.code = code; }
}

function fail(code) { throw new ResolveFailure(code); }
function ensure(value, code) { if (!value) fail(code); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
function same(a, b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }

function run({ env = process.env, io = createSystemIo() } = {}) {
  try {
    const baseSha = env.BASE_SHA || "";
    ensure(/^[a-f0-9]{40}$/.test(baseSha), "BASE_SHA_INVALID");
    ensure(io.execGit(["rev-parse", "HEAD"]).trim() === baseSha, "BASE_HEAD_MISMATCH");
    ensure(io.execGit(["status", "--porcelain=v1", "--untracked-files=normal"]) === "", "STATUS_DIRTY");

    const baseManifest = io.execGit(["show", `${baseSha}:package.json`]);
    const baseLockfile = io.execGit(["show", `${baseSha}:pnpm-lock.yaml`]);
    ensure(io.readFile("package.json") === baseManifest, "BASE_MANIFEST_MISMATCH");
    ensure(io.readFile("pnpm-lock.yaml") === baseLockfile, "BASE_LOCK_MISMATCH");

    const base = core.parseJsonStrict(baseManifest);
    ensure(base.devDependencies?.vite === "6.4.3", "BASE_VITE_PIN");
    const baseOverrides = base.pnpm?.overrides ?? {};
    ensure(!Object.hasOwn(baseOverrides, OVERRIDE), "OVERRIDE_EXISTS");

    const temporary = JSON.parse(JSON.stringify(base));
    temporary.devDependencies.vite = VITE;
    temporary.pnpm ??= {};
    temporary.pnpm.overrides ??= {};
    temporary.pnpm.overrides[OVERRIDE] = ROLLUP;
    io.writeFile("package.json", `${JSON.stringify(temporary, null, 2)}\n`);

    const result = io.runPnpm(UPDATE_ARGS, {
      cwd: io.cwd,
      env: filteredEnv(env),
      stdio: "inherit",
      shell: false,
    });
    ensure(!result.error && result.status === 0, "RESOLVER_FAILED");

    const resolvedText = io.readFile("package.json");
    const resolved = core.parseJsonStrict(resolvedText);
    ensure(resolved.pnpm?.overrides?.[OVERRIDE] === ROLLUP, "RESOLVER_OVERRIDE_DRIFT");
    ensure(same(resolved, temporary), "RESOLVER_MANIFEST_SCOPE");

    const withoutTemporaryOverride = JSON.parse(JSON.stringify(resolved));
    delete withoutTemporaryOverride.pnpm.overrides[OVERRIDE];
    if (Object.keys(withoutTemporaryOverride.pnpm.overrides).length === 0 && !base.pnpm?.overrides) {
      delete withoutTemporaryOverride.pnpm.overrides;
    }
    if (Object.keys(withoutTemporaryOverride.pnpm).length === 0 && !base.pnpm) {
      delete withoutTemporaryOverride.pnpm;
    }
    const projectedManifest = core.projectManifest(baseManifest, JSON.stringify(withoutTemporaryOverride));
    core.assertManifestEquivalentToBase(baseManifest, projectedManifest);

    const resolvedLockfile = io.readFile("pnpm-lock.yaml");
    ensure(resolvedLockfile !== baseLockfile, "LOCK_UNCHANGED");
    ensure(io.execGit(["rev-parse", "HEAD"]).trim() === baseSha, "BASE_HEAD_MISMATCH");
    ensure(io.execGit(["status", "--porcelain=v1", "--untracked-files=normal"]) ===
      " M package.json\n M pnpm-lock.yaml\n", "STATUS_DRIFT");
    ensure(io.readFile("package.json") === resolvedText, "MANIFEST_CONCURRENT_CHANGE");
    ensure(io.readFile("pnpm-lock.yaml") === resolvedLockfile, "LOCK_CONCURRENT_CHANGE");
    io.writeFile("package.json", projectedManifest);
    ensure(io.readFile("package.json") === projectedManifest, "MANIFEST_FINAL_MISMATCH");
    io.writeStdout("Vite resolution completed with the temporary scoped Rollup pin removed.\n");
    return 0;
  } catch (error) {
    const known = new Set([
      "BASE_SHA_INVALID", "BASE_HEAD_MISMATCH", "STATUS_DIRTY", "BASE_MANIFEST_MISMATCH",
      "BASE_LOCK_MISMATCH", "BASE_VITE_PIN", "OVERRIDE_EXISTS", "RESOLVER_FAILED",
      "RESOLVER_OVERRIDE_DRIFT", "RESOLVER_MANIFEST_SCOPE", "MANIFEST_SCOPE",
      "MANIFEST_FINAL_MISMATCH", "LOCK_UNCHANGED", "STATUS_DRIFT",
      "MANIFEST_CONCURRENT_CHANGE", "LOCK_CONCURRENT_CHANGE", "MANIFEST_JSON",
      "MANIFEST_DUPLICATE_KEY", "INPUT",
    ]);
    const code = known.has(error?.code) ? error.code : "INPUT";
    io.writeStderr(`Vite resolution rejected: code=${code}\n`);
    return 1;
  }
}

function filteredEnv(env) {
  const result = {};
  for (const key of ["PATH", "HOME", "CI", "NODE_ENV", "PNPM_HOME", "COREPACK_HOME"]) {
    if (env[key] !== undefined) result[key] = env[key];
  }
  result.npm_config_userconfig = "/dev/null";
  return result;
}

function createSystemIo() {
  return {
    cwd: process.cwd(),
    execGit(args) { return execFileSync("git", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }); },
    readFile(path) { return readFileSync(path, "utf8"); },
    writeFile(path, content) { writeFileSync(path, content, "utf8"); },
    runPnpm(args, options) { return spawnSync("pnpm", args, options); },
    writeStdout(text) { process.stdout.write(text); },
    writeStderr(text) { process.stderr.write(text); },
  };
}

if (require.main === module) process.exitCode = run();

module.exports = { OVERRIDE, ROLLUP, VITE, UPDATE_ARGS, filteredEnv, run };
