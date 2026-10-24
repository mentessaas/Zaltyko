#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { appendFileSync, readFileSync, writeFileSync } = require("node:fs");
const yaml = require("js-yaml");
const lockfileGuard = require("./validate-lockfile-refresh.cjs");
const { MAX_GIT_OUTPUT_BYTES, TARGET_VERSIONS: TARGETS, validateLockfileRefresh } = lockfileGuard;

const LOCKFILE_PATH = "pnpm-lock.yaml";
const SECTIONS = ["importers", "packages", "snapshots"];
const BLOCKS = [
  { section: "packages", baseKey: "follow-redirects@1.16.0", rawKey: "follow-redirects@1.16.1" },
  { section: "packages", baseKey: "hono@4.13.7", rawKey: "hono@4.13.13" },
  { section: "snapshots", baseKey: "follow-redirects@1.16.0", rawKey: "follow-redirects@1.16.1" },
  { section: "snapshots", baseKey: "hono@4.13.7", rawKey: "hono@4.13.13" },
  { section: "snapshots", baseKey: "axios@1.20.0", rawKey: "axios@1.20.0" },
  {
    section: "snapshots",
    baseKey: "@modelcontextprotocol/sdk@1.32.1(zod@3.25.76)",
    rawKey: "@modelcontextprotocol/sdk@1.32.1(zod@3.25.76)",
  },
  {
    section: "snapshots",
    baseKey: "@hono/node-server@2.1.1(hono@4.13.7)",
    rawKey: "@hono/node-server@2.1.1(hono@4.13.13)",
  },
];
const EXPECTED_PARENT_SNAPSHOTS = [
  "axios@1.20.0",
  "@hono/node-server@2.1.1(hono@4.13.13)",
  "@modelcontextprotocol/sdk@1.32.1(zod@3.25.76)",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function parseLockfile(text) {
  try {
    const lock = yaml.load(text, { schema: yaml.JSON_SCHEMA });
    assert(lock && typeof lock === "object" && !Array.isArray(lock), "Raíz YAML inválida");
    assert(lock.lockfileVersion === "9.0", "Versión de lockfile no admitida");
    for (const section of SECTIONS) {
      assert(lock[section] && typeof lock[section] === "object" && !Array.isArray(lock[section]), "Sección requerida ausente");
    }
    return lock;
  } catch {
    throw new Error("Lockfile YAML inválido o fuera del formato admitido");
  }
}

function assertSupportedTextFormat(text) {
  assert(text.endsWith("\n") && !text.includes("\r") && !text.includes("\t"), "Formato de lockfile no admitido");
  assert(text.startsWith("lockfileVersion: '9.0'\n"), "Cabecera de lockfile no admitida");
}

function assertSectionOrder(text) {
  const lines = lineRanges(text);
  const positions = SECTIONS.map((section) => {
    const matches = lines.filter((line) => line.text === section + ":\n");
    assert(matches.length === 1, "Sección duplicada o ausente");
    return matches[0].start;
  });
  assert(positions.every((position, index) => index === 0 || positions[index - 1] < position), "Orden de secciones no admitido");
}

function lineRanges(text) {
  const lines = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline === -1 ? text.length : newline + 1;
    lines.push({ start, end, text: text.slice(start, end) });
    start = end;
  }
  return lines;
}

function parseEntryHeader(line) {
  const match = line.match(/^  (.+):(?: \{\})?\n$/);
  assert(match, "Cabecera de entrada fuera del formato admitido");
  try {
    const parsed = yaml.load(match[1] + ": null\n", { schema: yaml.JSON_SCHEMA });
    const keys = parsed && typeof parsed === "object" ? Object.keys(parsed) : [];
    assert(keys.length === 1, "Cabecera de entrada ambigua");
    return keys[0];
  } catch {
    throw new Error("Cabecera de entrada inválida o ambigua");
  }
}

function sectionIndex(text, section, parsedLock) {
  const lines = lineRanges(text);
  const sectionHeaders = lines
    .map((line, index) => ({ ...line, index }))
    .filter((line) => line.text === section + ":\n");
  assert(sectionHeaders.length === 1, "Sección duplicada o ausente");
  const sectionHeader = sectionHeaders[0];
  let end = text.length;
  let endIndex = lines.length;
  for (let index = sectionHeader.index + 1; index < lines.length; index += 1) {
    const raw = lines[index].text;
    if (!raw.startsWith(" ") && raw.trim() !== "") {
      end = lines[index].start;
      endIndex = index;
      break;
    }
  }

  const entries = [];
  const seen = new Set();
  for (let index = sectionHeader.index + 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (!/^  \S.*:(?: \{\})?\n$/.test(line.text)) continue;
    const key = parseEntryHeader(line.text);
    assert(!seen.has(key), "Clave de lockfile duplicada");
    seen.add(key);
    entries.push({ key, start: line.start, lineIndex: index });
  }
  const parsedKeys = Object.keys(parsedLock[section]);
  const entryKeys = entries.map(({ key }) => key);
  assert(
    parsedKeys.length === seen.size &&
      parsedKeys.every((key) => seen.has(key)) &&
      parsedKeys.every((key, index) => key === entryKeys[index]),
    "Estructura u orden de sección inconsistente"
  );
  return { lines, start: sectionHeader.start, end, endIndex, entries, keys: parsedKeys };
}

function expectedHeader(key) {
  assert(/^[A-Za-z0-9@._+()/-]+$/.test(key), "Locator no admitido");
  const scalar = key.startsWith("@") ? "'" + key + "'" : key;
  return "  " + scalar + ":\n";
}

function entryBlock(text, section, key, parsedLock) {
  const index = sectionIndex(text, section, parsedLock);
  const matches = index.entries.filter((entry) => entry.key === key);
  assert(matches.length === 1 && Object.prototype.hasOwnProperty.call(parsedLock[section], key), "Bloque requerido ausente o ambiguo");
  const entry = matches[0];
  const header = index.lines[entry.lineIndex].text;
  const emptyObjectHeader = expectedHeader(key).slice(0, -1) + " {}\n";
  const emptyObject = parsedLock[section][key] &&
    typeof parsedLock[section][key] === "object" &&
    !Array.isArray(parsedLock[section][key]) &&
    Object.keys(parsedLock[section][key]).length === 0;
  assert(
    header === expectedHeader(key) || (header === emptyObjectHeader && emptyObject),
    "Formato de cabecera de bloque no admitido"
  );
  const next = index.entries.find((candidate) => candidate.start > entry.start);
  const limit = next ? next.lineIndex : index.endIndex;
  let end = index.lines[entry.lineIndex].end;
  for (let lineIndex = entry.lineIndex + 1; lineIndex < limit; lineIndex += 1) {
    if (index.lines[lineIndex].text.trim() !== "") end = index.lines[lineIndex].end;
  }
  return { start: entry.start, end, text: text.slice(entry.start, end) };
}

function assertExactTargetSets(lock, isRaw) {
  const packagePrefixes = TARGETS.map(({ name }) => name + "@");
  const packageLocators = Object.keys(lock.packages).filter((key) => packagePrefixes.some((prefix) => key.startsWith(prefix)));
  const expectedPackageLocators = TARGETS.map(({ name, to, from }) => name + "@" + (isRaw ? to : from)).sort();
  assert(
    JSON.stringify(packageLocators.sort()) === JSON.stringify(expectedPackageLocators),
    "Locators de paquete objetivo fuera del contrato"
  );

  const followVersion = isRaw ? "1.16.1" : "1.16.0";
  const honoVersion = isRaw ? "4.13.13" : "4.13.7";
  const expectedSnapshots = [
    "follow-redirects@" + followVersion,
    "hono@" + honoVersion,
    ...EXPECTED_PARENT_SNAPSHOTS.map((key) =>
      key.startsWith("@hono/node-server@") ? "@hono/node-server@2.1.1(hono@" + honoVersion + ")" : key
    ),
  ].sort();
  const actualSnapshots = Object.keys(lock.snapshots).filter((key) =>
    key.startsWith("follow-redirects@") ||
    key.startsWith("hono@") ||
    key.startsWith("axios@1.20.0") ||
    key.startsWith("@hono/node-server@2.1.1(") ||
    key.startsWith("@modelcontextprotocol/sdk@1.32.1(")
  ).sort();
  assert(JSON.stringify(actualSnapshots) === JSON.stringify(expectedSnapshots), "Snapshots o contextos de peer fuera del contrato");
}

function assertRawReferences(lock) {
  const snapshots = lock.snapshots;
  const axios = snapshots["axios@1.20.0"];
  const sdk = snapshots["@modelcontextprotocol/sdk@1.32.1(zod@3.25.76)"];
  const server = snapshots["@hono/node-server@2.1.1(hono@4.13.13)"];
  assert(axios && axios.dependencies && axios.dependencies["follow-redirects"] === "1.16.1", "Referencia axios fuera del contrato");
  assert(server && server.dependencies && server.dependencies.hono === "4.13.13", "Referencia node-server fuera del contrato");
  assert(sdk && sdk.dependencies && sdk.dependencies.hono === "4.13.13", "Referencia SDK Hono fuera del contrato");
  assert(
    sdk.dependencies["@hono/node-server"] === "2.1.1(hono@4.13.13)",
    "Peer context del SDK fuera del contrato"
  );

  const allowedSnapshotKeys = new Set([
    "follow-redirects@1.16.1",
    "hono@4.13.13",
    ...EXPECTED_PARENT_SNAPSHOTS,
  ]);
  const allowedEdges = new Set([
    "axios@1.20.0:dependencies:follow-redirects",
    "@hono/node-server@2.1.1(hono@4.13.13):dependencies:hono",
    "@modelcontextprotocol/sdk@1.32.1(zod@3.25.76):dependencies:hono",
    "@modelcontextprotocol/sdk@1.32.1(zod@3.25.76):dependencies:@hono/node-server",
  ]);

  function visit(value, path) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, path.concat(String(index))));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        assert(
          !key.includes("follow-redirects@1.16.1") && !key.includes("hono@4.13.13"),
          "Locator anidado fuera del contrato"
        );
        visit(child, path.concat(key));
      }
      return;
    }
    if (typeof value !== "string") return;
    const isTargetReference =
      value === "1.16.1" ||
      value === "4.13.13" ||
      value.includes("follow-redirects@1.16.1") ||
      value.includes("hono@4.13.13");
    if (!isTargetReference) return;
    const snapshotKey = path[0];
    const edge = path.join(":");
    assert(allowedSnapshotKeys.has(snapshotKey) && allowedEdges.has(edge), "Arista objetivo fuera del contrato");
  }

  for (const [key, snapshot] of Object.entries(snapshots)) {
    if (key.includes("follow-redirects@1.16.1") || key.includes("hono@4.13.13")) {
      assert(allowedSnapshotKeys.has(key), "Locator de snapshot objetivo fuera del contrato");
    }
    visit(snapshot, [key]);
  }
}

function assertPackageMetadataCompatible(base, raw) {
  for (const target of TARGETS) {
    const baseKey = target.name + "@" + target.from;
    const rawKey = target.name + "@" + target.to;
    const oldRecord = base.packages[baseKey];
    const newRecord = raw.packages[rawKey];
    assert(oldRecord && newRecord, "Metadata de paquete objetivo ausente");
    assert(newRecord.resolution && newRecord.resolution.integrity === target.integrity, "Integridad objetivo no aprobada");
    const oldComparable = { ...oldRecord, resolution: { ...oldRecord.resolution, integrity: "<digest>" } };
    const newComparable = { ...newRecord, resolution: { ...newRecord.resolution, integrity: "<digest>" } };
    assert(
      JSON.stringify(stable(oldComparable)) === JSON.stringify(stable(newComparable)),
      "Metadata de paquete objetivo cambió fuera del digest aprobado"
    );
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sectionText(text, section, parsedLock) {
  const index = sectionIndex(text, section, parsedLock);
  return text.slice(index.start, index.end);
}

function assertProjectedSectionOrder(base, candidate, section) {
  const replacements = new Map(
    BLOCKS.filter((block) => block.section === section).map((block) => [block.baseKey, block.rawKey])
  );
  const expected = Object.keys(base[section]).map((key) => replacements.get(key) || key);
  const actual = Object.keys(candidate[section]);
  assert(
    expected.length === actual.length && expected.every((key, index) => key === actual[index]),
    "Orden o conjunto de bloques proyectados cambió fuera del contrato"
  );
}

function projectLockfileText({ baseText, rawText }) {
  assertSupportedTextFormat(baseText);
  assertSupportedTextFormat(rawText);
  assertSectionOrder(baseText);
  assertSectionOrder(rawText);
  const base = parseLockfile(baseText);
  const raw = parseLockfile(rawText);
  assertExactTargetSets(base, false);
  assertExactTargetSets(raw, true);
  assert(JSON.stringify(stable(base.importers)) === JSON.stringify(stable(raw.importers)), "Importers cambiaron durante la resolución");
  assert(sectionText(baseText, "importers", base) === sectionText(rawText, "importers", raw), "Formato de importers cambió durante la resolución");
  assertPackageMetadataCompatible(base, raw);
  assertRawReferences(raw);

  const edits = BLOCKS.map(({ section, baseKey, rawKey }) => {
    const baseBlock = entryBlock(baseText, section, baseKey, base);
    const rawBlock = entryBlock(rawText, section, rawKey, raw);
    if (baseKey !== rawKey) {
      assert(!Object.prototype.hasOwnProperty.call(base[section], rawKey), "Locator de destino ya existe en la base");
    }
    return { start: baseBlock.start, end: baseBlock.end, replacement: rawBlock.text };
  }).sort((left, right) => right.start - left.start);

  for (let index = 1; index < edits.length; index += 1) {
    assert(edits[index - 1].start >= edits[index].end, "Bloques proyectados se solapan");
  }
  let candidateText = baseText;
  for (const edit of edits) {
    candidateText = candidateText.slice(0, edit.start) + edit.replacement + candidateText.slice(edit.end);
  }

  assertSupportedTextFormat(candidateText);
  assertSectionOrder(candidateText);
  const candidate = parseLockfile(candidateText);
  for (const section of ["packages", "snapshots"]) {
    sectionIndex(candidateText, section, candidate);
    assertProjectedSectionOrder(base, candidate, section);
  }
  validateLockfileRefresh({ beforeText: baseText, afterText: candidateText, changedFiles: [LOCKFILE_PATH] });

  return {
    candidateText,
    baseSha256: sha256(baseText),
    rawSha256: sha256(rawText),
    projectedSha256: sha256(candidateText),
  };
}

function assertProjectedHash(text, expectedHash) {
  assert(/^[a-f0-9]{64}$/.test(expectedHash || ""), "Hash proyectado esperado inválido");
  const actualHash = sha256(text);
  assert(actualHash === expectedHash, "El lockfile cambió después de la proyección");
  return actualHash;
}

function emitProjectionHashes(values) {
  const output = [
    "base_commit=" + values.baseCommit,
    "base_lock_sha256=" + values.baseSha256,
    "raw_resolved_sha256=" + values.rawSha256,
    "projected_lock_sha256=" + values.projectedSha256,
  ].join("\n");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output + "\n", { encoding: "utf8" });
  process.stdout.write("Lockfile projection hashes: " + output.replaceAll("\n", " ") + "\n");
}

function main() {
  if (process.argv[2] === "--verify") {
    assertProjectedHash(readFileSync(LOCKFILE_PATH, "utf8"), process.argv[3] || process.env.EXPECTED_PROJECTED_LOCK_SHA256);
    return;
  }

  const baseCommit = process.env.BASE_SHA || "";
  assert(/^[0-9a-f]{40}$/.test(baseCommit), "BASE_SHA inválido");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert(head === baseCommit, "El checkout no coincide con el commit base");
  const baseText = execFileSync("git", ["show", baseCommit + ":" + LOCKFILE_PATH], {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  const rawText = readFileSync(LOCKFILE_PATH, "utf8");
  const projection = projectLockfileText({ baseText, rawText });
  writeFileSync(LOCKFILE_PATH, projection.candidateText, "utf8");
  assertProjectedHash(readFileSync(LOCKFILE_PATH, "utf8"), projection.projectedSha256);
  emitProjectionHashes({
    baseCommit,
    baseSha256: projection.baseSha256,
    rawSha256: projection.rawSha256,
    projectedSha256: projection.projectedSha256,
  });
}

if (require.main === module) {
  try {
    main();
  } catch {
    process.stderr.write("Proyector de lockfile rechazado por contrato cerrado.\n");
    process.exitCode = 1;
  }
}

module.exports = {
  BLOCKS,
  MAX_GIT_OUTPUT_BYTES,
  assertProjectedHash,
  projectLockfileText,
  sha256,
};
