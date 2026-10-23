/* eslint-disable */
/**
 * A3 gate: auth before body validation.
 *
 * Walks every route.ts file under src/app/api and decides whether each
 * exported HTTP method (GET/POST/PUT/PATCH/DELETE/OPTIONS) authenticates
 * the request strictly before any body parsing or schema validation.
 *
 * Pure TypeScript AST scan. Regex is not used for semantic decisions.
 *
 * Patterns:
 *   - export wrapped in `withTenant(...)` or `withSuperAdmin(...)` is
 *     treated as auth-first by construction.
 *   - Inline handlers are walked top-down. The first call to
 *     `request.json()` / `request.formData()` / `<expr>.parse(...)` /
 *     `<expr>.safeParse(...)` is recorded; if no auth primitive
 *     (`withTenant`, `withSuperAdmin`, `resolveUserId`,
 *     `getBearerToken`, `createBearerSupabaseClient`, `assertSuperAdmin`,
 *     `getCurrentProfile`, `verifyWebhookSignature`) appears before
 *     that line, the export is flagged.
 *
 *   - File-level escape hatch: a `// @auth-flexible route-guard-reason:`
 *     comment on the line above the export suppresses intentional
 *     webhook/cron/dev cases.
 *
 * Documented limits:
 *   - Body parsing inside a nested arrow inside an inline handler is
 *     opaque; those routes must use the @auth-flexible annotation.
 *   - Webhook/cron/dev routes that don't call any auth primitive
 *     receive the annotation rather than refactor.
 *
 * Usage:
 *   pnpm gate:auth
 *   pnpm gate:auth -- --root ./path
 *   pnpm gate:auth -- --strict     (non-zero exit on any finding)
 *   pnpm gate:auth -- --json       (machine-readable output)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

import ts from "typescript";

import { emitReport } from "./lib/report";
import {
  findingFromNode,
  lineOf,
  readSource,
  safeScanFile,
  walkFiles,
  type Finding,
} from "./lib/walker";

const METHOD_NAMES = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const AUTH_PRIMITIVES = new Set([
  "withTenant",
  "withBearerTenant",
  "withSuperAdmin",
  "requireAuth",
  "resolveUserId",
  "getBearerToken",
  "createBearerSupabaseClient",
  "assertSuperAdmin",
  "getCurrentProfile",
  "verifyWebhookSignature",
]);

const VALIDATION_PRIMITIVES = new Set(["json", "formData", "text", "arrayBuffer", "blob"]);

function parseRoots(): string[] {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  if (rootIdx >= 0) {
    const raw = args[rootIdx + 1];
    if (!raw) throw new Error("--root expects a path argument");
    return [path.resolve(raw)];
  }
  return [path.resolve("src/app/api")];
}

interface ExportInfo {
  exportName: string;
  init: ts.Expression;
  declaration: ts.Node;
  isWrappedInAuthHOF: boolean;
  wrapFn: string | null;
}

type LocalBindings = Map<string, ts.Expression>;

function getLocalBindings(sf: ts.SourceFile): LocalBindings {
  const bindings: LocalBindings = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        bindings.set(decl.name.text, decl.initializer);
      }
    }
  }
  return bindings;
}

/** Resolve same-file aliases without crossing module boundaries. */
function resolveLocalAlias(node: ts.Expression, bindings: LocalBindings): ts.Expression {
  let current = node;
  const seen = new Set<string>();
  for (let depth = 0; depth < 16 && ts.isIdentifier(current); depth++) {
    const name = current.text;
    if (seen.has(name)) break;
    seen.add(name);
    const target = bindings.get(name);
    if (!target) break;
    current = target;
  }
  return current;
}

function getExportedHandlers(sf: ts.SourceFile): ExportInfo[] {
  const out: ExportInfo[] = [];
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && METHOD_NAMES.has(decl.name.text) && decl.initializer) {
          out.push({
            exportName: decl.name.text,
            init: decl.initializer,
            declaration: stmt,
            isWrappedInAuthHOF: false,
            wrapFn: null,
          });
        }
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name && METHOD_NAMES.has(stmt.name.text)) {
      out.push({
        exportName: stmt.name.text,
        // ZAL-fix: una FunctionDeclaration no es un ts.Expression (falta el
        // brand `_expressionBrand`). La envolvemos en un cast porque
        // `analyseWrapper` solo la usa como nodo de partida para el walk.
        init: stmt as unknown as ts.Expression,
        declaration: stmt,
        isWrappedInAuthHOF: false,
        wrapFn: null,
      });
    }
  }
  return out;
}

/**
 * Walk the expression on the LHS of `export const FOO = ...` and decide
 * whether the outermost HOF is a recognised auth wrapper. If it is, the
 * gate treats the export as auth-first by construction and skips it.
 */
function analyseWrapper(info: ExportInfo, bindings: LocalBindings): ExportInfo {
  const init = resolveLocalAlias(info.init, bindings);
  const isAuthCall = (e: ts.Node): boolean =>
    ts.isCallExpression(e) && ts.isIdentifier(e.expression) && AUTH_PRIMITIVES.has(e.expression.text);

  if (ts.isCallExpression(init) && isAuthCall(init)) {
    info.isWrappedInAuthHOF = true;
    info.wrapFn = (init.expression as ts.Identifier).text;
    return info;
  }

  // Recurse through nested HOFs (e.g. `withRateLimit(withTenant(handler), ...)`).
  let cursor: ts.Node | undefined = init;
  const seen = new Set<ts.Node>();
  let depth = 0;
  while (cursor && depth < 16) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    if (ts.isIdentifier(cursor)) {
      const resolved = resolveLocalAlias(cursor, bindings);
      if (resolved === cursor) break;
      cursor = resolved;
      depth++;
      continue;
    }
    if (!ts.isCallExpression(cursor)) break;
    const callee = cursor.expression;
    if (ts.isIdentifier(callee) && AUTH_PRIMITIVES.has(callee.text)) {
      info.isWrappedInAuthHOF = true;
      info.wrapFn = callee.text;
      break;
    }
    const firstArg: ts.Expression | undefined = cursor.arguments[0] as ts.Expression | undefined;
    if (!firstArg) break;
    cursor = firstArg;
    depth++;
  }
  return info;
}

interface OrderingViolation {
  validationNode: ts.Node;
  validationText: string;
  validationLine: number;
}

/**
 * Detect if the given handler body executes a validation primitive BEFORE
 * any auth primitive. Returns the offending validation expression if so.
 */
function checkOrdering(handler: ts.Node, sf: ts.SourceFile, sourceText: string): OrderingViolation | null {
  let firstValidate: { pos: number; node: ts.Node; text: string } | null = null;
  let firstAuth: { pos: number; name: string } | null = null;

  const stack: ts.Node[] = [handler];

  const isAuthCall = (node: ts.Node): string | null => {
    if (ts.isIdentifier(node) && AUTH_PRIMITIVES.has(node.text)) {
      const p = node.parent;
      if (p && ts.isCallExpression(p) && p.expression === node) return node.text;
    }

    // Bearer routes authenticate with supabase.auth.getUser(...). This is a
    // property-access call rather than an identifier callee, but it is still
    // an auth guard in the real Zaltyko handlers.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const getUser = node.expression;
      const auth = getUser.expression;
      if (
        getUser.name.text === "getUser" &&
        ts.isPropertyAccessExpression(auth) &&
        auth.name.text === "auth"
      ) {
        return "auth.getUser";
      }
    }

    return null;
  };

  while (stack.length) {
    const node = stack.pop() as ts.Node;

    // Auth primitive?
    const authName = isAuthCall(node);
    if (authName) {
      const pos = node.getStart(sf);
      if (firstAuth === null || pos < firstAuth.pos) {
        firstAuth = { pos, name: authName };
      }
    }

    // Validation primitive?
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const owner = callee.expression;
        const name = callee.name.text;

        // request.{json|formData|text|arrayBuffer|blob}()
        if (ts.isIdentifier(owner) && owner.text === "request" && VALIDATION_PRIMITIVES.has(name)) {
          const pos = node.getStart(sf);
          if (firstValidate === null || pos < firstValidate.pos) {
            firstValidate = { pos, node, text: `request.${name}()` };
          }
        }
        // <anything>.parse(...) or .safeParse(...)
        if (name === "parse" || name === "safeParse" || name === "parseAsync" || name === "safeParseAsync") {
          const pos = node.getStart(sf);
          if (firstValidate === null || pos < firstValidate.pos) {
            firstValidate = { pos, node, text: `<expr>.${name}(...)` };
          }
        }
      }
    }

    // Skip descending into nested functions; their order is opaque to us
    // statically. The outer handler is what we care about.
    const isFnLike = ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node);
    if (isFnLike && node !== handler) continue;

    ts.forEachChild(node, (child) => {
      stack.push(child);
    });
  }

  if (firstValidate && (!firstAuth || firstAuth.pos > firstValidate.pos)) {
    return {
      validationNode: firstValidate.node,
      validationText: firstValidate.text,
      validationLine: lineOf(sourceText, firstValidate.pos),
    };
  }
  return null;
}

/** Read comment lines preceding the export (block or line). */
function precedingComments(source: string, pos: number): string[] {
  const slice = source.slice(0, pos);
  const lines = slice.split("\n");
  const result: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === "") continue;
    if (!t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*") && !t.endsWith("*/")) break;
    result.unshift(t);
  }
  return result;
}

function hasAuthFlexibleAnnotation(comments: string[]): boolean {
  return comments.some((c) => /@auth-flexible\b/.test(c));
}

/**
 * Unwrap a chain of HOFs (e.g. `withRateLimit(withTenant(handler))`) and
 * return the innermost handler expression.
 */
function unwrapHandlerExpression(
  node: ts.Expression | undefined,
  bindings: LocalBindings,
): ts.Expression | undefined {
  let cur: ts.Expression | undefined = node;
  const seen = new Set<ts.Node>();
  while (cur && ts.isCallExpression(cur)) {
    if (seen.has(cur)) return undefined;
    seen.add(cur);
    cur = cur.arguments[0] as ts.Expression | undefined;
    if (cur) cur = resolveLocalAlias(cur, bindings);
  }
  return cur;
}

export function scanFile(filePath: string): Finding[] {
  const out: Finding[] = [];
  const { source, sf } = readSource(filePath);
  const bindings = getLocalBindings(sf);

  for (const exp of getExportedHandlers(sf).map((info) => analyseWrapper(info, bindings))) {
    if (exp.isWrappedInAuthHOF) continue; // auth-first by construction

    const inner = unwrapHandlerExpression(resolveLocalAlias(exp.init, bindings), bindings);
    if (!inner) continue;

    let body: ts.Node | undefined;
    if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner) || ts.isFunctionDeclaration(inner)) {
      body = (inner as ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration).body;
    }
    if (!body) continue;

    const violation = checkOrdering(body, sf, source);
    if (!violation) continue;

    const declStart = exp.declaration.getStart(sf);
    const comments = precedingComments(source, declStart);
    if (hasAuthFlexibleAnnotation(comments)) continue;

    out.push(
      findingFromNode(
        "A3/validate-before-auth",
        sf,
        filePath,
        violation.validationNode,
        `Handler ${exp.exportName} validates the body BEFORE any auth primitive (first validation: ${violation.validationText})`,
        "Wrap the handler in `withTenant(...)`/`withSuperAdmin(...)` so the HOF resolves auth first, or move the body parse to AFTER the first auth call. If intentional (e.g. webhook/cron signature check), add `// @auth-flexible route-guard-reason: <reason>` above the export.",
      ),
    );
  }

  return out;
}

function main() {
  const roots = parseRoots();
  const scanned: string[] = [];
  const findings: Finding[] = [];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const file of walkFiles(root, (p) => p.endsWith("/route.ts") || p.endsWith("/route.tsx"))) {
      scanned.push(file);
      findings.push(...safeScanFile(scanFile, file));
    }
  }

  emitReport("auth-before-validate", scanned.length, findings);
}

if (require.main === module) {
  main();
}
