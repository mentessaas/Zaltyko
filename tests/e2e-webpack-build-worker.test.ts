import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";

const root = process.cwd();
const runner = readFileSync(resolve(root, "scripts/run-e2e-local.ts"), "utf8");
const configUrl = pathToFileURL(resolve(root, "next.config.mjs")).href;
const productionEnvironment = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://jegxfahsvugilbthbked.supabase.co",
  ZALTYKO_PRODUCTION_BUILD_OPTIMIZATIONS: "true",
};

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

function readConfigurations(environments: Array<Record<string, string>> = [
  {},
  { E2E_LOCAL_SUPABASE: "true", ZALTYKO_E2E_WEBPACK_BUILD_WORKER: "true" },
]) {
  const source = `
    const results = [];
    const cases = ${JSON.stringify(environments)};
    const keys = [...new Set(cases.flatMap(environment => Object.keys(environment)))];
    for (const [index, environment] of cases.entries()) {
      for (const key of keys) delete process.env[key];
      Object.assign(process.env, environment);
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
    /\.\.\.\(([\s\S]*?)\/\/ Trace the completed server output while edge\/client compilation runs\./
  )?.[1];
  const webpackCallback = configSource.match(
    /webpack: (\(config, \{ isServer \}\) => \{[\s\S]*?\n  \}),/
  )?.[1];
  const buildGateDeclarations = configSource.match(
    /(const isSandboxPreviewBuild =[\s\S]*?)\n\/\/ Security headers/
  )?.[1];

  // Exercise the project's callback itself, without inventing a Next build context
  // for Sentry's wrapper. The separate import tests inspect the real wrapped export.
  function observeWebpackCache(env: Record<string, string>, isServer: boolean) {
    expect(webpackCallback).toBeDefined();
    expect(buildGateDeclarations).toBeDefined();
    const initialCache = { type: "filesystem", name: "existing-cache" };
    const config = {
      cache: initialCache,
      plugins: [] as Array<{ apply: unknown }>,
      resolve: { fallback: { existing: false } },
    };
    const result = runInNewContext(
      `${buildGateDeclarations!}\n(${webpackCallback!})(config, { isServer })`,
      { process: { env }, config, isServer },
      { timeout: 100 }
    );
    expect(result).toBe(config);
    return { result, initialCache };
  }

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

  it.each([
    ["VERCEL", undefined],
    ["VERCEL", "true"],
    ["VERCEL", "0"],
    ["VERCEL_ENV", undefined],
    ["VERCEL_ENV", "preview"],
    ["VERCEL_ENV", "development"],
    ["NEXT_PUBLIC_SUPABASE_URL", undefined],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://aeeootdmuiqkfeernskw.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://other.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://jegxfahsvugilbthbked.supabase.co/"],
    ["ZALTYKO_PRODUCTION_BUILD_OPTIMIZATIONS", undefined],
    ["ZALTYKO_PRODUCTION_BUILD_OPTIMIZATIONS", "false"],
    ["ZALTYKO_PRODUCTION_BUILD_OPTIMIZATIONS", "TRUE"],
    ["ZALTYKO_PRODUCTION_BUILD_OPTIMIZATIONS", "1"],
  ] as const)("rejects production optimization when %s=%s", (key, value) => {
    expect(selector).toBeDefined();
    const env: Record<string, string> = { ...productionEnvironment };
    if (value === undefined) delete env[key];
    else env[key] = value;
    expect(runInNewContext(`Boolean(${selector!})`, { process: { env } }, { timeout: 100 })).toBe(false);
    const { result, initialCache } = observeWebpackCache(env, true);
    expect(result.cache).toBe(initialCache);
    expect(result.plugins).toHaveLength(0);
  });

  it("enables production optimization only with all four exact requirements", () => {
    expect(selector).toBeDefined();
    expect(runInNewContext(
      `Boolean(${selector!})`,
      { process: { env: productionEnvironment } },
      { timeout: 100 }
    )).toBe(true);
  });

  it.each([true, false])("uses frozen memory cache for the opted-in production callback, server=%s", (isServer) => {
    const { result } = observeWebpackCache(productionEnvironment, isServer);
    expect(result.cache).toEqual({ type: "memory" });
    expect(Object.isFrozen(result.cache)).toBe(true);
    expect(result.plugins).toHaveLength(1);
    expect(typeof result.plugins[0].apply).toBe("function");
    expect(result.resolve.fallback.existing).toBe(false);
    if (!isServer) {
      for (const module of ["fs", "net", "tls", "dns", "child_process"]) {
        expect(result.resolve.fallback[module]).toBe(false);
      }
    }
  });

  it("preserves the separate local and sandbox callback cache behavior", () => {
    const local = observeWebpackCache({
      E2E_LOCAL_SUPABASE: "true",
      ZALTYKO_E2E_WEBPACK_BUILD_WORKER: "true",
    }, true);
    expect(local.result.cache).toBe(local.initialCache);
    expect(local.result.plugins).toHaveLength(0);
    const sandbox = observeWebpackCache({
      VERCEL_ENV: "preview",
      ZALTYKO_SANDBOX_PREVIEW_BRANCH: "codex/fix-f84-build-hang-20261019",
      NEXT_PUBLIC_SUPABASE_URL: "https://aeeootdmuiqkfeernskw.supabase.co",
      ZALTYKO_SANDBOX_PREVIEW_BUILD_OPTIMIZATIONS: "true",
    }, true);
    expect(sandbox.result.cache).toEqual({ type: "memory" });
    expect(Object.isFrozen(sandbox.result.cache)).toBe(true);
  });

  it("changes only the three gated build optimization settings in the observed configuration", () => {
    const [baseline, experiment] = readConfigurations();
    expect(baseline.hasWorker).toBe(false);
    expect(experiment.hasWorker).toBe(true);
    expect(experiment.worker).toBe(true);
    expect(experiment.experimental.serverMinification).toBe(false);
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

  it("preserves production Sentry monitoring, CA tracing and minification in the real exported configuration", () => {
    const [baseline, experiment] = readConfigurations([
      { ...productionEnvironment, ZALTYKO_PRODUCTION_BUILD_OPTIMIZATIONS: "false" },
      productionEnvironment,
    ]);
    expect(baseline.hasWorker).toBe(false);
    expect(experiment.worker).toBe(true);
    expect(experiment.experimental.parallelServerBuildTraces).toBe(true);
    for (const config of [baseline, experiment]) {
      expect(config.webpack).toBe("function");
      expect(JSON.stringify(config.rewrites)).toContain("/monitoring");
      expect(config.tracing).toEqual({ "/*": ["./certs/supabase-root-ca.crt"] });
      // Absence preserves Next's default; production must never inherit the
      // local/sandbox serverMinification:false override.
      expect(config.experimental).not.toHaveProperty("serverMinification");
    }
    delete experiment.experimental.webpackBuildWorker;
    delete experiment.experimental.parallelServerBuildTraces;
    delete experiment.worker;
    experiment.hasWorker = false;
    expect(experiment).toEqual(baseline);
  });

  it("sets the marker only in the build invocation, outside inherited and server environments", () => {
    expect(runner.match(/ZALTYKO_E2E_WEBPACK_BUILD_WORKER/g)).toHaveLength(1);
    expect(runner).toMatch(
      /const buildTimeoutMs =\s*process\.env\.GITHUB_ACTIONS === "true"\s*\?\s*LOCAL_E2E_TIMEOUTS\.ciBuild\s*:\s*LOCAL_E2E_TIMEOUTS\.build/
    );
    expect(runner).toMatch(
      /nextBuild\.args,\s*\{\s*\.\.\.childEnv,\s*NODE_ENV: "production",\s*ZALTYKO_E2E_WEBPACK_BUILD_WORKER: "true",\s*\},\s*buildTimeoutMs,\s*abortController\.signal/
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
