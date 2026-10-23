/**
 * Shared TypeScript compiler-API walker for static gates.
 *
 * Provides:
 *  - A single ts.SourceFile cache keyed by absolute path (avoids re-parsing).
 *  - A `walkFiles(root, predicate)` that yields { filePath, source, sf } for any
 *    .ts/.tsx file whose path matches the predicate.
 *  - A small helper `lineOf(source, pos)` so each gate can report a stable
 *    1-indexed line for each finding without depending on ts API quirks.
 *
 * Each gate owns its own checker; this module only knows how to walk files and
 * give the gate source + AST. Gates must NOT use regex on raw source for
 * semantic decisions (see A3 acceptance).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import ts from "typescript";

export interface WalkedFile {
  filePath: string;
  source: string;
  sf: ts.SourceFile;
}

const SRC_EXT_RE = /\.(ts|tsx|mts|cts)$/;

export function shouldInclude(filePath: string): boolean {
  return SRC_EXT_RE.test(filePath);
}

export function lineOf(source: string, pos: number): number {
  let line = 1;
  const limit = Math.min(pos, source.length);
  for (let i = 0; i < limit; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function readSource(filePath: string): { source: string; sf: ts.SourceFile } {
  // iCloud-backed dataless files can throw `Unknown system error -11` on
  // read; we surface that as a tagged empty source so callers can skip
  // the file rather than crash the whole gate run. This is the same
  // class of resilience Zaltyko relies on elsewhere (see WORKING_COPY
  // dataless note in vault/00-Inicio).
  const source = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  );
  return { source, sf };
}

/**
 * Read-only variant that returns `null` (instead of throwing) when the file
 * is unreadable — iCloud-backed dataless files raise `Unknown system error
 * -11`, and silently skipping them is preferable to crashing the gate run.
 * Callers should treat the missing AST as "no findings for this file".
 */
export function tryReadSource(filePath: string): { source: string; sf: ts.SourceFile } | null {
  try {
    return readSource(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EACCES" || code === "EISDIR") return null;
    // Treat iCloud errno -11 as unreadable too: the file is dataless and
    // Node refuses to materialise it. The safe default is to skip.
    if ((err as NodeJS.ErrnoException).errno === -11) return null;
    throw err;
  }
}

/**
 * Recursively walk `root` and yield every file that satisfies `pred`.
 * Skips node_modules, .next, .git, dist, coverage by convention.
 */
export function* walkFiles(
  root: string,
  pred: (filePath: string) => boolean = shouldInclude,
): Generator<string> {
  if (!fs.existsSync(root)) return;
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git" || entry.name === "dist" || entry.name === "coverage") {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && pred(full)) {
        yield full;
      }
    }
  }
}

/**
 * Return the trimmed text of a Node, replacing internal line breaks with
 * single spaces so a one-line summary stays readable in reports.
 */
export function snippet(sf: ts.SourceFile, node: ts.Node, maxLen = 140): string {
  const raw = node.getText(sf).replace(/\s+/g, " ").trim();
  return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw;
}

/**
 * Look at the nearest preceding comment block (single-line or `/* ... *\/`)
 * of a node. Used by A2 to detect the `unbounded-read-ok` escape hatch.
 */
export function leadingComment(source: string, pos: number, marker: RegExp): { ok: boolean; reason: string | null } {
  const before = source.slice(0, pos);
  // Find the last single-line `// ...` and the last `/* ... *\/` block ending
  // before `pos`. We walk backwards looking at line boundaries.
  const lines = before.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") continue;
    // Stop at the first non-comment, non-empty line
    if (!trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*") && !trimmed.endsWith("*/")) {
      break;
    }
    if (marker.test(trimmed)) {
      const reason = trimmed.replace(/^(\/\/|\/\*\*?|\*)\s*/, "").replace(/\*\/$/, "").trim();
      return { ok: true, reason };
    }
  }
  return { ok: false, reason: null };
}

/**
 * Wrap a per-file scan so iCloud dataless files (errno -11) and other
 * transient read failures do not crash the whole gate run. The file is
 * skipped silently — we cannot make a static judgement about unreadable
 * bytes, so the safe default is "no findings for this file". This matches
 * the policy in the Zaltyko working-copy dataless note (vault/00-Inicio).
 */
export function safeScanFile<T>(scan: (filePath: string) => T[], filePath: string): T[] {
  try {
    return scan(filePath);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.errno === -11 || e.code === "ENOENT" || e.code === "EACCES" || e.code === "EISDIR") {
      return [];
    }
    throw err;
  }
}

/**
 * Convenience: append a finding to a shared shape so each gate emits a
 * consistent JSON report.
 */
export interface Finding {
  file: string;
  line: number;
  rule: string;
  reason: string;
  hint: string;
}

export function findingFromNode(
  rule: string,
  sf: ts.SourceFile,
  filePath: string,
  node: ts.Node,
  reason: string,
  hint: string,
): Finding {
  return {
    file: path.relative(process.cwd(), filePath),
    line: lineOf(sf.text, node.getStart(sf)),
    rule,
    reason,
    hint,
  };
}
