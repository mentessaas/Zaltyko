#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const yaml = require("js-yaml");

const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_DIAGNOSTIC_DIFFS = 200;
const MAX_DIAGNOSTIC_PATHS = 5;
const MAX_DIAGNOSTIC_DEPTH = 8;

const versions = [
  {
    name: "follow-redirects",
    from: "1.16.0",
    to: "1.16.1",
    integrity: "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==",
  },
  {
    name: "hono",
    from: "4.13.7",
    to: "4.13.13",
    integrity: "sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==",
  },
];

const KNOWN_DIAGNOSTIC_LOCATORS = new Set([
  "follow-redirects@1.16.0",
  "follow-redirects@1.16.1",
  "hono@4.13.7",
  "hono@4.13.13",
  "axios@1.20.0",
  "@hono/node-server@2.1.1",
  "@hono/node-server@2.1.1(hono@4.13.7)",
  "@hono/node-server@2.1.1(hono@4.13.13)",
  "@modelcontextprotocol/sdk@1.32.1(zod@3.25.76)",
]);
const KNOWN_DIAGNOSTIC_PACKAGE_NAMES = new Set([
  "follow-redirects",
  "hono",
  "axios",
  "@hono/node-server",
  "@modelcontextprotocol/sdk",
  "zod",
]);
const SAFE_DIAGNOSTIC_FIELDS = new Set([
  "resolution",
  "engines",
  "node",
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "devDependencies",
  "peerDependenciesMeta",
  "transitivePeerDependencies",
  "cpu",
  "os",
  "deprecated",
  "hasBin",
  "requiresBuild",
  "optional",
  "version",
  "name",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertGitOutputWithinLimit(output) {
  const bytes = Buffer.byteLength(output);
  assert(bytes <= MAX_GIT_OUTPUT_BYTES, `Salida Git excede el límite de ${MAX_GIT_OUTPUT_BYTES} bytes`);
  return output;
}

function assertExpectedGitStatus(statusOutput) {
  const entries = statusOutput.split(/\r?\n/).filter(Boolean);
  let lockfileCount = 0;
  let nodeModulesCount = 0;

  for (const entry of entries) {
    if (entry === " M pnpm-lock.yaml" || entry === "M  pnpm-lock.yaml") {
      lockfileCount += 1;
      continue;
    }
    if (entry === "?? node_modules/") {
      nodeModulesCount += 1;
      continue;
    }
    throw new Error("El checkout contiene cambios fuera del lockfile y node_modules/ generado por pnpm");
  }

  assert(lockfileCount === 1, "El checkout debe contener solo el cambio esperado de pnpm-lock.yaml");
  assert(nodeModulesCount <= 1, "La salida Git contiene una entrada node_modules/ duplicada");
}

function safeGitCommand(args) {
  if (
    args.length === 3 && args[0] === "status" && args[1] === "--porcelain" &&
    args[2] === "--untracked-files=normal"
  ) {
    return "git status --porcelain --untracked-files=normal";
  }
  if (
    args.length === 4 && args[0] === "diff" && args[1] === "--name-only" &&
    /^[0-9a-f]{40}$/.test(args[2]) && args[3] === "--"
  ) return `git diff --name-only ${args[2]} --`;
  if (args.length === 2 && /^[0-9a-f]{40}:pnpm-lock\.yaml$/.test(args[1]) && args[0] === "show") {
    return `git show ${args[1]}`;
  }
  if (args.length === 3 && args[0] === "diff" && args[1] === "--" && args[2] === "pnpm-lock.yaml") {
    return "git diff -- pnpm-lock.yaml";
  }
  return "git command with fixed arguments";
}

function execGit(args, run = execFileSync) {
  try {
    const output = run("git", args, {
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    });
    return assertGitOutputWithinLimit(output);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error &&
      typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
        ? error.code
        : "ERROR";
    throw new Error(`Falló ${safeGitCommand(args)} (${code})`);
  }
}

function locatorVersion(name, version) {
  return new RegExp(`(^|[^A-Za-z0-9._-])${name}@${version.replaceAll(".", "\\.")}(?=$|[^0-9])`);
}

function isAllowedReferencePath(path, name) {
  if (path[0] === "packages" && path[1]?.startsWith(`${name}@`)) return true;
  if (path[0] !== "snapshots") return false;

  const snapshot = path[1] ?? "";
  if (path.length === 2 && snapshot.startsWith(`${name}@`)) return true;
  if (
    name === "hono" &&
    path.length === 2 &&
    snapshot.startsWith("@hono/node-server@2.1.1(hono@")
  ) return true;
  if (
    name === "follow-redirects" &&
    snapshot === "axios@1.20.0" &&
    path[2] === "dependencies" &&
    path[3] === "follow-redirects"
  ) return true;
  if (
    name === "hono" &&
    snapshot.startsWith("@hono/node-server@2.1.1(hono@") &&
    path[2] === "dependencies" &&
    path[3] === "hono"
  ) return true;
  if (
    name === "hono" &&
    snapshot.startsWith("@modelcontextprotocol/sdk@1.32.1(") &&
    path[2] === "dependencies" &&
    ["hono", "@hono/node-server"].includes(path[3])
  ) return true;
  return false;
}

function normalizeLockValue(value, path = []) {
  if (Array.isArray(value)) return value.map((item, index) => normalizeLockValue(item, [...path, String(index)]));
  if (value && typeof value === "object") {
    const normalized = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      let nextKey = key;
      for (const item of versions) {
        if (locatorVersion(item.name, item.from).test(nextKey)) {
          assert(isAllowedReferencePath([...path, key], item.name), "Locator ajeno fuera de ruta permitida");
          nextKey = nextKey.replace(locatorVersion(item.name, item.from), `$1${item.name}@${item.to}`);
        }
      }
      assert(!(nextKey in normalized), "Colisión al normalizar claves del lockfile");
      normalized[nextKey] = normalizeLockValue(child, [...path, key]);
    }
    return normalized;
  }
  if (typeof value !== "string") return value;

  const targetPackageRecord =
    path[0] === "packages" &&
    versions.some((item) => path[1]?.startsWith(`${item.name}@`));
  if (targetPackageRecord && path.at(-1) === "integrity") {
    assert(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value), "Integridad no SHA-512 válida en paquete actualizado");
    return "<registry-integrity>";
  }

  let normalized = value;
  for (const item of versions) {
    const embeddedLocator = locatorVersion(item.name, item.from).test(normalized);
    const isExactTargetVersion = normalized === item.from && isAllowedReferencePath(path, item.name);
    if (embeddedLocator || isExactTargetVersion) {
      assert(isAllowedReferencePath(path, item.name), `Referencia ${item.name}@${item.from} fuera de ruta permitida`);
      normalized = normalized.replace(
        locatorVersion(item.name, item.from),
        `$1${item.name}@${item.to}`
      );
      if (isExactTargetVersion) normalized = item.to;
      continue;
    }
    assert(
      !locatorVersion(item.name, item.from).test(normalized) &&
        !(normalized === item.from && isAllowedReferencePath(path, item.name)),
      `Referencia ${item.name}@${item.from} fuera de ruta permitida`
    );
  }
  return normalized;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sortedKeys(left, right) {
  const leftKeys = left && typeof left === "object" ? Object.keys(left) : [];
  const rightKeys = right && typeof right === "object" ? Object.keys(right) : [];
  return [...new Set([...leftKeys, ...rightKeys])].sort();
}

function safeDiagnosticPath(path, before, after) {
  const output = [];
  let left = before;
  let right = after;

  for (let index = 0; index < path.length && index < MAX_DIAGNOSTIC_DEPTH; index += 1) {
    const key = path[index];
    const ordinal = sortedKeys(left, right).indexOf(key) + 1;
    if (index === 0) {
      output.push(["packages", "snapshots", "importers"].includes(key) ? key : `<other-section#${Math.max(ordinal, 1)}>`);
    } else if (index === 1) {
      const section = path[0];
      if ((section === "packages" || section === "snapshots") && KNOWN_DIAGNOSTIC_LOCATORS.has(key)) {
        output.push(key);
      } else {
        const label = section === "importers" ? "importer" : "other-entry";
        output.push(`<${label}#${Math.max(ordinal, 1)}>`);
      }
    } else if (SAFE_DIAGNOSTIC_FIELDS.has(key)) {
      output.push(key);
    } else if (KNOWN_DIAGNOSTIC_PACKAGE_NAMES.has(key)) {
      output.push(key);
    } else {
      const label = path[index - 1] === "dependencies" || path[index - 1] === "peerDependencies"
        ? "dependency"
        : "field";
      output.push(`<${label}#${Math.max(ordinal, 1)}>`);
    }

    left = left && typeof left === "object" ? left[key] : undefined;
    right = right && typeof right === "object" ? right[key] : undefined;
  }

  if (path.length > MAX_DIAGNOSTIC_DEPTH) output.push("<depth-limit>");
  if (path.length === 1 && path[0] === "importers") output.push("<importer#1>");
  return output.join("/") || "<unclassified-path>";
}

function summarizeSemanticDifferences(before, after, rootPath = []) {
  let count = 0;
  let countTruncated = false;
  let depthSkippedCount = 0;
  let depthSkippedTruncated = false;
  const paths = new Set();

  function record(path) {
    if (count === MAX_DIAGNOSTIC_DIFFS) {
      countTruncated = true;
      return;
    }
    count += 1;
    if (paths.size < MAX_DIAGNOSTIC_PATHS) paths.add(safeDiagnosticPath(path, before, after));
  }

  function visit(left, right, path) {
    if (countTruncated || Object.is(left, right)) return;
    if (path.length >= MAX_DIAGNOSTIC_DEPTH) {
      if (depthSkippedCount === MAX_DIAGNOSTIC_DIFFS) depthSkippedTruncated = true;
      else depthSkippedCount += 1;
      return;
    }
    const leftObject = left !== null && typeof left === "object";
    const rightObject = right !== null && typeof right === "object";
    if (!leftObject || !rightObject || Array.isArray(left) !== Array.isArray(right)) {
      record(path);
      return;
    }

    const keys = sortedKeys(left, right);
    if (keys.length === 0) return;
    for (const key of keys) {
      if (countTruncated) return;
      if (!Object.prototype.hasOwnProperty.call(left, key) || !Object.prototype.hasOwnProperty.call(right, key)) {
        record([...path, key]);
      } else {
        visit(left[key], right[key], [...path, key]);
      }
    }
  }

  visit(before, after, rootPath);
  return {
    count: countTruncated ? `${MAX_DIAGNOSTIC_DIFFS}+` : String(count),
    paths: [...paths],
    countTruncated,
    depthSkippedCount: depthSkippedTruncated ? `${MAX_DIAGNOSTIC_DIFFS}+` : String(depthSkippedCount),
  };
}

function semanticDifferenceMessage(before, after, rootPath = []) {
  const summary = summarizeSemanticDifferences(before, after, rootPath);
  const paths = summary.paths.length > 0 ? summary.paths.join(", ") : "<sin-ruta-segura>";
  const suffix = [
    summary.countTruncated ? "; resumen truncado por límite de diferencias" : "",
    summary.depthSkippedCount !== "0"
      ? `; recorrido incompleto por profundidad (subárboles omitidos: ${summary.depthSkippedCount})`
      : "",
  ].join("");
  return `El lockfile contiene cambios semánticos fuera de las dos versiones y sus referencias (${summary.count} diferencias observadas; rutas: ${paths}${suffix})`;
}

function assertPackage(lock, name, version, expectedIntegrity) {
  const key = `${name}@${version}`;
  const entry = lock.packages?.[key];
  assert(entry, `Falta packages.${key}`);
  assert(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.resolution?.integrity ?? ""), `Falta integridad publicada para ${key}`);
  if (expectedIntegrity) {
    assert(entry.resolution.integrity === expectedIntegrity, `Integridad de registro inesperada para ${key}`);
  }
  return key;
}

function assertNoStaleReferences(value, path = [], root = value) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoStaleReferences(item, [...path, String(index)], root));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      for (const item of versions) {
        assert(
          !locatorVersion(item.name, item.from).test(key),
          `Permanece locator antiguo en ${safeDiagnosticPath([...path, key], root, root)}`
        );
      }
      assertNoStaleReferences(child, [...path, key], root);
    }
    return;
  }
  if (typeof value !== "string") return;
  for (const item of versions) {
    assert(!locatorVersion(item.name, item.from).test(value), `Permanece referencia antigua ${item.name}@${item.from}`);
    if (path.at(-1) === item.name && path.includes("dependencies")) {
      assert(value !== item.from, `Permanece dependencia ${item.name}@${item.from} en ${path.join(".")}`);
    }
  }
}

function assertRefreshContract(before, after) {
  for (const item of versions) {
    assertPackage(before, item.name, item.from);
    assertPackage(after, item.name, item.to, item.integrity);
    assert(!after.packages?.[`${item.name}@${item.from}`], `Sigue bloqueado ${item.name}@${item.from}`);
  }

  const axiosSnapshots = Object.entries(after.snapshots ?? {}).filter(
    ([key]) => key.startsWith("axios@")
  );
  assert(axiosSnapshots.length > 0, "No hay snapshots de axios que permitan comprobar follow-redirects");
  for (const [key, snapshot] of axiosSnapshots) {
    assert(
      snapshot.dependencies["follow-redirects"] === "1.16.1",
      `${safeDiagnosticPath(["snapshots", key], after, after)} no resuelve follow-redirects@1.16.1`
    );
  }

  const serverPackage = after.packages?.["@hono/node-server@2.1.1"];
  assert(serverPackage?.peerDependencies?.hono === "^4", "El peer de @hono/node-server ya no declara el rango ^4");
  const honoServerSnapshots = Object.entries(after.snapshots ?? {}).filter(([key]) =>
    key.startsWith("@hono/node-server@2.1.1")
  );
  assert(honoServerSnapshots.length > 0, "No aparece el snapshot de @hono/node-server");
  for (const [key, snapshot] of honoServerSnapshots) {
    assert(key.includes("(hono@4.13.13)"), `${safeDiagnosticPath(["snapshots", key], after, after)} conserva un peer context obsoleto`);
    assert(
      snapshot.dependencies?.hono === "4.13.13",
      `${safeDiagnosticPath(["snapshots", key], after, after)} no resuelve hono@4.13.13`
    );
  }

  const sdkSnapshots = Object.entries(after.snapshots ?? {}).filter(([key]) =>
    key.startsWith("@modelcontextprotocol/sdk@1.32.1(")
  );
  assert(sdkSnapshots.length > 0, "No aparece el snapshot del SDK MCP esperado");
  for (const [key, sdk] of sdkSnapshots) {
    assert(
      sdk.dependencies?.hono === "4.13.13",
      `${safeDiagnosticPath(["snapshots", key], after, after)} no resuelve hono@4.13.13`
    );
    assert(
      Object.keys(sdk.dependencies ?? {}).includes("@hono/node-server") &&
        Object.values(sdk.dependencies).some((value) => String(value).includes("hono@4.13.13")),
      `${safeDiagnosticPath(["snapshots", key], after, after)} no conserva la resolución del peer node-server con hono@4.13.13`
    );
  }
}

function validateLockfileRefresh({ beforeText, afterText, changedFiles }) {
  assert(changedFiles.length === 1 && changedFiles[0] === "pnpm-lock.yaml", "Solo se permite modificar pnpm-lock.yaml");
  const before = yaml.load(beforeText, { schema: yaml.JSON_SCHEMA });
  const after = yaml.load(afterText, { schema: yaml.JSON_SCHEMA });
  if (JSON.stringify(stable(before.importers)) !== JSON.stringify(stable(after.importers))) {
    const beforeWithImporters = { importers: before.importers };
    const afterWithImporters = { importers: after.importers };
    throw new Error(
      `Los importers del lockfile deben permanecer idénticos; ${semanticDifferenceMessage(beforeWithImporters, afterWithImporters)}`
    );
  }
  assertRefreshContract(before, after);
  assertNoStaleReferences(after);
  const normalizedBefore = stable(normalizeLockValue(before));
  const normalizedAfter = stable(normalizeLockValue(after));
  if (JSON.stringify(normalizedBefore) !== JSON.stringify(normalizedAfter)) {
    throw new Error(semanticDifferenceMessage(normalizedBefore, normalizedAfter));
  }
}

function main() {
  const baseSha = process.env.BASE_SHA ?? "";
  assert(/^[0-9a-f]{40}$/.test(baseSha), "BASE_SHA debe ser un SHA completo");
  const status = execGit(["status", "--porcelain", "--untracked-files=normal"]);
  assertExpectedGitStatus(status);
  const changedFiles = execGit(["diff", "--name-only", baseSha, "--"])
    .trim()
    .split("\n")
    .filter(Boolean);
  const beforeText = execGit(["show", `${baseSha}:pnpm-lock.yaml`]);
  const afterText = readFileSync("pnpm-lock.yaml", "utf8");
  validateLockfileRefresh({ beforeText, afterText, changedFiles });
  process.stdout.write("Lockfile validado: solo follow-redirects, hono y referencias de peer autorizadas.\n");
  process.stdout.write(execGit(["diff", "--", "pnpm-lock.yaml"]));
}

module.exports = {
  MAX_GIT_OUTPUT_BYTES,
  MAX_DIAGNOSTIC_DIFFS,
  MAX_DIAGNOSTIC_PATHS,
  MAX_DIAGNOSTIC_DEPTH,
  TARGET_VERSIONS: versions,
  assertGitOutputWithinLimit,
  assertExpectedGitStatus,
  execGit,
  validateLockfileRefresh,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Lockfile refresh rechazado: ${error.message}\n`);
    process.exitCode = 1;
  }
}
