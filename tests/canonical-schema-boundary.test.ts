import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Canonical code must read the rebuilt domain through `@/db/zaltyko-schema`
 * (or the zaltyko-* schema files), never the legacy schema. Mirrors the
 * no-restricted-imports rule in eslint.config.mjs, and also catches relative
 * imports that the alias-based lint rule cannot see.
 */
const CANONICAL_ROOTS = [
  "src/modules",
  "src/app/owner",
  "src/components/owner-dashboard",
  "src/app/api/v1",
];

/** Reviewed exceptions: file → legacy specifier and why. */
const ALLOWED_LEGACY_IMPORTS: Record<string, { specifier: string; reason: string }> = {
  "src/modules/saas-billing/application/reconciliation-service.ts": {
    specifier: "@/db/schema/profiles",
    reason: "Platform identity: super-admin role and suspension live only in the legacy profiles table.",
  },
};

const CANONICAL_SCHEMA_FILE = /(?:^|\/)db\/schema\/(?:zaltyko-[^/]+|owner-signup-consent)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function legacySchemaImports(source: string): string[] {
  const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(match => match[1]);
  return specifiers.filter(specifier => {
    const normalized = specifier.replace(/\.(?:ts|tsx|js)$/, "").replace(/\/index$/, "");
    if (!/(?:^@\/|^(?:\.\.?\/)+)(?:.*\/)?db\/schema(?:\/|$)/.test(normalized)) return false;
    return !CANONICAL_SCHEMA_FILE.test(normalized);
  });
}

describe("canonical schema boundary", () => {
  const files = CANONICAL_ROOTS.flatMap(root => sourceFiles(join(process.cwd(), root)))
    .map(file => relative(process.cwd(), file).split(sep).join("/"));

  it("scans the canonical code", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("does not import the legacy schema outside the reviewed exceptions", () => {
    const violations = files.flatMap(file =>
      legacySchemaImports(readFileSync(join(process.cwd(), file), "utf8"))
        .filter(specifier => ALLOWED_LEGACY_IMPORTS[file]?.specifier !== specifier)
        .map(specifier => `${file}: ${specifier}`)
    );
    expect(violations).toEqual([]);
  });

  it("keeps every exception real and documented in the source", () => {
    for (const [file, { specifier }] of Object.entries(ALLOWED_LEGACY_IMPORTS)) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(legacySchemaImports(source), file).toContain(specifier);
      expect(source, file).toMatch(/eslint-disable-next-line no-restricted-imports -- \S/);
    }
  });

  it("recognises legacy and canonical specifiers", () => {
    expect(legacySchemaImports(`import { a } from "@/db/schema";`)).toEqual(["@/db/schema"]);
    expect(legacySchemaImports(`import { a } from "@/db/schema/athletes";`)).toEqual(["@/db/schema/athletes"]);
    expect(legacySchemaImports(`import { a } from "../../db/schema/index";`)).toEqual(["../../db/schema/index"]);
    expect(legacySchemaImports(`import { a } from "@/db/zaltyko-schema";`)).toEqual([]);
    expect(legacySchemaImports(`import { a } from "@/db/schema/zaltyko-core";`)).toEqual([]);
    expect(legacySchemaImports(`import { a } from "@/db/schema/owner-signup-consent";`)).toEqual([]);
  });
});
