/**
 * Deterministic tsx invocation for the gate scripts.
 *
 * Why not `npx --no-install tsx …`?
 *   `npx` resolution is cwd-sensitive and, inside this repo, reproducibly hangs:
 *   `npx --no-install tsx --version` returns in ~1.7s from the parent directory
 *   but never returns when cwd is the repo root (observed >7min at 0% CPU, no
 *   child process spawned). That made `pnpm gate:all` unusable in CI.
 *
 * Why not `node_modules/.bin/tsx`?
 *   Under pnpm that bin is a shell wrapper, so `node <wrapper>` fails, and the
 *   literal path is brittle with respect to where the repo is checked out.
 *
 * What we do instead: resolve tsx's ESM CLI entry through Node's own resolver
 * and run it with the same interpreter that is already executing us. No shell,
 * no PATH lookup, no package-manager shim, no network, no cwd sensitivity.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";

const require_ = createRequire(__filename);

/**
 * Absolute path to tsx's CLI entrypoint, resolved via Node module resolution.
 *
 * `tsx/cli` is the subpath its `exports` map publishes for the binary; note that
 * resolving `tsx/dist/cli.mjs` directly throws ERR_PACKAGE_PATH_NOT_EXPORTED.
 * The fallback reads the package's own `bin` field so this keeps working if a
 * future tsx renames that subpath.
 */
export function resolveTsxCli(): string {
  try {
    return require_.resolve("tsx/cli");
  } catch {
    const pkgPath = require_.resolve("tsx/package.json");
    const pkg = require_("tsx/package.json") as { bin?: string | Record<string, string> };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.tsx;
    if (!bin) throw new Error("cannot resolve the tsx CLI: no bin entry in tsx/package.json");
    return path.resolve(path.dirname(pkgPath), bin);
  }
}

export interface RunTsxOptions {
  cwd?: string;
  /** "inherit" streams to the parent (CI logs); "pipe" captures for assertions. */
  stdio?: "inherit" | "pipe";
}

/**
 * Run a TypeScript entrypoint under tsx.
 *
 * Returns the raw spawnSync result so callers can distinguish a real non-zero
 * exit (gate found violations) from a failure to launch at all (`status === null`,
 * `error` set) — conflating those is how a broken runner masquerades as a pass.
 */
export function runTsx(
  script: string,
  args: string[] = [],
  options: RunTsxOptions = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [resolveTsxCli(), script, ...args], {
    stdio: options.stdio ?? "inherit",
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
  });
}
