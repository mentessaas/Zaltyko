#!/usr/bin/env tsx
/**
 * A2 — Unbounded reads gate.
 *
 * What it does:
 *   Walks every .ts/.tsx file under `src/` (plus optional `--root <dir>` for
 *   fixtures) and flags Drizzle-style list reads that have no `.limit(N)` /
 *   `.offset(N)` / cursor / pagination primitive on the same chain.
 *
 * Patterns recognised:
 *   - `db.select(...).from(T).where(...)`     – relational-builder style
 *   - `tx.select(...).from(T).where(...)`     – inside an open transaction
 *   - `db.query.<entity>.findMany({...})`     – relational-query style (no
 *     `limit` key in the options object)
 *
 * Reads that intentionally return full table contents (materialised seeds,
 * exports, deletion sweeps, etc.) may add a comment `unbounded-read-ok`
 * within the 8 lines preceding the call to opt out.
 *
 * What it does NOT do (documented limits):
 *   - It cannot resolve runtime identifiers across module boundaries, so a
 *     chain built inside a helper that uses an `as` projection to widen
 *     `db` to a custom alias is treated as transparent (we look for the
 *     identifier `db`/`tx` literally — custom aliases are escaped via the
 *     escape hatch).
 *   - It does not understand `select(1)` aggregate reads that intentionally
 *     touch every row for `count(*)`. Those get surfaced; if you really
 *     need one, annotate with `unbounded-read-ok`.
 *   - It does not enforce caps on `.limit()`; a `.limit(100000)` still passes.
 *     A separate runtime rate-limit gate is responsible for caps.
 *
 * Usage:
 *   pnpm gate:reads                       # scan default src tree
 *   pnpm gate:reads -- --root ./path      # scan a custom directory (fixtures)
 *   pnpm gate:reads -- --strict           # non-zero exit on any finding
 *   pnpm gate:reads -- --json             # machine-readable output
 */
import * as path from "node:path";
import process from "node:process";

import ts from "typescript";

import { emitReport } from "./lib/report";
import {
  findingFromNode,
  leadingComment,
  lineOf,
  readSource,
  safeScanFile,
  snippet,
  walkFiles,
  type Finding,
} from "./lib/walker";

const DEFAULT_ROOTS = ["src"];

interface ChainInfo {
  identifier: "db" | "tx";
  chain: ts.CallExpression;
  isFindMany: boolean;
}

function parseRoots(): string[] {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  if (rootIdx >= 0) {
    const raw = args[rootIdx + 1];
    if (!raw) {
      throw new Error("--root expects a path argument");
    }
    return [path.resolve(raw)];
  }
  return DEFAULT_ROOTS.map((p) => path.resolve(p));
}

/**
 * Decide whether a property-access expression continues a Drizzle chain we
 * already know about. Returns the new chain head if yes, null otherwise.
 */
function followChain(call: ts.CallExpression): ts.CallExpression | null {
  return call;
}

/**
 * If `node` is the head of a Drizzle list-read chain, return the chain metadata.
 * Recognised shapes:
 *   db.select().from(T)
 *   db.select(...).from(T).leftJoin(...)
 *   db.query.<entity>.findMany({})
 *   db.query.<entity>.findMany({ where: ... })
 */
function classifyChain(node: ts.Node): ChainInfo | null {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;

  const methodName = callee.name.text;

  // Pattern A: relational query — db.query.<entity>.findMany({...})
  if (methodName === "findMany") {
    const inner = callee.expression;
    if (ts.isPropertyAccessExpression(inner)) {
      if (ts.isPropertyAccessExpression(inner.expression) && inner.expression.name.text === "query") {
        return { identifier: "db", chain: node, isFindMany: true };
      }
    }
  }

  // Pattern B: relational builder — db.select(...).from(T)
  if (methodName === "from" || methodName === "leftJoin" || methodName === "innerJoin" || methodName === "rightJoin" || methodName === "fullJoin" || methodName === "where") {
    // Walk up the chain's property accesses and ensure it begins with a
    // `db` or `tx` identifier holding `.select(` or `.selectDistinct(`.
    let cursor: ts.Expression = callee.expression;
    let beganWithSelect = false;
    let depth = 0;
    while (cursor && ts.isCallExpression(cursor)) {
      const c = cursor.expression;
      if (ts.isPropertyAccessExpression(c)) {
        const name = c.name.text;
        if (name === "select" || name === "selectDistinct") beganWithSelect = true;
        cursor = c.expression;
        depth++;
        if (depth > 16) break;
      } else {
        break;
      }
    }
    if (beganWithSelect) {
      const head = cursor;
      const id = ts.isIdentifier(head) ? head.text : null;
      if (id === "db" || id === "tx") {
        return { identifier: id, chain: node, isFindMany: false };
      }
    }
  }

  return null;
}

/** Does the chain contain a `.limit(N)` or `.offset(N)` property-access call? */
function hasLimitOrOffset(node: ts.CallExpression): boolean {
  let cursor: ts.Node = node;
  while (cursor && ts.isCallExpression(cursor)) {
    const c = cursor.expression;
    if (ts.isPropertyAccessExpression(c)) {
      const name = c.name.text;
      if (name === "limit" || name === "offset") return true;
      cursor = c.expression;
    } else {
      break;
    }
  }
  return false;
}

/** Look inside the options arg of `findMany({...})` for a `limit:` property. */
function findManyArgsHaveLimit(node: ts.CallExpression): boolean {
  if (node.arguments.length === 0) return false;
  const arg = node.arguments[0];
  if (!ts.isObjectLiteralExpression(arg)) return false;
  for (const prop of arg.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const name = prop.name.text;
      if (name === "limit" || name === "offset" || name === "cursor") {
        // Treat any non-undefined RHS as evidence.
        const text = prop.initializer.getText().trim();
        if (text !== "undefined") return true;
      }
    }
    if (ts.isShorthandPropertyAssignment(prop) && (prop.name.text === "limit" || prop.name.text === "offset")) {
      return true;
    }
  }
  return false;
}

/** Public so external fixtures can use it without re-parsing. */
export interface NodeLocation {
  file: string;
  line: number;
}

/**
 * Walk upward from a chain call to the topmost chained call expression.
 * For `db.select().from().where().limit(N)` starting from the `where`
 * call, this returns the `.limit(N)` call — the outermost call in the
 * chain. For an isolated `findMany({...})` it returns the findMany call
 * itself.
 *
 * Note: in TS's AST, the next chained call sits two parents away — first
 * a PropertyAccessExpression (`.limit`), then the wrapping CallExpression
 * (the actual `.limit(N)` call). We have to skip both.
 */
function outermostCallInChain(node: ts.CallExpression): ts.CallExpression {
  let top: ts.CallExpression = node;
  while (true) {
    let cur: ts.Node | undefined = top.parent;
    // Skip the intermediate PropertyAccessExpression (e.g. `.limit`).
    if (cur && ts.isPropertyAccessExpression(cur) && cur.expression === top) {
      cur = cur.parent;
    }
    if (
      cur &&
      ts.isCallExpression(cur) &&
      ts.isPropertyAccessExpression(cur.expression) &&
      cur.expression.expression === top
    ) {
      top = cur;
      continue;
    }
    break;
  }
  return top;
}

/**
 * Given the outermost call expression of a chain, decide whether the
 * chain has any `.limit(N)` or `.offset(N)` call anywhere along its
 * length — descending from outermost toward the `db`/`tx` identifier.
 */
function hasLimitOrOffsetAnywhere(node: ts.CallExpression): boolean {
  let cursor: ts.Node = node;
  while (cursor && ts.isCallExpression(cursor)) {
    const ce = cursor.expression;
    if (ts.isPropertyAccessExpression(ce)) {
      const name = ce.name.text;
      if (name === "limit" || name === "offset") return true;
      cursor = ce.expression;
    } else {
      break;
    }
  }
  return false;
}

/**
 * Walk upward from a chain call to the outermost expression that contains
 * it (Await, VariableDeclaration, ExpressionStatement, etc.) and return
 * its start position. Used for de-duplication and escape-hatch anchoring.
 */
function outermostAnchor(node: ts.Node, sf: ts.SourceFile): number {
  let cursor: ts.Node | undefined = node;
  let outermost: number = node.getStart(sf);
  while (cursor) {
    const isWrap =
      ts.isAwaitExpression(cursor) ||
      ts.isVariableDeclaration(cursor) ||
      ts.isExpressionStatement(cursor) ||
      ts.isParenthesizedExpression(cursor) ||
      ts.isArrowFunction(cursor) ||
      ts.isBlock(cursor) ||
      ts.isBinaryExpression(cursor);
    if (isWrap) {
      outermost = cursor.getStart(sf);
      if (cursor.parent) outermost = cursor.parent.getStart(sf);
      return outermost;
    }
    outermost = cursor.getStart(sf);
    cursor = cursor.parent;
  }
  return outermost;
}

export function scanFile(filePath: string): Finding[] {
  const out: Finding[] = [];
  const { source, sf } = readSource(filePath);
  const reported = new Set<number>();

  const visit = (node: ts.Node) => {
    const info = classifyChain(node);
    if (!info) return;

    // Promote to outermost call so the entire chain (including any
    // trailing `.limit(N)`/` .offset(N)`) is examined at once.
    const topCall = info.isFindMany
      ? info.chain
      : outermostCallInChain(info.chain);

    const limited = info.isFindMany
      ? findManyArgsHaveLimit(topCall)
      : hasLimitOrOffsetAnywhere(topCall);
    if (limited) return;

    const anchor = outermostAnchor(topCall, sf);
    if (reported.has(anchor)) return;

    // Apply escape hatch: the comment block immediately before the
    // outermost anchor must contain `unbounded-read-ok` as a standalone
    // marker (either `// unbounded-read-ok: <reason>` or
    // `// unbounded-read-ok <reason>`). Plain mentions of the string in
    // surrounding prose do not count.
    const tail = source.slice(Math.max(0, anchor - 240), anchor);
    const before = tail.split("\n");
    let annotated = false;
    let reason: string | null = null;
    let lastNonCommentLine = -1;
    for (let i = 0; i < before.length; i++) {
      const t = before[i].trim();
      if (t === "") continue;
      if (!t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*") && !t.endsWith("*/")) {
        lastNonCommentLine = i;
        break;
      }
    }
    // Only consider comments that are immediately before the chain
    // (i.e. after the lastNonCommentLine, with no intervening code).
    for (let i = before.length - 1; i > lastNonCommentLine; i--) {
      const line = before[i];
      const t = line.trim();
      if (!t.startsWith("//")) continue;
      const m = /^unbounded-read-ok\s*:?\s*(.*)$/.exec(t.replace(/^\/\/\s?/, ""));
      if (m) {
        annotated = true;
        reason = (m[1] ?? "").trim() || null;
        break;
      }
    }
    if (process.env.GATE_TRACE) {
      process.stdout.write(`[trace HATCH anchor=L${lineOf(source, anchor)} annotated=${annotated} reason=${JSON.stringify(reason)}]\n`);
    }
    if (process.env.GATE_TRACE) {
      process.stdout.write(`[trace HATCH anchor=L${lineOf(source, anchor)} annotated=${annotated} reason=${JSON.stringify(reason)}]\n`);
    }
    if (annotated && reason) return;

    reported.add(anchor);
    out.push(
      findingFromNode(
        "A2/unbounded-read",
        sf,
        filePath,
        topCall,
        info.isFindMany
          ? `db.query.findMany({...}) without { limit: ... } (or escape hatch) — snippet: ${snippet(sf, info.chain, 90)}`
          : `db.select().from(...) chain without .limit(N) or escape hatch — snippet: ${snippet(sf, info.chain, 90)}`,
        info.isFindMany
          ? "Add `limit: N, offset: M` to the options literal, or annotate the line with `// unbounded-read-ok: <reason>`."
          : "Append `.limit(N)` (and `.offset(M)` if paginating) to the chain, or annotate the line with `// unbounded-read-ok: <reason>`.",
      ),
    );
  };

  const walk = (n: ts.Node) => {
    visit(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

function main() {
  const roots = parseRoots();
  const scanned: string[] = [];
  const findings: Finding[] = [];

  for (const root of roots) {
    for (const file of walkFiles(root)) {
      scanned.push(file);
      findings.push(...safeScanFile(scanFile, file));
    }
  }

  emitReport("unbounded-reads", scanned.length, findings);
}

if (require.main === module) {
  main();
}
