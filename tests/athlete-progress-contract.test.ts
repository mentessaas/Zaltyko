import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { ATHLETE_PROGRESS_TABLES } from "@/modules/athlete-progress/application/athlete-progress-storage";
import {
  athleteObjectives,
  athleteObjectiveStatusHistory,
  athleteObservations,
} from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";

/**
 * Contrato del candidato SQL de objetivos y observaciones (P2 #17). Las tablas
 * no están en supabase/migrations, así que este test protege que el candidato,
 * el espejo Drizzle y la detección de almacenamiento coincidan, que todas las
 * tablas tengan RLS forzado y REVOKE a clientes directos, y que drizzle-kit no
 * pueda crearlas por su cuenta.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANDIDATE_FILE = "20261111120000_athlete_progress_candidate.sql";
const CANDIDATE = `docs/deployment/candidates/${CANDIDATE_FILE}`;
const SCHEMA = "src/modules/athlete-progress/infrastructure/athlete-progress-schema.ts";
const TABLES = Object.keys(ATHLETE_PROGRESS_TABLES).sort();

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Columnas declaradas en cada `create table zaltyko.<name> (...)` del candidato. */
function candidateColumns(sql: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const body = stripSqlComments(sql);
  for (const match of body.matchAll(/create table zaltyko\.([a-z_]+) \(\n([\s\S]*?)\n\);/g)) {
    const columns = match[2]
      .split("\n")
      .map((line) => line.match(/^  ([a-z_]+) (uuid|text|date|integer|timestamptz)\b/)?.[1])
      .filter((column): column is string => Boolean(column))
      .sort();
    tables.set(match[1], columns);
  }
  return tables;
}

describe("candidato SQL de objetivos y observaciones", () => {
  const sql = read(CANDIDATE);
  const lower = sql.toLowerCase();
  const created = candidateColumns(sql);

  it("se marca como pendiente de autorización y no está en el historial aplicable", () => {
    expect(lower).toContain("requiere autorización de elvis");
    expect(lower).toContain("candidate only");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_FILE))).toBe(false);
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(/athlete_(objectives|observations|objective_status_history)/);
    }
    expect(read("docs/deployment/candidates/README.md")).toContain(CANDIDATE_FILE);
  });

  it("aborta si cualquiera de las tablas ya existe, antes de crear nada", () => {
    const preflight = lower.indexOf("raise exception");
    expect(preflight).toBeGreaterThan(0);
    expect(preflight).toBeLessThan(lower.indexOf("create table"));
    for (const table of TABLES) {
      expect(lower.slice(0, preflight)).toContain(`to_regclass('zaltyko.${table}') is not null`);
    }
  });

  it("crea exactamente las tablas y columnas del espejo Drizzle y de la detección", () => {
    expect([...created.keys()].sort()).toEqual(TABLES);
    const drizzle = new Map(
      [athleteObjectives, athleteObjectiveStatusHistory, athleteObservations].map((table) => {
        const config = getTableConfig(table);
        expect(config.schema).toBe("zaltyko");
        return [config.name, config.columns.map((column) => column.name).sort()] as const;
      })
    );
    for (const table of TABLES) {
      expect(created.get(table), table).toEqual([...ATHLETE_PROGRESS_TABLES[table as keyof typeof ATHLETE_PROGRESS_TABLES]]);
      expect(drizzle.get(table), table).toEqual(created.get(table));
    }
  });

  it("habilita y fuerza RLS y revoca a public, anon y authenticated en todas", () => {
    for (const table of TABLES) {
      expect(lower, table).toContain(`alter table zaltyko.${table} enable row level security;`);
      expect(lower, table).toContain(`alter table zaltyko.${table} force row level security;`);
      expect(lower, table).toContain(`revoke all on table zaltyko.${table} from public, anon, authenticated;`);
    }
    expect(stripSqlComments(lower)).not.toMatch(/\bgrant\b/);
    expect(stripSqlComments(lower)).not.toMatch(/create policy/);
  });

  it("ancla cada tabla a la academia y las referencias a la misma academia", () => {
    const body = stripSqlComments(lower);
    for (const table of TABLES) {
      const block = body.match(new RegExp(`create table zaltyko\\.${table} \\(([\\s\\S]*?)\\n\\);`))![1];
      expect(block, table).toContain("organization_id uuid not null references zaltyko.organizations(id) on delete cascade");
      for (const reference of block.matchAll(/foreign key \(([^)]*)\) references zaltyko\.([a-z_]+)/g)) {
        expect(reference[1].startsWith("organization_id,"), `${table} → ${reference[2]}`).toBe(true);
      }
    }
    expect(body).toContain(
      "foreign key (organization_id, location_id, session_id) references zaltyko.sessions(organization_id, location_id, id)"
    );
    expect(body).toContain(
      "foreign key (organization_id, athlete_id, objective_id) references zaltyko.athlete_objectives(organization_id, athlete_id, id)"
    );
    expect(body).toContain("check (visibility in ('team', 'family'))");
    expect(body).toContain("check (status in ('in_progress', 'achieved', 'discarded'))");
  });
});

describe("el esquema de objetivos y observaciones queda fuera de drizzle-kit y de validate:rls", () => {
  it("no se exporta desde los índices ni vive en src/db/schema", () => {
    for (const path of ["src/db/schema/index.ts", "src/db/zaltyko-schema.ts"]) {
      expect(read(path), path).not.toMatch(/athlete-progress/);
    }
    expect(read("drizzle.config.ts")).not.toContain("athlete-progress");
    const schemaDir = join(ROOT, "src/db/schema");
    for (const entry of readdirSync(schemaDir)) {
      const path = join(schemaDir, entry);
      if (statSync(path).isFile()) {
        expect(readFileSync(path, "utf8"), entry).not.toMatch(/"athlete_(objectives|observations|objective_status_history)"/);
      }
    }
    expect(read(SCHEMA)).toContain("NO se exporta");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("el portal de familias no expone observaciones (decide Elvis)", () => {
  it("ningún archivo del portal lee objetivos u observaciones", () => {
    const roots = ["src/modules/family-portal", "src/app/familia", "src/components/family-portal"].filter((root) =>
      existsSync(join(ROOT, root))
    );
    expect(roots.length).toBeGreaterThan(0);
    for (const file of roots.flatMap((root) => sourceFiles(join(ROOT, root)))) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(ROOT, file)).not.toMatch(/athlete[-_]?progress|athlete_observations|athleteObservations|athlete_objectives/i);
    }
  });
});

describe("rutas API de objetivos y observaciones", () => {
  const routes = [
    "src/app/api/v1/owner/athletes/[athleteId]/progress/route.ts",
    "src/app/api/v1/owner/athletes/[athleteId]/objectives/route.ts",
    "src/app/api/v1/owner/athletes/[athleteId]/objectives/[objectiveId]/status/route.ts",
    "src/app/api/v1/owner/athletes/[athleteId]/observations/route.ts",
    "src/app/api/v1/owner/athletes/[athleteId]/observations/[observationId]/route.ts",
    "src/app/api/v1/owner/sessions/[sessionId]/observations/route.ts",
  ];

  it("autentican, resuelven el alcance con la superficie operativa y documentan su guard", () => {
    expect(read("src/app/api/v1/owner/athlete-progress-http.ts")).toContain('surface: "coach_operations"');
    for (const route of routes) {
      const source = read(route);
      expect(source, route).toContain("getCurrentUser(request)");
      expect(source, route).toContain("resolveProgressActor(request");
      expect(source, route).toMatch(/@auth-flexible route-guard-reason: \S/);
      expect(source.indexOf("getCurrentUser(request)"), route).toBeLessThan(source.indexOf("safeParse("));
      if (!route.endsWith("progress/route.ts")) expect(source, route).toContain("sameOriginProblem(request)");
    }
  });
});
