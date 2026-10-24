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
const MAX_DIAGNOSTIC_ROWS = 32;
const MAX_DIAGNOSTIC_BYTES = 16 * 1024;
const MAX_DIAGNOSTIC_LOCATOR_CHARS = 256;
const snapshotDiagnosticAuthorities = new WeakMap();
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

function digest(value) { return sha256(JSON.stringify(stable(value))); }

function validPackageName(value) {
  return typeof value === "string" && value.length <= 128 &&
    /^(?:@[a-z0-9][a-z0-9._-]{0,38}\/)?[a-z0-9][a-z0-9._-]{0,99}$/.test(value);
}

const SEMVER_PREFIX = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)/;

function validLocator(value, peerNames, depth = 0) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_DIAGNOSTIC_LOCATOR_CHARS || depth > 8) return false;
  const version = value.match(SEMVER_PREFIX)?.[0];
  if (!version) return false;
  let offset = version.length;
  while (offset < value.length) {
    if (value[offset] !== "(") return false;
    let nesting = 1;
    let end = offset + 1;
    for (; end < value.length && nesting > 0; end += 1) {
      if (value[end] === "(") nesting += 1;
      else if (value[end] === ")") nesting -= 1;
    }
    if (nesting !== 0) return false;
    const peer = value.slice(offset + 1, end - 1);
    const peerName = [...peerNames].sort((a, b) => b.length - a.length)
      .find((name) => peer.startsWith(`${name}@`));
    if (!peerName || !validLocator(peer.slice(peerName.length + 1), peerNames, depth + 1)) return false;
    offset = end;
  }
  return true;
}

function blockPackageNames(blocks) {
  const names = new Set();
  for (const block of Object.values(blocks)) {
    for (const field of ["dependencies", "optionalDependencies", "devDependencies"]) {
      const map = block?.[field];
      if (map && typeof map === "object" && !Array.isArray(map)) {
        for (const name of Object.keys(map)) if (validPackageName(name)) names.add(name);
      }
    }
    for (const name of Array.isArray(block?.transitivePeerDependencies) ? block.transitivePeerDependencies : []) {
      if (validPackageName(name)) names.add(name);
    }
  }
  return names;
}

function safePackageLabel(name, baselineNames) {
  return baselineNames.has(name) && validPackageName(name) ? name : "<redacted>";
}

function edgeRow(target, field, name, status, baseValue, candidateValue, baselineNames, peerNames) {
  const packageLabel = safePackageLabel(name, baselineNames);
  const row = { target, field, package: packageLabel, status };
  if (packageLabel === "<redacted>") row.keySha256 = sha256(String(name));
  if (field !== "transitivePeerDependencies") {
    const safeValue = (value) => {
      if (value === undefined) return { label: "<missing>" };
      if (validLocator(value, peerNames)) return { label: value };
      return { label: "<redacted>", hash: digest(value) };
    };
    const base = safeValue(baseValue);
    const candidate = safeValue(candidateValue);
    row.base = base.label;
    row.candidate = candidate.label;
    if (base.hash) row.baseSha256 = base.hash;
    if (candidate.hash) row.candidateSha256 = candidate.hash;
  }
  return row;
}

function snapshotDiffRows(base, normalizedBlocks) {
  const rows = [];
  const baseBlocks = Object.fromEntries(SNAPSHOT_TARGETS.map((name) => [name, base.snapshots[BASE_KEYS[name]]]));
  const peerNames = blockPackageNames(baseBlocks);
  for (const target of SNAPSHOT_TARGETS) {
    const before = base.snapshots[BASE_KEYS[target]];
    const after = normalizedBlocks[target];
    const handledFields = new Set();
    for (const field of ["dependencies", "optionalDependencies"]) {
      const beforeMap = before?.[field] && typeof before[field] === "object" ? before[field] : {};
      const afterMap = after?.[field] && typeof after[field] === "object" ? after[field] : {};
      const names = [...new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])].sort();
      for (const name of names) {
        const hasBefore = Object.prototype.hasOwnProperty.call(beforeMap, name);
        const hasAfter = Object.prototype.hasOwnProperty.call(afterMap, name);
        if (hasBefore && hasAfter && same(beforeMap[name], afterMap[name])) continue;
        rows.push(edgeRow(target, field, name, !hasBefore ? "added" : !hasAfter ? "removed" : "changed",
          hasBefore ? beforeMap[name] : undefined, hasAfter ? afterMap[name] : undefined,
          new Set(Object.keys(beforeMap)), peerNames));
      }
      handledFields.add(field);
    }
    const beforePeers = Array.isArray(before?.transitivePeerDependencies) ? before.transitivePeerDependencies : [];
    const afterPeers = Array.isArray(after?.transitivePeerDependencies) ? after.transitivePeerDependencies : [];
    for (const name of [...new Set([...beforePeers, ...afterPeers])].sort()) {
      const hasBefore = beforePeers.includes(name);
      const hasAfter = afterPeers.includes(name);
      if (hasBefore === hasAfter) continue;
      rows.push(edgeRow(target, "transitivePeerDependencies", name, hasBefore ? "removed" : "added",
        undefined, undefined, new Set(beforePeers), peerNames));
    }
    handledFields.add("transitivePeerDependencies");

    const allFields = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    for (const field of allFields) {
      if (handledFields.has(field) || same(before?.[field], after?.[field])) continue;
      const hasBefore = Object.prototype.hasOwnProperty.call(before || {}, field);
      const hasAfter = Object.prototype.hasOwnProperty.call(after || {}, field);
      rows.push({
        target,
        field: SNAPSHOT_DIAGNOSTIC_FIELDS.has(field) ? field : "<unknown>",
        status: !hasBefore || !hasAfter ? "missing" : "different",
        baseSha256: hasBefore ? digest(before[field]) : digest("<missing>"),
        candidateSha256: hasAfter ? digest(after[field]) : digest("<missing>"),
      });
    }
  }
  return { rows, baseBlocks, peerNames };
}

function throwSnapshotDiagnostic(base, normalizedBlocks) {
  const { rows: allRows, baseBlocks, peerNames } = snapshotDiffRows(base, normalizedBlocks);
  const diagnostic = { total: allRows.length, truncated: false, rows: [] };
  for (const row of allRows) {
    if (diagnostic.rows.length >= MAX_DIAGNOSTIC_ROWS) { diagnostic.truncated = true; break; }
    diagnostic.rows.push(row);
    if (Buffer.byteLength(JSON.stringify(diagnostic), "utf8") > MAX_DIAGNOSTIC_BYTES) {
      diagnostic.rows.pop();
      diagnostic.truncated = true;
      break;
    }
  }
  diagnostic.truncated ||= diagnostic.rows.length < diagnostic.total;
  const error = new ViteProjectionFailure("LOCK_SNAPSHOT", diagnostic);
  const packageAllowlist = Object.fromEntries(SNAPSHOT_TARGETS.map((target) => [target, {
    dependencies: new Set(Object.keys(baseBlocks[target]?.dependencies || {})),
    optionalDependencies: new Set(Object.keys(baseBlocks[target]?.optionalDependencies || {})),
    transitivePeerDependencies: new Set(Array.isArray(baseBlocks[target]?.transitivePeerDependencies)
      ? baseBlocks[target].transitivePeerDependencies : []),
  }]));
  snapshotDiagnosticAuthorities.set(error, { diagnostic, packageAllowlist, peerNames });
  throw error;
}

function validateSnapshotDiagnostic(error) {
  const authority = error && snapshotDiagnosticAuthorities.get(error);
  if (!(error instanceof ViteProjectionFailure) || error.code !== "LOCK_SNAPSHOT" || !authority) return false;
  const diagnostic = error.diagnostic;
  if (diagnostic !== authority.diagnostic) return false;
  if (Object.keys(diagnostic).sort().join(",") !== "rows,total,truncated") return false;
  if (!Number.isSafeInteger(diagnostic.total) || diagnostic.total < 1 || diagnostic.total > 1000000) return false;
  if (!Array.isArray(diagnostic.rows) || diagnostic.rows.length > MAX_DIAGNOSTIC_ROWS) return false;
  if (diagnostic.total < diagnostic.rows.length || diagnostic.truncated !== (diagnostic.total > diagnostic.rows.length)) return false;
  if (Buffer.byteLength(JSON.stringify(diagnostic), "utf8") > MAX_DIAGNOSTIC_BYTES) return false;
  const hashPattern = /^[a-f0-9]{64}$/;
  const exactKeys = (object, allowed) => Object.keys(object).every((key) => allowed.includes(key));
  const targets = new Set(SNAPSHOT_TARGETS);
  for (const row of diagnostic.rows) {
    if (!row || typeof row !== "object" || !targets.has(row.target)) return false;
    if (row.field === "dependencies" || row.field === "optionalDependencies") {
      if (!exactKeys(row, ["target", "field", "package", "status", "keySha256", "base", "candidate", "baseSha256", "candidateSha256"])) return false;
      if (!["added", "removed", "changed"].includes(row.status)) return false;
      const allowedNames = authority.packageAllowlist[row.target][row.field];
      const isRedacted = row.package === "<redacted>";
      if (isRedacted ? !hashPattern.test(row.keySha256 || "") : !allowedNames.has(row.package) || !validPackageName(row.package)) return false;
      if (!isRedacted && Object.prototype.hasOwnProperty.call(row, "keySha256")) return false;
      const safeValue = (value, hash) => {
        if (value === "<missing>") return hash === undefined;
        if (value === "<redacted>") return hashPattern.test(hash || "");
        return validLocator(value, authority.peerNames) && hash === undefined;
      };
      if (!safeValue(row.base, row.baseSha256) || !safeValue(row.candidate, row.candidateSha256)) return false;
      if (row.status === "added" && row.base !== "<missing>") return false;
      if (row.status === "removed" && row.candidate !== "<missing>") return false;
      if (row.status === "changed" && (row.base === "<missing>" || row.candidate === "<missing>")) return false;
      continue;
    }
    if (row.field === "transitivePeerDependencies") {
      if (!exactKeys(row, ["target", "field", "package", "status", "keySha256"])) return false;
      if (row.status !== "added" && row.status !== "removed") return false;
      const allowedNames = authority.packageAllowlist[row.target].transitivePeerDependencies;
      const isRedacted = row.package === "<redacted>";
      if (isRedacted ? !hashPattern.test(row.keySha256 || "") : !allowedNames.has(row.package) || !validPackageName(row.package)) return false;
      if (!isRedacted && Object.prototype.hasOwnProperty.call(row, "keySha256")) return false;
      continue;
    }
    if (!exactKeys(row, ["target", "field", "status", "baseSha256", "candidateSha256"])) return false;
    if (!SNAPSHOT_DIAGNOSTIC_FIELDS.has(row.field) && row.field !== "<unknown>") return false;
    if (row.status !== "missing" && row.status !== "different") return false;
    if (row.baseSha256 !== undefined && !hashPattern.test(row.baseSha256)) return false;
    if (row.candidateSha256 !== undefined && !hashPattern.test(row.candidateSha256)) return false;
    if (row.status === "different" && (!row.baseSha256 || !row.candidateSha256)) return false;
    if (row.status === "missing" && (!row.baseSha256 || !row.candidateSha256)) return false;
  }
  return true;
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
      fail("LOCK_SNAPSHOT");
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
  if (SNAPSHOT_TARGETS.some((name) => !same(normalizedBlocks[name], base.snapshots[BASE_KEYS[name]]))) {
    throwSnapshotDiagnostic(base, normalizedBlocks);
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
  MAX_DIAGNOSTIC_ROWS,
  MAX_DIAGNOSTIC_BYTES,
  validateSnapshotDiagnostic,
  ViteProjectionFailure,
  assertManifestEquivalentToBase,
  assertCandidateEquivalentToBase,
  projectViteLockfileCore,
  sha256,
};
