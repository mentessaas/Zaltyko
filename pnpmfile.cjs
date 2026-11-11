/**
 * pnpmfile.cjs — runtime hook used by pnpm during install/resolution.
 * See the security rationale in the original dependency hook.
 */
"use strict";

const PATCHED_DEPENDENCIES = new Map([
  ["esbuild", "^0.25.0"],
  ["fast-uri", "^3.1.9"],
  ["ip-address", "^10.7.4"],
  ["js-yaml", "^4.3.2"],
  ["basic-ftp", "^6.2.1"],
  ["dompurify", "^3.4.17"],
  ["zod", "^4.6.7"],
  ["proxy-addr", "^2.0.8"],
  ["source-map-js", "^1.2.2"],
  ["@modelcontextprotocol/sdk", "^1.31.0"],
  ["lighthouse", "^13.5.0"],
  ["puppeteer-core", "^25.12.0"],
  ["proxy-agent", "^8.0.1"],
  ["moment", "^2.31.0"],
  ["sharp", "^0.35.5"],
]);

const SAME_MAJOR_FLOORS = [
  // qs 6.7.0–6.16.0: `stringify` with arrayFormat "comma" throws on array
  // items whose own `toString` is not callable (DoS, GHSA-6pq8-jhm2-2vcw).
  // Reached at runtime through express 4/5 and body-parser. Fixed in 6.16.1.
  { name: "qs", major: 6, floor: "6.16.1" },
  // @hono/node-server < 2.1.3: `serveStatic` decodes the request path twice
  // and can skip middleware on static paths (GHSA-rmxm-3fg6-px4f). Reached
  // through @modelcontextprotocol/sdk, which accepts `^1.19.9 || ^2.0.5` and
  // already resolves the 2.x line; 1.x has no patched release.
  { name: "@hono/node-server", major: 2, floor: "2.1.3" },
];

// --- Floor rewriting (small, dependency-free semver subset) -----------------
// pnpm runs this hook before node_modules exists, so `semver` cannot be
// required. The subset below covers every range shape npm registries use in
// practice; anything else is left untouched and reported through pnpm's log.

const VERSION = /^v?(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

// Parse a (possibly partial) version: "6", "6.16", "6.x", "2.1.3-rc.1".
function parseVersion(text) {
  const match = VERSION.exec(text);
  if (!match) return undefined;
  const parts = [match[1], match[2], match[3]];
  const wildcardAt = parts.findIndex((part) => part === undefined || /^[xX*]$/.test(part));
  return {
    numbers: parts.map((part) => (/^\d+$/.test(part ?? "") ? Number(part) : 0)),
    // How many leading components are concrete (3 = full version).
    precision: wildcardAt === -1 ? 3 : wildcardAt,
    prerelease: match[4],
  };
}

function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === undefined) return 1; // 2.1.3 > 2.1.3-rc.1
  if (b.prerelease === undefined) return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

const COMPARATOR = /^(>=|<=|>|<|=)?\s*(.+)$/;

// Rewrite one `||` alternative so that it can no longer resolve below
// `floor`, keeping the consumer's operator. Returns the (possibly unchanged)
// alternative, or undefined when the shape is not understood.
function liftAlternative(alternative, rule, floor) {
  const text = alternative.trim();
  const floorText = rule.floor;

  // Hyphen range "A - B".
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text);
  if (hyphen) {
    const low = parseVersion(hyphen[1]);
    const high = parseVersion(hyphen[2]);
    if (!low || !high) return undefined;
    if (low.numbers[0] !== rule.major || compareVersions(low, floor) >= 0) return text;
    return compareVersions(high, floor) >= 0 ? `${floorText} - ${hyphen[2]}` : `^${floorText}`;
  }

  // Caret, tilde, exact and partial versions.
  const simple = /^(\^|~|=)?\s*(\S+)$/.exec(text);
  if (simple && !/^[<>]/.test(text)) {
    const operator = simple[1] ?? "";
    const version = parseVersion(simple[2]);
    if (!version) return undefined;
    if (version.precision === 0) return text; // "*" / "x": not tied to a major
    if (version.numbers[0] !== rule.major || compareVersions(version, floor) >= 0) return text;
    if (operator === "^" || operator === "~" || operator === "=") return `${operator}${floorText}`;
    if (version.precision === 1) return `^${floorText}`; // "6" / "6.x"
    if (version.precision === 2) return `~${floorText}`; // "6.16" / "6.16.x"
    return floorText; // exact pin stays exact
  }

  // Comparator set, e.g. ">=6 <7" or ">=6.7.0".
  const comparators = text.split(/\s+/).map((token) => {
    const match = COMPARATOR.exec(token);
    const version = match && parseVersion(match[2]);
    return version ? { operator: match[1] ?? "=", version, token } : undefined;
  });
  if (comparators.some((comparator) => comparator === undefined)) return undefined;
  const lower = comparators.find(({ operator }) => operator === ">=" || operator === ">");
  if (!lower || lower.version.numbers[0] !== rule.major) return text;
  if (compareVersions(lower.version, floor) >= 0) return text;
  const upperExcludesFloor = comparators.some(({ operator, version }) =>
    (operator === "<" && compareVersions(version, floor) <= 0) ||
    (operator === "<=" && compareVersions(version, floor) < 0));
  if (upperExcludesFloor) return `^${floorText}`;
  return comparators
    .map((comparator) => (comparator === lower ? `>=${floorText}` : comparator.token))
    .join(" ");
}

// Raise each `||` alternative that sits on the rule's major line and can still
// resolve below the floor; alternatives on other majors, already at or above
// the floor, or not understood (tags, `workspace:`, URLs…) stay as they are.
function liftToFloor(requested, rule, log) {
  const floor = parseVersion(rule.floor);
  const alternatives = String(requested).split("||");
  let unknown = false;
  const lifted = alternatives.map((alternative) => {
    const next = liftAlternative(alternative, rule, floor);
    if (next === undefined) {
      unknown = true;
      return alternative.trim();
    }
    return next;
  });
  if (unknown && typeof log === "function") {
    log(`pnpmfile: rango no reconocido para ${rule.name} (${requested}); se deja igual, revisar a mano.`);
  }
  const result = lifted.join(" || ");
  return result === alternatives.map((alternative) => alternative.trim()).join(" || ") ? requested : result;
}

/** @type {import('pnpm').PnpmFileHooks} */
module.exports = {
  hooks: {
    readPackage(pkg, context) {
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

      // body-parser has distinct patched lines for Express 4 and 5. Preserve
      // the dependency major while lifting each vulnerable range to its fix.
      for (const field of ["dependencies", "optionalDependencies", "devDependencies"]) {
        const dependencies = bumped[field];
        if (!dependencies?.["body-parser"]) continue;
        const range = String(dependencies["body-parser"]);
        const major = Number.parseInt(range.replace(/^[^0-9]*/, "").split(".")[0], 10);
        const patchedRange = major === 1 ? "^1.20.9" : major === 2 ? "^2.4.0" : undefined;
        if (patchedRange && dependencies["body-parser"] !== patchedRange) {
          bumped[field] = { ...dependencies, "body-parser": patchedRange };
          changed = true;
        }
      }

      // undici 7 below 7.30.1 has TLS validation, cache-poisoning and DoS
      // advisories (reached only through jsdom in tests). Lift the 7.x line
      // to its fix without forcing other majors onto it.
      for (const field of ["dependencies", "optionalDependencies", "devDependencies"]) {
        const dependencies = bumped[field];
        if (!dependencies?.undici) continue;
        const range = String(dependencies.undici);
        const major = Number.parseInt(range.replace(/^[^0-9]*/, "").split(".")[0], 10);
        if (major === 7 && range !== "^7.30.1") {
          bumped[field] = { ...dependencies, undici: "^7.30.1" };
          changed = true;
        }
      }

      // Same-major security floors for transitive packages (P0 #2, 2026-11-11).
      for (const field of ["dependencies", "optionalDependencies", "devDependencies"]) {
        if (!bumped[field]) continue;
        for (const rule of SAME_MAJOR_FLOORS) {
          const requested = bumped[field][rule.name];
          if (requested === undefined) continue;
          const lifted = liftToFloor(requested, rule, context?.log);
          if (lifted !== requested) {
            bumped[field] = { ...bumped[field], [rule.name]: lifted };
            changed = true;
          }
        }
      }

      // Next currently declares postcss 8.4.31; keep the existing patched
      // compatibility pin while resolving the security-sensitive graph.
      if (bumped.dependencies?.postcss === "8.4.31") {
        bumped.dependencies = { ...bumped.dependencies, postcss: "8.5.28" };
        changed = true;
      }

      // @tailwindcss/typography pins a vulnerable postcss-selector-parser 6.0.10.
      // Keep this major-version override scoped to that consumer.
      if (bumped.name === "@tailwindcss/typography" && bumped.dependencies?.["postcss-selector-parser"]) {
        bumped.dependencies = {
          ...bumped.dependencies,
          "postcss-selector-parser": "^7.1.6",
        };
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
