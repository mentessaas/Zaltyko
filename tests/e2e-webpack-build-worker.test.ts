import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";

const root = process.cwd();
const runner = readFileSync(resolve(root, "scripts/run-e2e-local.ts"), "utf8");
const configUrl = pathToFileURL(resolve(root, "next.config.mjs")).href;

const cases = [
  [undefined, undefined, false],
  ["true", undefined, false],
  [undefined, "true", false],
  ["false", "true", false],
  ["true", "false", false],
  ["TRUE", "true", false],
  ["true", "1", false],
  ["true", "true", true],
] as const;

function readConfigurations() {
  const source = `
    const results = [];
    const cases = [[null, null], ["true", "true"]];
    for (const [index, [local, worker]] of cases.entries()) {
      delete process.env.E2E_LOCAL_SUPABASE;
      delete process.env.ZALTYKO_E2E_WEBPACK_BUILD_WORKER;
      if (local !== null) process.env.E2E_LOCAL_SUPABASE = local;
      if (worker !== null) process.env.ZALTYKO_E2E_WEBPACK_BUILD_WORKER = worker;
      // Fresh config evaluation per case; its Sentry dependency stays cached.
      const { default: c } = await import(${JSON.stringify(configUrl)} + '?worker-case=' + index);
      results.push({
        hasWorker: Object.hasOwn(c.experimental, 'webpackBuildWorker'),
        worker: c.experimental.webpackBuildWorker,
        webpack: typeof c.webpack,
        tracing: c.outputFileTracingIncludes,
        typescript: c.typescript,
        eslint: c.eslint,
        experimental: c.experimental,
        redirects: await c.redirects(),
        rewrites: typeof c.rewrites === 'function' ? await c.rewrites() : c.rewrites
      });
    }
    console.log(JSON.stringify(results));
  `;
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", source],
    {
      cwd: root,
      // No inherited credentials, VERCEL_ENV, NODE_OPTIONS or experiment markers.
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 128 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

describe("synthetic webpack build worker experiment", () => {
  const configSource = readFileSync(resolve(root, "next.config.mjs"), "utf8");
  // Exercise the actual side-effect-free selector without repeatedly loading Sentry.
  const selector = configSource.match(
    /\.\.\.\(([\s\S]*?)\)\s*(?:(?:\/\/[^\n]*)(?:\r?\n|$)\s*)*\?\s*\{\s*webpackBuildWorker: true/
  )?.[1];

  it.each(
    cases.map(([local, worker, enabled], index) => ({
      local,
      worker,
      enabled,
      index,
    }))
  )(
    "isolates configuration for local=$local worker=$worker case=$index",
    ({ local, worker, enabled }) => {
      expect(selector).toBeDefined();
      const actual = runInNewContext(
        `Boolean(${selector!})`,
        {
          process: {
            env: {
              ...(local === undefined ? {} : { E2E_LOCAL_SUPABASE: local }),
              ...(worker === undefined
                ? {}
                : { ZALTYKO_E2E_WEBPACK_BUILD_WORKER: worker }),
            },
          },
        },
        { timeout: 100 }
      );
      expect(actual).toBe(enabled);
    }
  );

  it("requires the exact preview branch, sandbox project, and optimization opt-in", () => {
    const evaluate = (env: Record<string, string>) =>
      runInNewContext(`Boolean(${selector!})`, { process: { env } }, { timeout: 100 });
    const sandbox = {
      VERCEL_ENV: "preview",
      ZALTYKO_SANDBOX_PREVIEW_BRANCH: "codex/fix-f84-build-hang-20261019",
      NEXT_PUBLIC_SUPABASE_URL: "https://aeeootdmuiqkfeernskw.supabase.co",
      ZALTYKO_SANDBOX_PREVIEW_BUILD_OPTIMIZATIONS: "true",
    };
    expect(evaluate(sandbox)).toBe(true);
    expect(evaluate({ ...sandbox, VERCEL_ENV: "production" })).toBe(false);
    expect(evaluate({ ...sandbox, ZALTYKO_SANDBOX_PREVIEW_BRANCH: "main" })).toBe(false);
    expect(evaluate({ ...sandbox, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" })).toBe(false);
    expect(evaluate({ ...sandbox, ZALTYKO_SANDBOX_PREVIEW_BUILD_OPTIMIZATIONS: "false" })).toBe(false);
  });

  it("changes only the three gated build optimization settings in the observed configuration", () => {
    const [baseline, experiment] = readConfigurations();
    expect(baseline.hasWorker).toBe(false);
    expect(experiment.hasWorker).toBe(true);
    expect(experiment.worker).toBe(true);
    for (const config of [baseline, experiment]) {
      expect(config.webpack).toBe("function");
      expect(JSON.stringify(config.rewrites)).toContain("/monitoring");
      expect(config.tracing).toEqual({
        "/*": ["./certs/supabase-root-ca.crt"],
      });
    }
    delete experiment.experimental.webpackBuildWorker;
    delete experiment.experimental.parallelServerBuildTraces;
    delete experiment.experimental.serverMinification;
    delete experiment.worker;
    experiment.hasWorker = false;
    expect(experiment).toEqual(baseline);
  });

  it("sets the marker only in the build invocation, outside inherited and server environments", () => {
    expect(runner.match(/ZALTYKO_E2E_WEBPACK_BUILD_WORKER/g)).toHaveLength(1);
    expect(runner).toMatch(
      /nextBuild\.args,\s*\{\s*\.\.\.childEnv,\s*NODE_ENV: "production",\s*ZALTYKO_E2E_WEBPACK_BUILD_WORKER: "true",\s*\},\s*LOCAL_E2E_TIMEOUTS\.build,\s*abortController\.signal/
    );
    expect(runner).toMatch(
      /playwrightCli\.args,|const playwrightArgs = playwrightCli\.args/
    );
    const inherited = runner.slice(
      runner.indexOf("const safeEnvironment"),
      runner.indexOf("safeEnvironment.NODE_ENV")
    );
    expect(inherited).not.toContain("ZALTYKO_E2E_WEBPACK_BUILD_WORKER");
    const child = runner.slice(
      runner.indexOf("const childEnv:"),
      runner.indexOf("Building the app")
    );
    expect(child).not.toContain("ZALTYKO_E2E_WEBPACK_BUILD_WORKER");
    expect(runner).toMatch(
      /playwrightCli\.command,\s*playwrightArgs,\s*childEnv,/
    );
    const core = readFileSync(
      resolve(root, "scripts/lib/local-e2e-runner-core.ts"),
      "utf8"
    );
    expect(core).toContain("build: 240_000");
  });
});
