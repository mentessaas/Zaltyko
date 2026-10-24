"use strict";

const { createHash } = require("node:crypto");
const {
  entryBlock,
  parseLockfile,
  assertSupportedTextFormat,
  assertSectionOrder,
} = require("./project-targeted-lockfile-refresh.cjs");

const OLD = "6.4.3";
const NEXT = "6.4.5";
const INTEGRITY = "sha512-4enwjFfi4IwtEh0w+jPzpLVOFQiPHmmzPxcHXQOyEur47o6u0jE573DmGpjA+7irXoMLYRZD5ZaFUEneS3abPg==";
const PEER_CONTEXT = "@types/node@20.19.43)(jiti@1.21.7)(terser@5.51.2)(tsx@4.23.13";
const OLD_CONTEXT = `${OLD}(${PEER_CONTEXT})`;
const NEXT_CONTEXT = `${NEXT}(${PEER_CONTEXT})`;
const OLD_LOCATOR = `vite@${OLD_CONTEXT}`;
const NEXT_LOCATOR = `vite@${NEXT_CONTEXT}`;
const OLD_PACKAGE = `vite@${OLD}`;
const NEXT_PACKAGE = `vite@${NEXT}`;
const COVERAGE_KEY = "@vitest/coverage-v8@4.1.11(vitest@4.1.11)";

function snapshotKeys(context) {
  const locator = `vite@${context}`;
  return {
    vite: `vite@${context}`,
    react: `@vitejs/plugin-react@5.2.0(${locator})`,
    mocker: `@vitest/mocker@4.1.11(${locator})`,
    paths: `vite-tsconfig-paths@5.1.4(typescript@5.9.3)(${locator})`,
    vitest: `vitest@4.1.11(@opentelemetry/api@1.9.1)(@types/node@20.19.43)(@vitest/coverage-v8@4.1.11)(jsdom@29.1.1)(${locator})`,
    coverage: COVERAGE_KEY,
  };
}

const BASE_KEYS = snapshotKeys(OLD_CONTEXT);
const RAW_KEYS = snapshotKeys(NEXT_CONTEXT);
const SNAPSHOT_TARGETS = ["vite", "react", "mocker", "paths", "vitest", "coverage"];
const SNAPSHOT_DIAGNOSTIC_KEYS = Object.fromEntries(SNAPSHOT_TARGETS.map((name) => [name, RAW_KEYS[name]]));
const SNAPSHOT_DIAGNOSTIC_FIELDS = new Set([
  "dependencies", "optionalDependencies", "transitivePeerDependencies",
  "peerDependencies", "peerDependenciesMeta", "engines", "hasBin",
]);
const FAILURE_CODES = new Set([
  "INPUT", "MANIFEST_JSON", "MANIFEST_DUPLICATE_KEY", "MANIFEST_PIN",
  "MANIFEST_SCOPE", "LOCK_FORMAT", "LOCK_TARGET_SET", "LOCK_REFERENCE",
  "LOCK_METADATA", "LOCK_IMPORTER", "LOCK_SNAPSHOT", "LOCK_OFFSCOPE",
]);

class ViteProjectionFailure extends Error {
  constructor(code, diagnostic) {
    const safe = FAILURE_CODES.has(code) ? code : "INPUT";
    super(safe);
    this.name = "ViteProjectionFailure";
    this.code = safe;
    if (safe === "LOCK_SNAPSHOT" && diagnostic) this.diagnostic = diagnostic;
  }
}

function fail(code) { throw new ViteProjectionFailure(code); }
function check(condition, code) { if (!condition) fail(code); }
function sha256(text) { return createHash("sha256").update(text, "utf8").digest("hex"); }
function clone(value) { return structuredClone(value); }

function snapshotDiagnostic(name, status, baseBlock, candidateBlock) {
  const fields = [...new Set([
    ...Object.keys(baseBlock || {}),
    ...Object.keys(candidateBlock || {}),
  ])].filter((field) => !same(baseBlock?.[field], candidateBlock?.[field])).sort();
  const field = fields.find((item) => SNAPSHOT_DIAGNOSTIC_FIELDS.has(item)) || "<unknown>";
  const hashBlock = (block) => block === undefined
    ? undefined
    : sha256(JSON.stringify(stable(block)));
  return new ViteProjectionFailure("LOCK_SNAPSHOT", {
    target: name,
    key: SNAPSHOT_DIAGNOSTIC_KEYS[name],
    status,
    field,
    baseSha256: hashBlock(baseBlock),
    candidateSha256: hashBlock(candidateBlock),
  });
}

function failSnapshot(name, status, baseBlock, candidateBlock) {
  throw snapshotDiagnostic(name, status, baseBlock, candidateBlock);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
function same(a, b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }

function parseJsonStrict(text) {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i += 1; };

  function readString() {
    const start = i;
    check(text[i++] === '"', "MANIFEST_JSON");
    while (i < text.length) {
      if (text[i] === "\\") i += 2;
      else if (text[i++] === '"') {
        try { return JSON.parse(text.slice(start, i)); }
        catch { fail("MANIFEST_JSON"); }
      }
    }
    fail("MANIFEST_JSON");
  }

  function readValue() {
    ws();
    if (text[i] === "{") {
      i += 1;
      ws();
      const keys = new Set();
      if (text[i] === "}") { i += 1; return; }
      while (i < text.length) {
        ws();
        const key = readString();
        check(!keys.has(key), "MANIFEST_DUPLICATE_KEY");
        keys.add(key);
        ws();
        check(text[i++] === ":", "MANIFEST_JSON");
        readValue();
        ws();
        if (text[i] === "}") { i += 1; return; }
        check(text[i++] === ",", "MANIFEST_JSON");
      }
      fail("MANIFEST_JSON");
    }
    if (text[i] === "[") {
      i += 1;
      ws();
      if (text[i] === "]") { i += 1; return; }
      while (i < text.length) {
        readValue();
        ws();
        if (text[i] === "]") { i += 1; return; }
        check(text[i++] === ",", "MANIFEST_JSON");
      }
      fail("MANIFEST_JSON");
    }
    if (text[i] === '"') { readString(); return; }
    const literal = text.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    check(literal, "MANIFEST_JSON");
    i += literal[0].length;
  }

  try {
    readValue();
    ws();
    check(i === text.length, "MANIFEST_JSON");
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ViteProjectionFailure) throw error;
    fail("MANIFEST_JSON");
  }
}

function parseLock(text) {
  try {
    assertSupportedTextFormat(text);
    assertSectionOrder(text);
    return parseLockfile(text);
  } catch (error) {
    if (error instanceof ViteProjectionFailure) throw error;
    fail("LOCK_FORMAT");
  }
}

function own(object, key, code) {
  check(object && Object.prototype.hasOwnProperty.call(object, key), code);
  return object[key];
}
function importer(lock) { return own(lock.importers, ".", "LOCK_IMPORTER"); }

function packageVite(lock, version) {
  const keys = Object.keys(lock.packages).filter((key) => key.startsWith("vite@"));
  check(keys.length === 1 && keys[0] === `vite@${version}`, "LOCK_TARGET_SET");
  return lock.packages[keys[0]];
}

function collectViteReferences(lock) {
  const references = [];
  const locatorPattern = /\bvite@\d+\.\d+\.\d+(?=[()])/;
  function walk(value, path) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      if (locatorPattern.test(key)) references.push(`${path.join("/")}/@key:${key}`);
      if (typeof child === "string") {
        if (locatorPattern.test(child)) references.push(`${childPath.join("/")}`);
        const parent = path[path.length - 1];
        const dependencyMap = ["dependencies", "optionalDependencies", "devDependencies"].includes(parent);
        if (dependencyMap && key === "vite") references.push(`${childPath.join("/")}`);
        if (path.join("/") === "importers/./devDependencies/vite" && key === "version") {
          references.push(`${childPath.join("/")}`);
        }
      }
      walk(child, childPath);
    }
  }
  walk(lock, []);
  return [...new Set(references)].sort();
}

function expectedReferencePaths(keys, version) {
  return [
    `snapshots/@key:${keys.vite}`,
    `snapshots/@key:${keys.react}`,
    `snapshots/@key:${keys.mocker}`,
    `snapshots/@key:${keys.paths}`,
    `snapshots/@key:${keys.vitest}`,
    "importers/./devDependencies/@vitejs/plugin-react/version",
    "importers/./devDependencies/vite/version",
    "importers/./devDependencies/vite-tsconfig-paths/version",
    "importers/./devDependencies/vitest/version",
    `snapshots/${keys.react}/dependencies/vite`,
    `snapshots/${keys.mocker}/optionalDependencies/vite`,
    `snapshots/${keys.paths}/optionalDependencies/vite`,
    `snapshots/${keys.vitest}/dependencies/vite`,
    `snapshots/${keys.vitest}/dependencies/@vitest/mocker`,
    `snapshots/${keys.coverage}/dependencies/vitest`,
  ].sort();
}

function assertViteReferenceInventory(lock, keys, version) {
  check(same(collectViteReferences(lock), expectedReferencePaths(keys, version)), "LOCK_REFERENCE");
}

function assertImporterContract(base, candidate) {
  const baseDev = own(importer(base), "devDependencies", "LOCK_IMPORTER");
  const nextDev = own(importer(candidate), "devDependencies", "LOCK_IMPORTER");
  const baseVitest = BASE_KEYS.vitest.slice("vitest@".length);
  const nextVitest = RAW_KEYS.vitest.slice("vitest@".length);
  const approved = [
    ["@vitejs/plugin-react", "version", `5.2.0(${OLD_LOCATOR})`, `5.2.0(${NEXT_LOCATOR})`],
    ["vite", "version", OLD_CONTEXT, NEXT_CONTEXT],
    ["vite", "specifier", OLD, NEXT],
    ["vite-tsconfig-paths", "version", `5.1.4(typescript@5.9.3)(${OLD_LOCATOR})`, `5.1.4(typescript@5.9.3)(${NEXT_LOCATOR})`],
    ["vitest", "version", baseVitest, nextVitest],
  ];
  const normalizedImporters = clone(candidate.importers);
  const normalizedDev = normalizedImporters["."]?.devDependencies;
  check(normalizedDev, "LOCK_IMPORTER");
  for (const [name, field, before, after] of approved) {
    check(baseDev[name]?.[field] === before, "LOCK_IMPORTER");
    check(nextDev[name]?.[field] === after, "LOCK_IMPORTER");
    normalizedDev[name][field] = before;
  }
  check(same(normalizedImporters, base.importers), "LOCK_IMPORTER");
}

function normalizedSnapshotBlocks(candidate, keys) {
  const rawBlocks = {};
  for (const name of SNAPSHOT_TARGETS) {
    const candidateKey = keys[name];
    if (!candidate.snapshots || !Object.prototype.hasOwnProperty.call(candidate.snapshots, candidateKey)) {
      failSnapshot(name, "missing", undefined, undefined);
    }
    rawBlocks[name] = clone(candidate.snapshots[candidateKey]);
  }

  const react = rawBlocks.react;
  const mocker = rawBlocks.mocker;
  const paths = rawBlocks.paths;
  const vitest = rawBlocks.vitest;
  const coverage = rawBlocks.coverage;
  check(react.dependencies?.vite === NEXT_CONTEXT, "LOCK_REFERENCE");
  check(mocker.optionalDependencies?.vite === NEXT_CONTEXT, "LOCK_REFERENCE");
  check(paths.optionalDependencies?.vite === NEXT_CONTEXT, "LOCK_REFERENCE");
  check(vitest.dependencies?.vite === NEXT_CONTEXT, "LOCK_REFERENCE");
  check(vitest.dependencies?.["@vitest/mocker"] === `4.1.11(vite@${NEXT_CONTEXT})`, "LOCK_REFERENCE");

  const baseVitest = BASE_KEYS.vitest.slice("vitest@".length);
  const nextVitest = RAW_KEYS.vitest.slice("vitest@".length);
  check(coverage.dependencies?.vitest === nextVitest, "LOCK_REFERENCE");

  react.dependencies.vite = OLD_CONTEXT;
  mocker.optionalDependencies.vite = OLD_CONTEXT;
  paths.optionalDependencies.vite = OLD_CONTEXT;
  vitest.dependencies.vite = OLD_CONTEXT;
  vitest.dependencies["@vitest/mocker"] = `4.1.11(vite@${OLD_CONTEXT})`;
  coverage.dependencies.vitest = baseVitest;
  return rawBlocks;
}

function assertSnapshotBlocks(base, raw) {
  const normalizedBlocks = normalizedSnapshotBlocks(raw, RAW_KEYS);
  for (const name of SNAPSHOT_TARGETS) {
    const baseBlock = base.snapshots[BASE_KEYS[name]];
    const candidateBlock = normalizedBlocks[name];
    if (!same(candidateBlock, baseBlock)) {
      const missingField = Object.keys(baseBlock || {}).some((field) =>
        !Object.prototype.hasOwnProperty.call(candidateBlock || {}, field),
      );
      failSnapshot(name, missingField ? "missing" : "different", baseBlock, candidateBlock);
    }
  }
}

function assertPackageBlock(base, candidate) {
  const original = packageVite(base, OLD);
  const updated = packageVite(candidate, NEXT);
  check(updated.resolution?.integrity === INTEGRITY, "LOCK_METADATA");
  const expected = clone(original);
  expected.resolution.integrity = INTEGRITY;
  check(same(updated, expected), "LOCK_METADATA");
}

function assertCandidateEquivalentToBase(baseText, candidateText) {
  const base = parseLock(baseText);
  const candidate = parseLock(candidateText);
  packageVite(candidate, NEXT);
  assertViteReferenceInventory(candidate, RAW_KEYS, NEXT);
  assertImporterContract(base, candidate);
  assertPackageBlock(base, candidate);
  const normalized = clone(candidate);

  const packageValue = normalized.packages[NEXT_PACKAGE];
  delete normalized.packages[NEXT_PACKAGE];
  normalized.packages[OLD_PACKAGE] = packageValue;
  normalized.packages[OLD_PACKAGE].resolution.integrity = base.packages[OLD_PACKAGE].resolution.integrity;

  const normalizedSnapshots = clone(normalized.snapshots);
  for (const name of SNAPSHOT_TARGETS) {
    const from = RAW_KEYS[name];
    const to = BASE_KEYS[name];
    if (from !== to) {
      check(!Object.prototype.hasOwnProperty.call(normalizedSnapshots, to), "LOCK_SNAPSHOT");
      normalizedSnapshots[to] = normalizedSnapshots[from];
      delete normalizedSnapshots[from];
    }
  }
  const refs = normalizedSnapshotBlocks(candidate, RAW_KEYS);
  for (const name of SNAPSHOT_TARGETS) normalizedSnapshots[BASE_KEYS[name]] = refs[name];
  normalized.snapshots = normalizedSnapshots;

  const root = normalized.importers["."].devDependencies;
  const baseRoot = base.importers["."].devDependencies;
  for (const [name, field] of [
    ["@vitejs/plugin-react", "version"], ["vite", "version"], ["vite", "specifier"],
    ["vite-tsconfig-paths", "version"], ["vitest", "version"],
  ]) root[name][field] = baseRoot[name][field];
  check(same(normalized, base), "LOCK_OFFSCOPE");
  return true;
}

function replaceImporterField(block, name, field, before, after) {
  const devHeader = "    devDependencies:\n";
  const devStart = block.indexOf(devHeader);
  check(devStart >= 0 && block.indexOf(devHeader, devStart + devHeader.length) < 0, "LOCK_IMPORTER");
  const contentStart = devStart + devHeader.length;
  const afterDev = block.slice(contentStart).search(/^    \S.*:\n/m);
  const contentEnd = afterDev < 0 ? block.length : contentStart + afterDev;
  const devText = block.slice(contentStart, contentEnd);
  const header = name.startsWith("@") ? `      '${name}':\n` : `      ${name}:\n`;
  const entryStart = devText.indexOf(header);
  check(entryStart >= 0 && devText.indexOf(header, entryStart + header.length) < 0, "LOCK_IMPORTER");
  const entryContentStart = entryStart + header.length;
  const nextEntry = devText.slice(entryContentStart).search(/^      \S.*:\n/m);
  const entryEnd = nextEntry < 0 ? devText.length : entryContentStart + nextEntry;
  const entry = devText.slice(entryStart, entryEnd);
  const oldLine = `        ${field}: ${before}\n`;
  check(entry.split(oldLine).length === 2, "LOCK_IMPORTER");
  const changed = entry.replace(oldLine, `        ${field}: ${after}\n`);
  return block.slice(0, contentStart + entryStart) + changed + block.slice(contentStart + entryEnd);
}

function projectImporterBlock(baseText, base, raw) {
  const baseBlock = entryBlock(baseText, "importers", ".", base).text;
  let block = baseBlock;
  const before = importer(base).devDependencies;
  const after = importer(raw).devDependencies;
  block = replaceImporterField(block, "vite", "specifier", before.vite.specifier, after.vite.specifier);
  for (const name of ["@vitejs/plugin-react", "vite", "vite-tsconfig-paths", "vitest"]) {
    block = replaceImporterField(block, name, "version", before[name].version, after[name].version);
  }
  return block;
}

function replaceEntryBlock(text, section, fromKey, replacement, parsed) {
  const target = entryBlock(text, section, fromKey, parsed);
  return text.slice(0, target.start) + replacement + text.slice(target.end);
}

function projectLockfile(baseText, rawText, base, raw) {
  let candidate = baseText;
  const packageRaw = entryBlock(rawText, "packages", NEXT_PACKAGE, raw).text;
  candidate = replaceEntryBlock(candidate, "packages", OLD_PACKAGE, packageRaw, base);

  // Re-parse after each replacement because offsets and section key sets changed.
  for (const name of SNAPSHOT_TARGETS) {
    const current = parseLockfile(candidate);
    const fromKey = BASE_KEYS[name];
    const rawKey = RAW_KEYS[name];
    const block = entryBlock(rawText, "snapshots", rawKey, raw).text;
    candidate = replaceEntryBlock(candidate, "snapshots", fromKey, block, current);
  }

  const current = parseLockfile(candidate);
  const importerEntry = entryBlock(candidate, "importers", ".", current);
  const importerBlock = projectImporterBlock(baseText, base, raw);
  candidate = candidate.slice(0, importerEntry.start) + importerBlock + candidate.slice(importerEntry.end);
  const projected = parseLock(candidate);
  assertViteReferenceInventory(projected, RAW_KEYS, NEXT);
  assertCandidateEquivalentToBase(baseText, candidate);
  return candidate;
}

function projectManifest(baseText, rawText) {
  const base = parseJsonStrict(baseText);
  const raw = parseJsonStrict(rawText);
  check(base.devDependencies?.vite === OLD && raw.devDependencies?.vite === NEXT, "MANIFEST_PIN");
  const expected = clone(base);
  expected.devDependencies.vite = NEXT;
  check(same(raw, expected), "MANIFEST_SCOPE");
  const pin = /^([ \t]*"vite"[ \t]*:[ \t]*)"6\.4\.3"([ \t]*,?[ \t]*)$/gm;
  check([...baseText.matchAll(pin)].length === 1, "MANIFEST_PIN");
  const projected = baseText.replace(pin, (_match, prefix, suffix) => `${prefix}"6.4.5"${suffix}`);
  check(same(parseJsonStrict(projected), expected), "MANIFEST_SCOPE");
  return projected;
}

function assertManifestEquivalentToBase(baseText, candidateText) {
  check(projectManifest(baseText, candidateText) === candidateText, "MANIFEST_SCOPE");
  return true;
}

function projectViteLockfileCore(input) {
  try {
    const { baseManifestText, rawManifestText, baseLockfileText, rawLockfileText } = input;
    check([baseManifestText, rawManifestText, baseLockfileText, rawLockfileText].every((x) => typeof x === "string"), "INPUT");
    const base = parseLock(baseLockfileText);
    const raw = parseLock(rawLockfileText);

    packageVite(base, OLD);
    packageVite(raw, NEXT);
    assertViteReferenceInventory(base, BASE_KEYS, OLD);
    assertViteReferenceInventory(raw, RAW_KEYS, NEXT);
    assertImporterContract(base, raw);
    assertPackageBlock(base, raw);
    assertSnapshotBlocks(base, raw);

    const manifestText = projectManifest(baseManifestText, rawManifestText);
    const lockfileText = projectLockfile(baseLockfileText, rawLockfileText, base, raw);
    return {
      manifestText,
      lockfileText,
      hashes: {
        baseManifestSha256: sha256(baseManifestText),
        rawManifestSha256: sha256(rawManifestText),
        projectedManifestSha256: sha256(manifestText),
        baseLockfileSha256: sha256(baseLockfileText),
        rawLockfileSha256: sha256(rawLockfileText),
        projectedLockfileSha256: sha256(lockfileText),
      },
    };
  } catch (error) {
    if (error instanceof ViteProjectionFailure) throw error;
    throw new ViteProjectionFailure("INPUT");
  }
}

module.exports = {
  OLD,
  NEXT,
  INTEGRITY,
  SNAPSHOT_DIAGNOSTIC_KEYS,
  SNAPSHOT_DIAGNOSTIC_FIELDS: [...SNAPSHOT_DIAGNOSTIC_FIELDS],
  ViteProjectionFailure,
  assertManifestEquivalentToBase,
  assertCandidateEquivalentToBase,
  projectViteLockfileCore,
  sha256,
};
