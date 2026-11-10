import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contrato de seguridad del panel de competencia. Las tablas `ci_*` no están en
 * `supabase/migrations` y scripts/validate-rls.ts solo exige RLS a tablas con
 * tenant u organización, así que este test protege el candidato SQL, que el
 * esquema no llegue a drizzle-kit y que todas las rutas exijan super-admin.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANDIDATE =
  "docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql";
const SCHEMA = "src/db/schema/competitive-intelligence.ts";
const ROUTES_DIR = "src/app/api/super-admin/competencia";

function schemaTables(): string[] {
  return [...read(SCHEMA).matchAll(/pgTable\(\s*"(ci_[a-z_]+)"/g)]
    .map((match) => match[1])
    .sort();
}

describe("candidato SQL de inteligencia competitiva", () => {
  const sql = read(CANDIDATE).toLowerCase();
  const created = [...sql.matchAll(/create table public\.(ci_[a-z_]+)/g)]
    .map((match) => match[1])
    .sort();

  it("crea exactamente las mismas tablas ci_* que el esquema Drizzle", () => {
    expect(created.length).toBeGreaterThanOrEqual(8);
    expect(created).toEqual(schemaTables());
  });

  it("habilita y fuerza RLS y revoca a public, anon y authenticated en todas", () => {
    const loop = sql.match(
      /foreach relation in array array\[([\s\S]*?)\] loop([\s\S]*?)end loop;/
    );
    expect(loop, "falta el bucle de RLS").not.toBeNull();
    const listed = [...loop![1].matchAll(/'(ci_[a-z_]+)'/g)]
      .map((match) => match[1])
      .sort();
    expect(listed).toEqual(created);

    const body = loop![2];
    for (const statement of [
      "alter table public.%i enable row level security",
      "alter table public.%i force row level security",
      "revoke all on table public.%i from public",
      "revoke all on table public.%i from anon",
      "revoke all on table public.%i from authenticated",
      "as restrictive for all to authenticated using (false) with check (false)",
    ]) {
      expect(body, statement).toContain(statement);
    }
    expect(body).not.toMatch(/grant [^;]* to (anon|authenticated)/);
  });

  it("solo acepta webs y fuentes http(s) y se marca como pendiente de autorización", () => {
    expect(sql).toContain("check (website is null or website ~* '^https?://')");
    expect(sql).toContain("check (url ~ '^https?://')");
    expect(sql).toContain("requiere autorización de elvis");
  });
});

describe("el esquema ci_* queda fuera de drizzle-kit", () => {
  it("no se exporta desde los índices que lee drizzle.config.ts", () => {
    for (const path of ["src/db/schema/index.ts", "src/db/zaltyko-schema.ts"]) {
      expect(read(path), path).not.toMatch(
        /export \* from ["'][^"']*competitive-intelligence["']/
      );
    }
    expect(read("drizzle.config.ts")).not.toContain("competitive-intelligence");
  });
});

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === "route.ts" ? [path] : [];
  });
}

describe("rutas API del panel de competencia", () => {
  const files = routeFiles(join(ROOT, ROUTES_DIR));

  it("todas las rutas exportan solo handlers envueltos en withSuperAdmin", () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
    let handlers = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const name = relative(ROOT, file);
      expect(source, name).not.toMatch(
        /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/
      );
      const exported = [
        ...source.matchAll(
          /export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*([A-Za-z]+)\(/g
        ),
      ];
      expect(exported.length, name).toBeGreaterThan(0);
      for (const match of exported) {
        expect(match[2], `${name} ${match[1]}`).toBe("withSuperAdmin");
        handlers += 1;
      }
      expect(source, name).toContain("@resource-scope super-admin");
    }
    expect(handlers).toBeGreaterThanOrEqual(17);
  });
});
