// Dependency-only A/B probe. Never imports the app, loads .env or starts a server.
// Use a sanitized environment. 60s event-loop timer after init; not an app build.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

if (process.env.NEXT_RSPACK || process.env.NEXT_PRIVATE_LOCAL_WEBPACK) {
  console.error("LOCALE_BUILD_PROBE_UNSUPPORTED_COMPILER");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const nextWebpack = require("next/dist/compiled/webpack/webpack");
nextWebpack.init();
const { webpack } = nextWebpack;
const { transform } = require("next/dist/build/swc");
const barrelLoader =
  require.resolve("next/dist/build/webpack/loaders/next-barrel-loader");
const input =
  'import { es, enUS } from "date-fns/locale"; console.log(es.code, enUS.code);';
const deadline = setTimeout(() => {
  console.error("LOCALE_BUILD_PROBE_TIMEOUT");
  process.exit(1);
}, 60_000);

async function probe(target, optimized) {
  const { code } = await transform(input, {
    filename: "locale-probe.js",
    jsc: { parser: { syntax: "ecmascript" } },
    autoModularizeImports: {
      packages: optimized ? ["date-fns", "date-fns/locale"] : ["date-fns"],
    },
  });
  assert.equal(code.includes("__barrel_optimize__"), optimized);
  const compiler = webpack({
    context: process.cwd(),
    mode: "production",
    target,
    cache: false,
    devtool: false,
    entry: `data:text/javascript,${encodeURIComponent(code)}`,
    output: { path: process.cwd(), filename: "locale-probe-never-emitted.js" },
    optimization: { minimize: false, concatenateModules: false },
    module: {
      rules: [
        {
          test: /__barrel_optimize__/,
          use: ({ resourceQuery }) => [
            {
              loader: barrelLoader,
              options: {
                names: (
                  resourceQuery.match(/\?names=([^&]+)/)?.[1] || ""
                ).split(","),
              },
              ident: `next-barrel-loader:${resourceQuery}`,
            },
          ],
        },
      ],
    },
  });
  // Compile dependency graphs, but write no bundles or cache into the checkout.
  compiler.hooks.shouldEmit.tap("NoProbeArtifacts", () => false);
  try {
    const stats = await new Promise((resolve, reject) => {
      compiler.run((error, result) => {
        if (error || !result) reject(new Error("PROBE_COMPILER_FAILED"));
        else resolve(result);
      });
    });
    assert.equal(stats.hasErrors(), false, "PROBE_COMPILATION_ERRORS");
    const resources = [...stats.compilation.modules]
      .map((module) => module.resource)
      .filter((resource) => typeof resource === "string");
    const localeModules = resources.filter((resource) =>
      /date-fns[\\/]locale[\\/]/.test(resource)
    );
    const locales = [
      ...new Set(
        localeModules.flatMap((resource) => {
          const match = resource.match(
            /date-fns[\\/]locale[\\/]([A-Za-z-]+)(?:[\\/]|\.js$)/
          );
          return match ? [match[1]] : [];
        })
      ),
    ].sort();
    if (optimized) assert.deepEqual(locales, ["en-US", "es"]);
    else assert.ok(locales.length > 50, "BASELINE_MUST_TRAVERSE_OTHER_LOCALES");
    return {
      target,
      optimized,
      compiledModules: stats.compilation.modules.size,
      localeModules: localeModules.length,
      localeCount: locales.length,
      compileMs: stats.endTime - stats.startTime,
      // Deliberately no filesystem paths, module source, env or raw diagnostics.
    };
  } finally {
    await new Promise((resolve, reject) =>
      compiler.close((error) =>
        error ? reject(new Error("PROBE_CLOSE_FAILED")) : resolve()
      )
    );
  }
}

try {
  const results = [];
  // Reversed order across targets exposes warm-up effects in timing.
  for (const [target, order] of [
    ["web", [false, true]],
    ["node22", [true, false]],
  ]) {
    for (const optimized of order) results.push(await probe(target, optimized));
  }
  console.log(
    JSON.stringify({
      scope: "dependency_graph_only_not_full_next_build",
      node: process.versions.node,
      next: require("next/package.json").version,
      dateFns: require("date-fns/package.json").version,
      webpack: webpack.version,
      results,
    })
  );
} catch {
  console.error("LOCALE_BUILD_PROBE_FAILED");
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
}
