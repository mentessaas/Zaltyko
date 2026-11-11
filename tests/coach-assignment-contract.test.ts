import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { COACH_ASSIGNMENT_TABLES } from "@/modules/coach-assignment/application/coach-assignment-service";
import {
  classTemplateStaff,
  sessionStaffOverrides,
} from "@/modules/coach-assignment/infrastructure/coach-assignment-schema";
import { SUBSTITUTION_REASONS } from "@/modules/coach-assignment/domain/coach-assignment";

/**
 * Contrato del candidato SQL de titulares y sustituciones (O1). Las tablas no
 * están en supabase/migrations, así que este test protege que el candidato, el
 * espejo Drizzle y la detección de almacenamiento coincidan, que ambas tablas
 * tengan RLS forzado y REVOKE a clientes directos, que drizzle-kit no pueda
 * crearlas por su cuenta y que session_staff, en la que se apoya, sí esté en
 * el historial aplicado.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANDIDATE_FILE = "20261111180000_coach_assignment_candidate.sql";
const CANDIDATE = `docs/deployment/candidates/${CANDIDATE_FILE}`;
const SCHEMA = "src/modules/coach-assignment/infrastructure/coach-assignment-schema.ts";
const TABLES = Object.keys(COACH_ASSIGNMENT_TABLES).sort();

const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, "");
const normalize = (expression: string) => expression.replace(/\s+/g, " ").trim().toLowerCase();

const SQL_TYPES: Record<string, string> = {
  uuid: "uuid",
  text: "text",
  timestamptz: "timestamp with time zone",
};

type CandidateColumn = { name: string; type: string; notNull: boolean; hasDefault: boolean };

function tableBlocks(sql: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of stripSqlComments(sql).matchAll(/create table zaltyko\.([a-z_]+) \(\n([\s\S]*?)\n\);/g)) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

function candidateColumns(block: string): CandidateColumn[] {
  return block
    .split("\n")
    .map((line) => line.match(/^  ([a-z_]+) (uuid|text|timestamptz)\b(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1],
      type: SQL_TYPES[match[2]],
      notNull: /\bnot null\b|\bprimary key\b/.test(match[3]),
      hasDefault: /\bdefault\b/.test(match[3]),
    }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function candidateChecks(block: string): Map<string, string> {
  const checks = new Map<string, string>();
  for (const match of block.matchAll(/constraint ([a-z_]+)\s+check \(/g)) {
    let depth = 1;
    let index = match.index! + match[0].length;
    const start = index;
    while (depth > 0) {
      const char = block[index++];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === undefined) throw new Error(`CHECK sin cerrar: ${match[1]}`);
    }
    checks.set(match[1], normalize(block.slice(start, index - 1)));
  }
  return checks;
}

const named = (block: string, kind: "unique" | "foreign key") =>
  [...block.matchAll(new RegExp(`constraint ([a-z_]+)\\s+${kind} \\(`, "g"))].map((match) => match[1]).sort();

describe("candidato SQL de titulares y sustituciones", () => {
  const sql = read(CANDIDATE);
  const lower = sql.toLowerCase();
  const blocks = tableBlocks(sql);
  const drizzleTables = new Map(
    [classTemplateStaff, sessionStaffOverrides].map((table) => {
      const config = getTableConfig(table);
      return [config.name, config] as const;
    })
  );
  const dialect = new PgDialect();

  it("se marca como pendiente de autorización y no está en el historial aplicable", () => {
    expect(lower).toContain("requiere autorización de elvis");
    expect(lower).toContain("candidate only");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_FILE))).toBe(false);
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(/class_template_staff|session_staff_overrides/);
    }
    const readme = read("docs/deployment/candidates/README.md");
    expect(readme).toContain(CANDIDATE_FILE);
    expect(readme.toLowerCase()).toContain("requiere autorización de elvis");
  });

  it("se apoya en session_staff, que sí está aplicada en supabase/migrations", () => {
    const foundation = read("supabase/migrations/20261006080702_establish_zaltyko_domain_foundation.sql");
    expect(foundation).toContain("create table zaltyko.session_staff (");
    expect(foundation).toContain("constraint session_staff_uq unique (organization_id, session_id, staff_profile_id)");
    expect(foundation).toMatch(/'sessions', 'session_staff'/);
    expect(stripSqlComments(lower)).not.toMatch(/(create|alter|drop) table zaltyko\.session_staff\b/);
  });

  it("aborta si cualquiera de las tablas ya existe, antes de crear nada", () => {
    const preflight = lower.indexOf("raise exception");
    expect(preflight).toBeGreaterThan(0);
    expect(preflight).toBeLessThan(lower.indexOf("create table"));
    for (const table of TABLES) {
      expect(lower.slice(0, preflight)).toContain(`to_regclass('zaltyko.${table}') is not null`);
    }
  });

  it("crea exactamente las tablas, columnas, tipos, NOT NULL y defaults del espejo y de la detección", () => {
    expect([...blocks.keys()].sort()).toEqual(TABLES);
    expect([...drizzleTables.keys()].sort()).toEqual(TABLES);
    for (const table of TABLES) {
      const columns = candidateColumns(blocks.get(table)!);
      const config = drizzleTables.get(table)!;
      expect(config.schema, table).toBe("zaltyko");
      expect(columns.map((column) => column.name), table).toEqual([
        ...COACH_ASSIGNMENT_TABLES[table as keyof typeof COACH_ASSIGNMENT_TABLES],
      ]);
      const drizzleColumns = config.columns
        .map((column) => ({
          name: column.name,
          type: column.getSQLType(),
          notNull: column.notNull,
          hasDefault: column.hasDefault,
        }))
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
      expect(drizzleColumns, table).toEqual(columns);
    }
  });

  it("repite en Drizzle los CHECK, únicos, índices y FK con los mismos nombres", () => {
    const body = stripSqlComments(lower);
    for (const table of TABLES) {
      const block = blocks.get(table)!;
      const config = drizzleTables.get(table)!;
      const drizzleChecks = Object.fromEntries(
        config.checks.map((check) => [check.name, normalize(dialect.sqlToQuery(check.value).sql)])
      );
      expect(drizzleChecks, table).toEqual(Object.fromEntries(candidateChecks(block)));
      expect(config.uniqueConstraints.map((unique) => unique.getName()).sort(), table).toEqual(named(block, "unique"));
      expect(config.foreignKeys.map((fk) => fk.getName()).filter((name) => !name.endsWith("_organizations_id_fk")).sort(), table).toEqual(
        named(block, "foreign key")
      );
      for (const index of config.indexes) {
        expect(body, index.config.name).toContain(`create index ${index.config.name}\n  on zaltyko.${table}(`);
      }
    }
    const names = [...body.matchAll(/(?:constraint|create index) ([a-z_]+)/g)].map((match) => match[1]);
    for (const name of names) expect(name.length, name).toBeLessThan(63);
  });

  it("ningún borrado queda bloqueado: cascada en asignaciones y SET NULL de una columna en quien asignó", () => {
    const body = stripSqlComments(lower);
    expect(body).not.toMatch(/on delete restrict|on delete no action/);
    const fkOnDelete = (block: string) =>
      new Map(
        [...block.matchAll(/constraint ([a-z_]+)\s+foreign key \([^)]*\) references [^\n]*? on delete (cascade|set null)(?: \(([a-z_]+)\))?/g)].map(
          (match) => [match[1], { action: match[2], columns: match[3] ?? null }] as const
        )
      );
    const expected: Record<string, { action: string; columns: string | null }> = {
      class_template_staff_template_fk: { action: "cascade", columns: null },
      class_template_staff_profile_fk: { action: "cascade", columns: null },
      class_template_staff_member_fk: { action: "set null", columns: "assigned_by_member_id" },
      session_staff_overrides_session_fk: { action: "cascade", columns: null },
      session_staff_overrides_member_fk: { action: "set null", columns: "changed_by_member_id" },
    };
    const found = new Map([...blocks.values()].flatMap((block) => [...fkOnDelete(block)]));
    expect(Object.fromEntries(found)).toEqual(expected);
    // El espejo Drizzle repite la acción (sin la lista de columnas, que no sabe expresar).
    for (const table of TABLES) {
      for (const fk of drizzleTables.get(table)!.foreignKeys) {
        const name = fk.getName();
        if (name.endsWith("_organizations_id_fk")) continue;
        expect(fk.onDelete, name).toBe(expected[name]!.action);
      }
    }
    // Las columnas que pasan a null al borrar el miembro admiten null.
    for (const [table, column] of [
      ["class_template_staff", "assigned_by_member_id"],
      ["session_staff_overrides", "changed_by_member_id"],
    ] as const) {
      expect(candidateColumns(blocks.get(table)!).find((item) => item.name === column)?.notNull, column).toBe(false);
    }
  });

  it("retira el acceso directo de anon y authenticated a session_staff, que pasa a tener datos", () => {
    const body = stripSqlComments(lower);
    expect(body).toContain("revoke all on table zaltyko.session_staff from anon, authenticated;");
    const foundation = read("supabase/migrations/20261006080702_establish_zaltyko_domain_foundation.sql");
    expect(foundation).toMatch(/grant select on table[\s\S]*zaltyko\.session_staff,[\s\S]*to authenticated;/);
    // La detección exige ese REVOKE: sin él la función sigue dormida.
    const storage = read("src/modules/coach-assignment/application/coach-assignment/storage.ts");
    expect(storage).toContain("has_table_privilege(r.oid, 'zaltyko.session_staff', 'SELECT,INSERT,UPDATE,DELETE')");
  });

  it("el motivo es un código cerrado igual al del dominio, sin columna de texto libre", () => {
    const reason = candidateChecks(blocks.get("session_staff_overrides")!).get("session_staff_overrides_reason_check");
    expect(reason).toBe(
      normalize(`reason is null or reason in (${SUBSTITUTION_REASONS.map((value) => `'${value}'`).join(", ")})`)
    );
    for (const table of TABLES) {
      expect(blocks.get(table)!, table).not.toMatch(/\b(note|notes|comment|body|description)\b/);
    }
  });

  it("habilita y fuerza RLS y revoca a public, anon y authenticated en todas, sin políticas ni grants", () => {
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
      const references = [...block.matchAll(/foreign key \(([^)]*)\) references zaltyko\.([a-z_]+)/g)];
      expect(references.length, table).toBeGreaterThan(1);
      for (const reference of references) {
        expect(reference[1].startsWith("organization_id,"), `${table} → ${reference[2]}`).toBe(true);
      }
    }
    expect(body).toContain(
      "foreign key (organization_id, staff_profile_id) references zaltyko.staff_profiles(organization_id, id) on delete cascade"
    );
    expect(body).toContain(
      "foreign key (organization_id, session_id) references zaltyko.sessions(organization_id, id) on delete cascade"
    );
  });
});

describe("el esquema de titulares queda fuera de drizzle-kit y de validate:rls", () => {
  it("no se exporta desde los índices ni vive en src/db/schema", () => {
    for (const path of ["src/db/schema/index.ts", "src/db/zaltyko-schema.ts"]) {
      expect(read(path), path).not.toMatch(/coach-assignment/);
    }
    expect(read("drizzle.config.ts")).not.toContain("coach-assignment");
    const schemaDir = join(ROOT, "src/db/schema");
    for (const entry of readdirSync(schemaDir)) {
      const path = join(schemaDir, entry);
      if (statSync(path).isFile()) {
        expect(readFileSync(path, "utf8"), entry).not.toMatch(/"class_template_staff"|"session_staff_overrides"/);
      }
    }
    expect(read(SCHEMA)).toContain("NO se exporta");
  });
});

describe("rutas API de titulares y sustituciones", () => {
  const routes = [
    "src/app/api/v1/owner/classes/[classTemplateId]/coaches/route.ts",
    "src/app/api/v1/owner/sessions/[sessionId]/coaches/route.ts",
  ];

  it("autentican antes de validar, documentan su guard y exigen mismo origen en las mutaciones", () => {
    for (const route of routes) {
      const source = read(route);
      expect(source, route).toContain("getCurrentUser(request)");
      expect(source.indexOf("getCurrentUser(request)"), route).toBeLessThan(source.indexOf("safeParse("));
      expect(source.match(/@auth-flexible route-guard-reason: \S/g)?.length, route).toBe(2);
      expect(source, route).toContain("export async function PUT");
      expect(source, route).toContain("sameOriginProblem(request)");
      expect(source, route).toContain("resolveManagementActor(request");
    }
  });

  it("solo la lectura de una sesión admite a la entrenadora, con el acceso de Pasar lista", () => {
    const http = read("src/app/api/v1/owner/coach-assignment-http.ts");
    expect(http).not.toContain("coach_operations");
    expect(http).toContain("resolveSessionAttendanceAccess(input)");
    expect(read(routes[0])).not.toContain("resolveSessionReader");
    const session = read(routes[1]);
    expect(session.indexOf("resolveSessionReader(request")).toBeLessThan(session.indexOf("export async function PUT"));
    expect(session.slice(session.indexOf("export async function PUT"))).not.toContain("resolveSessionReader");
  });

  it("las rutas y las páginas solo importan la fachada", () => {
    for (const path of [
      ...routes,
      "src/app/owner/attendance/page.tsx",
      "src/app/owner/classes/page.tsx",
      "src/app/owner/page.tsx",
      "src/modules/scheduling/application/session-service.ts",
    ]) {
      const source = read(path);
      expect(source, path).not.toMatch(/coach-assignment\/application\/coach-assignment\//);
    }
  });
});
