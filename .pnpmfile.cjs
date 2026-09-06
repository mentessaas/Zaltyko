/**
 * .pnpmfile.cjs — runtime hook used by pnpm during install/resolution.
 *
 * Purpose: bypass pnpm's `overrides` field limitation with Next.js's hardcoded
 * transitive deps. `pnpm-workspace.yaml#overrides` does not propagate to
 * Next's exact-pinned `postcss@8.4.31` and optional `sharp@^0.34.3`, leaving
 * three high-severity CVEs unpatched:
 *
 *   - postcss arbitrary file read (GHSA-6g55-p6wh-862q)
 *   - postcss path traversal (GHSA-r28c-9q8g-f849)
 *   - sharp inherited vulnerabilities in libvips (fixed in sharp >= 0.35.0)
 *
 * The `readPackage` hook below rewrites the package metadata pnpm sees for
 * `next` so the resolver picks patched versions. Mirrors entries in
 * `pnpm-workspace.yaml#overrides` — keep the two in sync.
 */
"use strict";

const NEXT_PACKAGES = new Set(["next"]);

/** @type {import('pnpm').PnpmFileHooks} */
module.exports = {
  hooks: {
    readPackage(pkg, context) {
      if (pkg?.name && NEXT_PACKAGES.has(pkg.name)) {
        const bumped = { ...pkg };

        if (bumped.dependencies?.postcss === "8.4.31") {
          bumped.dependencies = {
            ...bumped.dependencies,
            postcss: "8.5.28",
          };
        }

        if (bumped.optionalDependencies?.sharp) {
          bumped.optionalDependencies = {
            ...bumped.optionalDependencies,
            sharp: "0.35.0",
          };
        }

        return bumped;
      }
      return pkg;
    },
  },
};
