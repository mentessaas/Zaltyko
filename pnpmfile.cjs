/**
 * pnpmfile.cjs — runtime hook used by pnpm during install/resolution.
 * See the security rationale in the original dependency hook.
 */
"use strict";

const PATCHED_DEPENDENCIES = new Map([
  ["esbuild", "^0.25.0"],
  ["fast-uri", "^3.1.8"],
  ["ip-address", "^10.7.1"],
  ["js-yaml", "^4.3.2"],
  ["basic-ftp", "^6.2.1"],
  ["dompurify", "^3.4.16"],
  ["proxy-addr", "^2.0.8"],
  ["source-map-js", "^1.2.2"],
  ["@modelcontextprotocol/sdk", "^1.31.0"],
  ["lighthouse", "^13.5.0"],
  ["puppeteer-core", "^25.12.0"],
  ["proxy-agent", "^8.0.1"],
  ["moment", "^2.31.0"],
  ["sharp", "^0.35.5"],
]);

/** @type {import('pnpm').PnpmFileHooks} */
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (!pkg?.name) return pkg;

      const bumped = { ...pkg };
      let changed = false;
      for (const field of ["dependencies", "optionalDependencies", "devDependencies"]) {
        const dependencies = bumped[field];
        if (!dependencies) continue;
        const nextDependencies = { ...dependencies };
        for (const [dependencyName, patchedRange] of PATCHED_DEPENDENCIES) {
          if (dependencyName in nextDependencies) {
            nextDependencies[dependencyName] = patchedRange;
            changed = true;
          }
        }
        bumped[field] = nextDependencies;
      }

      // Next currently declares postcss 8.4.31; keep the existing patched
      // compatibility pin while resolving the security-sensitive graph.
      if (bumped.dependencies?.postcss === "8.4.31") {
        bumped.dependencies = { ...bumped.dependencies, postcss: "8.5.28" };
        changed = true;
      }

      // brace-expansion has patched releases in each supported major line.
      // Keep minimatch 3 on the 1.x line and minimatch 9/10 on the 5.x line;
      // a global override would break their peer-compatible ranges.
      if (bumped.name === "minimatch") {
        const minimatchMajor = Number.parseInt(String(bumped.version ?? "").split(".")[0], 10);
        const braceRange = minimatchMajor === 3
          ? "^1.1.21"
          : minimatchMajor >= 9
            ? "^5.0.12"
            : undefined;
        if (braceRange && bumped.dependencies?.["brace-expansion"] !== braceRange) {
          bumped.dependencies = { ...bumped.dependencies, "brace-expansion": braceRange };
          changed = true;
        }
      }

      return changed ? bumped : pkg;
    },
  },
};
