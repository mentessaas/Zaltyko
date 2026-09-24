/**
 * pnpmfile.cjs — runtime hook used by pnpm during install/resolution.
 * See the security rationale in the original dependency hook.
 */
"use strict";

const PATCHED_DEPENDENCIES = new Map([
  ["esbuild", "^0.25.0"],
  ["js-yaml", "^4.3.2"],
  ["sharp", "^0.35.4"],
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

      return changed ? bumped : pkg;
    },
  },
};
