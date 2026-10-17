import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { es as directEs } from "date-fns/locale/es";
import { enUS as directEnUS } from "date-fns/locale/en-US";

const root = process.cwd();
const require = createRequire(pathToFileURL(resolve(root, "package.json")));
const { transform } = require("next/dist/build/swc") as {
  transform: (
    source: string,
    options: Record<string, unknown>
  ) => Promise<{ code: string }>;
};

describe("date locale build optimization", () => {
  it.each(["NEXT_RSPACK", "NEXT_PRIVATE_LOCAL_WEBPACK"])(
    "the probe rejects alternative compiler selector %s before compilation",
    (selector) => {
      const result = spawnSync(
        process.execPath,
        [resolve(root, "scripts/diagnose-date-locale-build.mjs")],
        {
          cwd: root,
          env: { [selector]: "1" },
          timeout: 5_000,
          maxBuffer: 4096,
          encoding: "utf8",
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe(
        "LOCALE_BUILD_PROBE_UNSUPPORTED_COMPILER"
      );
    }
  );

  it("opts the locale subpath in without changing Sentry, tracing or the build limit", () => {
    const url = pathToFileURL(resolve(root, "next.config.mjs")).href;
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const {default:c}=await import(${JSON.stringify(url)});console.log(JSON.stringify({packages:c.experimental.optimizePackageImports,worker:c.experimental.webpackBuildWorker,tracing:c.outputFileTracingIncludes,excludes:c.outputFileTracingExcludes,webpack:typeof c.webpack,rewrites:typeof c.rewrites==='function'?await c.rewrites():c.rewrites}));`,
      ],
      {
        cwd: root,
        env: { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
        timeout: 15_000,
        maxBuffer: 128 * 1024,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    const config = JSON.parse(output.trim().split("\n").at(-1)!);
    expect(config.packages).toEqual([
      "lucide-react",
      "@radix-ui/react-icons",
      "date-fns/locale",
    ]);
    expect(config.worker).toBeUndefined();
    expect(config.tracing).toEqual({
      "/*": ["./certs/supabase-root-ca.crt"],
    });
    expect(config.excludes).toBeUndefined();
    expect(config.webpack).toBe("function");
    expect(JSON.stringify(config.rewrites)).toContain("/monitoring");
    expect(
      readFileSync(
        resolve(root, "scripts/lib/local-e2e-runner-core.ts"),
        "utf8"
      )
    ).toContain("build: 240_000");
  });

  it.each(["es", "enUS", "es, enUS"])(
    "the installed Next SWC rewrites only the explicit locale subpath for %s",
    async (names) => {
      const source = `import { ${names} } from "date-fns/locale"; console.log(${names});`;
      const options = {
        filename: "locale-contract.js",
        jsc: { parser: { syntax: "ecmascript" } },
      };
      const baseline = await transform(source, {
        ...options,
        autoModularizeImports: { packages: ["date-fns"] },
      });
      const optimized = await transform(source, {
        ...options,
        autoModularizeImports: { packages: ["date-fns", "date-fns/locale"] },
      });
      expect(baseline.code).not.toContain("__barrel_optimize__");
      expect(optimized.code).toContain("__barrel_optimize__?names=");
      expect(optimized.code).toContain("!=!date-fns/locale");
    }
  );

  it("the selected locales are the original objects, including calendar options", () => {
    expect(directEs).toBe(es);
    expect(directEnUS).toBe(enUS);
    expect(es.options?.weekStartsOn).toBe(1);
    expect(enUS.options?.weekStartsOn).toBe(0);
  });

  it.each(["PPPP", "MMMM yyyy", "EEEE", "dd/MM/yyyy"])(
    "keeps Spanish and English formatting for %s",
    (pattern) => {
      const sample = new Date(2026, 9, 16, 12, 0, 0);
      expect(format(sample, pattern, { locale: directEs })).toBe(
        format(sample, pattern, { locale: es })
      );
      expect(format(sample, pattern, { locale: directEnUS })).toBe(
        format(sample, pattern, { locale: enUS })
      );
    }
  );
});
