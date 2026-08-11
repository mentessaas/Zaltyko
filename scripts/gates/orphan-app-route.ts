/* eslint-disable */
/**
 * A4 gate: orphan app route — no auth under src/app/app/<static>/...
 *
 * Background: the Zaltyko App Router puts every authenticated surface under
 * `src/app/app/<segment>/...`. The academy-scoped tree is protected by
 * `src/app/app/[academyId]/layout.tsx`, which calls `supabase.auth.getUser`
 * and redirects unauthenticated requests to `/auth/login` before any data
 * is fetched. The root landing `src/app/app/page.tsx` does its own per-page
 * auth check via `/api/auth/check`.
 *
 * The orphan we hit (ZAL-588) was `src/app/app/admin/dashboard/page.tsx`:
 * a server component performing anonymous DB queries on `/app/admin/dashboard`
 * because no parent layout guarded the path and the page itself had no auth.
 *
 * Rule A4 here hardens that class of mistake:
 *   - For every `page.tsx` directly under `src/app/app/<static>/...` (where
 *     `<static>` is NOT `[academyId]` and the page is NOT the root
 *     `src/app/app/page.tsx`), the page itself MUST reference at least one
 *     recognised auth primitive, OR a parent `layout.tsx` must.
 *   - Auth primitives recognised: `withTenant`, `withSuperAdmin`,
 *     `resolveUserId`, `getBearerToken`, `createBearerSupabaseClient`,
 *     `assertSuperAdmin`, `getCurrentProfile`, `verifyWebhookSignature`,
 *     `getDevSessionFromCookieStore`, plus AST-shaped calls to
 *     `supabase.auth.getUser`, `supabase.auth.getSession`,
 *     `redirect(`, and `fetch("/api/auth/check"...)`.
 *   - Whitelisted paths (no checks required):
 *       * `src/app/app/page.tsx`        — root landing, ships its own auth.
 *       * Anything under `src/app/app/[academyId]/` — has its own layout.
 *   - Escape hatch: a leading `// @orphan-app-route-ok reason: <reason>`
 *     comment above the default export suppresses the flag.
 *
 * Usage:
 *   pnpm gate:orphan
 *   pnpm gate:orphan -- --strict
 *   pnpm gate:orphan -- --root ./fixtures
 *   pnpm gate:orphan -- --json
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

/**
 * Auth primitives that, when referenced anywhere in a page or layout, count
 * as evidence of an authentication guard. Names mirror A3's auth-before-validate
 * set, plus a few App Router-specific helpers.
 */
const AUTH_PRIMITIVES = new Set([
  "withTenant",
  "withSuperAdmin",
  "resolveUserId",
  "getBearerToken",
  "createBearerSupabaseClient",
  "assertSuperAdmin",
  "getCurrentProfile",
  "verifyWebhookSignature",
  "getDevSessionFromCookieStore",
  "redirect",
]);

/**
 * Escape hatch — same shape as A2/A3 ignore comments. The marker must appear
 * on a comment line directly above the default export. We only honor the
 * suppression when the file is otherwise outside the whitelist; this keeps
 * the marker meaningful instead of a blanket kill switch.
 */
const ESCAPE_MARKER = /@orphan-app-route-ok\s+reason\s*:/;

const APP_ROOT = path.resolve("src/app/app");

function parseRoots(): string[] {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  if (rootIdx >= 0) {
    const raw = args[rootIdx + 1];
    if (!raw) throw new Error("--root expects a path argument");
    return [path.resolve(raw)];
  }
  return [APP_ROOT];
}

/**
 * Strip optional `[ ... ]` dynamic segments from a path so we can speak
 * about the route shape rather than the literal url segment. This makes the
 * whitelist readable: `/app/[academyId]/...` covers every academy id.
 */
function normalizeSegments(relPath: string): string[] {
  return relPath.split(/[\\/]/).filter(Boolean);
}

/**
 * The fixed whitelist rooted at the canonical src/app/app. The gate only
 * enforces A4 against a `--root` if that root equals APP_ROOT, so we keep
 * the rule narrow: anything outside that path is opaque to this gate.
 */
function isUnderAppRoot(absPath: string): boolean {
  const rel = path.relative(APP_ROOT, absPath);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Decide whether a page lives under the whitelist. We keep the rule narrow
 * so future additions stay obvious in code review.
 */
function isWhitelistedPage(absPath: string): boolean {
  if (!isUnderAppRoot(absPath)) return false;
  const rel = path.relative(APP_ROOT, absPath);
  const segs = normalizeSegments(rel);

  // src/app/app/page.tsx (root landing)
  if (segs.length === 1 && segs[0] === "page.tsx") return true;

  // src/app/app/[academyId]/.../* — protected by [academyId]/layout.tsx
  if (segs[0] === "[academyId]") return true;

  return false;
}

/**
 * Walk the AST and return true if the file references any auth primitive.
 * We look for identifier references (not just declarations) so an import like
 * `import { withTenant } from "..."` does not on its own count unless it is
 * actually called.
 */
function fileHasAuthPrimitive(source: string, sf: ts.SourceFile): boolean {
  let found = false;

  const checkCallName = (name: string): boolean => {
    if (AUTH_PRIMITIVES.has(name)) return true;
    if (name === "getUser" || name === "getSession") return true;
    return false;
  };

  const visit = (node: ts.Node) => {
    if (found) return;

    // CallExpression: foo(...) where foo is a known auth primitive
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && checkCallName(callee.text)) {
        found = true;
        return;
      }
      // supabase.auth.getUser / .getSession
      if (ts.isPropertyAccessExpression(callee)) {
        const access = callee;
        if (
          ts.isIdentifier(access.name) &&
          checkCallName(access.name.text) &&
          ts.isPropertyAccessExpression(access.expression) &&
          ts.isIdentifier(access.expression.name) &&
          access.expression.name.text === "auth"
        ) {
          found = true;
          return;
        }
      }
      // fetch("/api/auth/check", ...) — string-literal first argument
      if (ts.isIdentifier(callee) && callee.text === "fetch") {
        const first = node.arguments[0];
        if (first && ts.isStringLiteralLike(first) && /\/api\/auth\/check/.test(first.text)) {
          found = true;
          return;
        }
      }
    }

    // redirect("...") — already covered above as it's a call expression.
    // Make sure recursing into nested function bodies still works.
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return found;
}

/**
 * Look for a parent layout.tsx walking from the page up to the App Router
 * root. The first one found is checked; if it has an auth primitive, the
 * page is shielded by it.
 */
function findParentLayoutWithAuth(absPage: string): { layoutPath: string; hasAuth: boolean } | null {
  let dir = path.dirname(absPage);
  while (dir.length >= APP_ROOT.length) {
    const candidate = path.join(dir, "layout.tsx");
    if (fs.existsSync(candidate)) {
      const { source, sf } = readSource(candidate);
      return { layoutPath: candidate, hasAuth: fileHasAuthPrimitive(source, sf) };
    }
    if (dir === APP_ROOT) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Detect the escape hatch above the default export. We accept a single-line
 * `// ...` comment immediately preceding the export; deeper decoration is
 * not needed for an opt-in marker.
 */
function hasEscapeHatch(source: string, sf: ts.SourceFile): boolean {
  let defaultExport: ts.Node | null = null;
  for (const stmt of sf.statements) {
    if (ts.isExportAssignment(stmt)) {
      defaultExport = stmt;
      break;
    }
    if (ts.isFunctionDeclaration(stmt) && stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      defaultExport = stmt;
      break;
    }
  }
  if (!defaultExport) return false;
  const start = defaultExport.getStart(sf);
  const preceding = source.slice(0, start);
  return ESCAPE_MARKER.test(preceding);
}

function scanFile(filePath: string): Finding[] {
  const findings: Finding[] = [];
  if (!isWhitelistedPage(filePath)) {
    const { source, sf } = readSource(filePath);
    const fileHasAuth = fileHasAuthPrimitive(source, sf);
    const parent = findParentLayoutWithAuth(filePath);
    const parentHasAuth = parent?.hasAuth ?? false;
    const escape = hasEscapeHatch(source, sf);

    if (!fileHasAuth && !parentHasAuth && !escape) {
      const where = parent
        ? `no auth primitive in this page and parent layout ${path.relative(
            process.cwd(),
            parent.layoutPath,
          )} has none either`
        : "no auth primitive in this page and no parent layout.tsx was found";
      findings.push(
        findingFromNode(
          "A4/orphan-app-route",
          sf,
          filePath,
          sf,
          `Page under src/app/app/<static>/... rendered without an auth guard — ${where}.`,
          "Add an auth primitive (supabase.auth.getUser, redirect, withTenant, etc.) to this page or a parent layout.tsx, or move the page under src/app/app/[academyId]/ so it inherits the canonical academy layout.",
        ),
      );
    }
  }
  return findings;
}

export { scanFile };

function main() {
  const roots = parseRoots();
  let scanned = 0;
  const findings: Finding[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      process.stderr.write(`[orphan-app-route] root does not exist: ${root}\n`);
      process.exitCode = 1;
      return;
    }
    for (const file of walkFiles(root, (p) => p.endsWith(".tsx") || p.endsWith(".ts"))) {
      // We only care about page.tsx entries — those are the App Router
      // surfaces Next.js will render. layout.tsx files are checked transitively
      // as parent guards, not as findings themselves.
      if (!file.endsWith(`${path.sep}page.tsx`) && !file.endsWith("/page.tsx")) continue;
      scanned += 1;
      findings.push(...safeScanFile(scanFile, file));
    }
  }
  emitReport("orphan-app-route", scanned, findings);
}

main();
