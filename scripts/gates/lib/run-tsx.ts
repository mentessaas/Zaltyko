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
  // `tsx/cli` starts an IPC server for its transform cache. Sandboxed runners
  // may deny that local pipe even though ordinary file execution is allowed.
  // Node's tsx loader gives the same TypeScript execution without that IPC
  // side channel and works both locally and in CI.
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    stdio: options.stdio ?? "inherit",
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
  });
}
