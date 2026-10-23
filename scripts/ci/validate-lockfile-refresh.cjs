#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const yaml = require("js-yaml");

const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;

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
    to: "4.13.11",
    integrity: "sha512-/SMX/RQNJn7oNmFwH6DtwDqcrzZU2otm1FD6OJe2cWF6cfy/F8hq0XVBv7xW3FTJshRQwuBnXHDq2kNsdZnshg==",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertGitOutputWithinLimit(output) {
  const bytes = Buffer.byteLength(output);
  assert(bytes <= MAX_GIT_OUTPUT_BYTES, `Salida Git excede el límite de ${MAX_GIT_OUTPUT_BYTES} bytes`);
  return output;
}

function execGit(args, run = execFileSync) {
  const output = run("git", args, {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  return assertGitOutputWithinLimit(output);
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
    const normalized = {};
    for (const [key, child] of Object.entries(value)) {
      let nextKey = key;
      for (const item of versions) {
        if (locatorVersion(item.name, item.from).test(nextKey)) {
          assert(isAllowedReferencePath([...path, key], item.name), `Locator ${key} fuera de ruta permitida`);
          nextKey = nextKey.replace(locatorVersion(item.name, item.from), `$1${item.name}@${item.to}`);
        }
      }
      assert(!(nextKey in normalized), `Colisión al normalizar la clave ${nextKey}`);
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

function assertNoStaleReferences(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoStaleReferences(item, [...path, String(index)]));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      for (const item of versions) {
        assert(!locatorVersion(item.name, item.from).test(key), `Permanece locator antiguo ${key}`);
      }
      assertNoStaleReferences(child, [...path, key]);
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
    assert(snapshot.dependencies["follow-redirects"] === "1.16.1", `${key} no resuelve follow-redirects@1.16.1`);
  }

  const serverPackage = after.packages?.["@hono/node-server@2.1.1"];
  assert(serverPackage?.peerDependencies?.hono === "^4", "El peer de @hono/node-server ya no declara el rango ^4");
  const honoServerSnapshots = Object.entries(after.snapshots ?? {}).filter(([key]) =>
    key.startsWith("@hono/node-server@2.1.1")
  );
  assert(honoServerSnapshots.length > 0, "No aparece el snapshot de @hono/node-server");
  for (const [key, snapshot] of honoServerSnapshots) {
    assert(key.includes("(hono@4.13.11)"), `${key} conserva un peer context obsoleto`);
    assert(snapshot.dependencies?.hono === "4.13.11", `${key} no resuelve hono@4.13.11`);
  }

  const sdkSnapshots = Object.entries(after.snapshots ?? {}).filter(([key]) =>
    key.startsWith("@modelcontextprotocol/sdk@1.32.1(")
  );
  assert(sdkSnapshots.length > 0, "No aparece el snapshot del SDK MCP esperado");
  for (const [key, sdk] of sdkSnapshots) {
    assert(sdk.dependencies?.hono === "4.13.11", `${key} no resuelve hono@4.13.11`);
    assert(
      Object.keys(sdk.dependencies ?? {}).includes("@hono/node-server") &&
        Object.values(sdk.dependencies).some((value) => String(value).includes("hono@4.13.11")),
      `${key} no conserva la resolución del peer node-server con hono@4.13.11`
    );
  }
}

function validateLockfileRefresh({ beforeText, afterText, changedFiles }) {
  assert(changedFiles.length === 1 && changedFiles[0] === "pnpm-lock.yaml", "Solo se permite modificar pnpm-lock.yaml");
  const before = yaml.load(beforeText, { schema: yaml.JSON_SCHEMA });
  const after = yaml.load(afterText, { schema: yaml.JSON_SCHEMA });
  assert(
    JSON.stringify(stable(before.importers)) === JSON.stringify(stable(after.importers)),
    "Los importers del lockfile deben permanecer idénticos"
  );
  assertRefreshContract(before, after);
  assertNoStaleReferences(after);
  assert(
    JSON.stringify(stable(normalizeLockValue(before))) ===
      JSON.stringify(stable(normalizeLockValue(after))),
    "El lockfile contiene cambios semánticos fuera de las dos versiones y sus referencias"
  );
}

function main() {
  const baseSha = process.env.BASE_SHA ?? "";
  assert(/^[0-9a-f]{40}$/.test(baseSha), "BASE_SHA debe ser un SHA completo");
  const status = execGit(["status", "--porcelain", "--untracked-files=all"])
    .split("\n")
    .filter(Boolean);
  assert(
    status.length === 1 && /^(?: M |M  )pnpm-lock\.yaml$/.test(status[0]),
    "El checkout contiene cambios fuera del lockfile"
  );
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
  TARGET_VERSIONS: versions,
  assertGitOutputWithinLimit,
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
