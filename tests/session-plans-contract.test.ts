import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { SESSION_PLAN_TABLES } from "@/modules/session-plans/application/session-plan-service";
import {
  classPlanTemplates,
  sessionPlanBlocks,
  sessionPlanObjectives,
  sessionPlans,
} from "@/modules/session-plans/infrastructure/session-plan-schema";

/**
 * Contrato del candidato SQL de planificación sobre sesiones (P2 #17, segunda
 * parte). Las tablas no están en supabase/migrations, así que este test
 * protege que el candidato, el espejo Drizzle y la detección coincidan, que
 * todas tengan RLS forzado y REVOKE, y que drizzle-kit no pueda crearlas.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANDIDATE_FILE = "20261111200000_session_plans_candidate.sql";
const CANDIDATE = `docs/deployment/candidates/${CANDIDATE_FILE}`;
const SCHEMA = "src/modules/session-plans/infrastructure/session-plan-schema.ts";
const TABLES = Object.keys(SESSION_PLAN_TABLES).sort();

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

type CandidateColumn = { name: string; type: string; notNull: boolean; hasDefault: boolean };

const SQL_TYPES: Record<string, string> = {
  uuid: "uuid",
  text: "text",
  integer: "integer",
  jsonb: "jsonb",
  timestamptz: "timestamp with time zone",
};

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
    .map((line) => line.match(/^  ([a-z_]+) (uuid|text|integer|jsonb|timestamptz)\b(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1],
      type: SQL_TYPES[match[2]],
      notNull: /\bnot null\b|\bprimary key\b/.test(match[3]),
      hasDefault: /\bdefault\b/.test(match[3]),
    }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

const normalize = (expression: string) => expression.replace(/\s+/g, " ").trim().toLowerCase();

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

function candidateUniques(block: string): string[] {
  return [...block.matchAll(/constraint ([a-z_]+) unique \(/g)].map((match) => match[1]).sort();
}

describe("candidato SQL de planificación sobre sesiones", () => {
  const sql = read(CANDIDATE);
  const lower = sql.toLowerCase();
  const body = stripSqlComments(lower);
  const blocks = tableBlocks(sql);

  it("se marca como pendiente de autorización y no está en el historial aplicable", () => {
    expect(lower).toContain("requiere autorización de elvis");
    expect(lower).toContain("candidate only");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_FILE))).toBe(false);
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(/session_plan|class_plan_templates/);
    }
    expect(read("docs/deployment/candidates/README.md")).toContain(CANDIDATE_FILE);
  });

  it("exige antes el candidato de objetivos y aborta si alguna tabla ya existe, antes de crear nada", () => {
    const firstCreate = body.indexOf("create table");
    const preflight = body.slice(0, firstCreate);
    expect(preflight).toContain("if to_regclass('zaltyko.athlete_objectives') is null then");
    expect(preflight.match(/raise exception/g)).toHaveLength(2);
    for (const table of TABLES) {
      expect(preflight, table).toContain(`to_regclass('zaltyko.${table}') is not null`);
    }
  });

  const drizzleTables = new Map(
    [sessionPlans, sessionPlanBlocks, sessionPlanObjectives, classPlanTemplates].map((table) => {
      const config = getTableConfig(table);
      return [config.name, config] as const;
    })
  );
  const dialect = new PgDialect();

  it("crea exactamente las tablas, columnas, tipos, NOT NULL y defaults del espejo y de la detección", () => {
    expect([...blocks.keys()].sort()).toEqual(TABLES);
    expect([...drizzleTables.keys()].sort()).toEqual(TABLES);
    for (const table of TABLES) {
      const columns = candidateColumns(blocks.get(table)!);
      const config = drizzleTables.get(table)!;
      expect(config.schema, table).toBe("zaltyko");
      expect(columns.map((column) => column.name), table).toEqual([
        ...SESSION_PLAN_TABLES[table as keyof typeof SESSION_PLAN_TABLES],
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

  it("repite en Drizzle cada CHECK con el mismo nombre y la misma expresión", () => {
    for (const table of TABLES) {
      const sqlChecks = candidateChecks(blocks.get(table)!);
      const drizzleChecks = new Map(
        drizzleTables.get(table)!.checks.map((check) => [check.name, normalize(dialect.sqlToQuery(check.value).sql)])
      );
      expect(Object.fromEntries(drizzleChecks), table).toEqual(Object.fromEntries(sqlChecks));
    }
    const planBlocks = candidateChecks(blocks.get("session_plan_blocks")!);
    expect(planBlocks.get("session_plan_blocks_position_check")).toBe("position >= 1 and position <= 20");
    expect(planBlocks.get("session_plan_blocks_apparatus_check")).toContain("discipline = 'gr'");
    expect(planBlocks.get("session_plan_blocks_done_check")).toContain("done_by_member_id is not null");
    expect(candidateChecks(blocks.get("class_plan_templates")!).get("class_plan_templates_blocks_check")).toContain(
      "jsonb_array_length(blocks) <= 20"
    );
  });

  it("nombra únicos, clave primaria e índices igual que el espejo y por debajo de 63 caracteres", () => {
    for (const table of TABLES) {
      const config = drizzleTables.get(table)!;
      expect(config.uniqueConstraints.map((unique) => unique.getName()).sort(), table).toEqual(
        candidateUniques(blocks.get(table)!)
      );
      for (const index of config.indexes) {
        expect(body, index.config.name).toContain(`create index ${index.config.name}\n  on zaltyko.${table}(`);
      }
    }
    const objectives = drizzleTables.get("session_plan_objectives")!;
    expect(objectives.primaryKeys.map((key) => key.getName())).toEqual(["session_plan_objectives_pkey"]);
    expect(body).toContain(
      "constraint session_plan_objectives_pkey primary key (organization_id, plan_id, objective_id)"
    );
    const names = [...body.matchAll(/(?:constraint|create index) ([a-z_]+)/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) expect(name.length, name).toBeLessThan(63);
  });

  it("un plan por sesión, una plantilla por clase y el alta idempotente por petición", () => {
    expect(body).toContain("constraint session_plans_session_uq unique (organization_id, session_id)");
    expect(body).toContain("constraint session_plans_request_uq unique (organization_id, client_request_id)");
    expect(body).toContain("constraint class_plan_templates_class_uq unique (organization_id, class_template_id)");
    // Diferida: editar reordena los bloques en su sitio sin borrarlos.
    expect(body).toContain(
      "constraint session_plan_blocks_position_uq unique (organization_id, plan_id, position) deferrable initially deferred,"
    );
    expect(body).toContain("last_request_id uuid not null,");
  });

  it("ancla cada tabla a la academia y cada referencia a la misma academia y sede", () => {
    for (const table of TABLES) {
      const block = body.match(new RegExp(`create table zaltyko\\.${table} \\(([\\s\\S]*?)\\n\\);`))![1];
      expect(block, table).toContain("organization_id uuid not null references zaltyko.organizations(id) on delete cascade");
      for (const reference of block.matchAll(/foreign key \(([^)]*)\) references zaltyko\.([a-z_]+)/g)) {
        expect(reference[1].startsWith("organization_id,"), `${table} → ${reference[2]}`).toBe(true);
      }
    }
    // La sesión y la clase son de la misma sede que el plan y la plantilla.
    const sessionFk = body.match(
      /foreign key \(organization_id, location_id, session_id\) references zaltyko\.sessions\(organization_id, location_id, id\)[^\n]*/
    )![0];
    expect(sessionFk).not.toMatch(/on delete/);
    expect(sql).toContain("ninguna sesión se");
    expect(body).toContain(
      "foreign key (organization_id, location_id, class_template_id) references zaltyko.class_templates(organization_id, location_id, id) on delete cascade"
    );
    expect(body).toContain(
      "foreign key (organization_id, athlete_id, objective_id) references zaltyko.athlete_objectives(organization_id, athlete_id, id) on delete cascade"
    );
  });

  it("habilita y fuerza RLS y revoca a public, anon y authenticated en todas", () => {
    for (const table of TABLES) {
      expect(lower, table).toContain(`alter table zaltyko.${table} enable row level security;`);
      expect(lower, table).toContain(`alter table zaltyko.${table} force row level security;`);
      expect(lower, table).toContain(`revoke all on table zaltyko.${table} from public, anon, authenticated;`);
    }
    expect(body).not.toMatch(/\bgrant\b/);
    expect(body).not.toMatch(/create policy/);
  });
});

describe("el esquema de planificación queda fuera de drizzle-kit y de validate:rls", () => {
  it("no se exporta desde los índices ni vive en src/db/schema", () => {
    for (const path of ["src/db/schema/index.ts", "src/db/zaltyko-schema.ts"]) {
      expect(read(path), path).not.toMatch(/session-plans|session-plan-schema/);
    }
    expect(read("drizzle.config.ts")).not.toContain("session-plan");
    const schemaDir = join(ROOT, "src/db/schema");
    for (const entry of readdirSync(schemaDir)) {
      const path = join(schemaDir, entry);
      if (statSync(path).isFile()) {
        expect(readFileSync(path, "utf8"), entry).not.toMatch(/"(session_plans|session_plan_blocks|session_plan_objectives|class_plan_templates)"/);
      }
    }
    expect(read(SCHEMA)).toContain("NO se exporta");
  });
});

describe("rutas API de planificación", () => {
  const sessionRoutes = [
    "src/app/api/v1/owner/sessions/[sessionId]/plan/route.ts",
    "src/app/api/v1/owner/sessions/[sessionId]/plan/blocks/[blockId]/route.ts",
  ];
  const templateRoute = "src/app/api/v1/owner/classes/[classTemplateId]/plan-template/route.ts";

  it("autentican antes de validar, resuelven el alcance y documentan su guard", () => {
    for (const route of [...sessionRoutes, templateRoute]) {
      const source = read(route);
      expect(source, route).toContain("getCurrentUser(request)");
      expect(source, route).toContain("resolvePlanActor(request");
      expect(source, route).toMatch(/@auth-flexible route-guard-reason: \S/);
      expect(source.indexOf("getCurrentUser(request)"), route).toBeLessThan(source.indexOf("safeParse("));
      if (source.includes("export async function PUT")) expect(source, route).toContain("sameOriginProblem(request)");
    }
  });

  it("el plan de la sesión usa la superficie operativa; la plantilla, la de gestión", () => {
    for (const route of sessionRoutes) {
      const source = read(route);
      expect(source.match(/surface: "session"/g)?.length, route).toBe(source.match(/resolvePlanActor\(request/g)?.length);
      expect(source, route).not.toContain('surface: "class_template"');
    }
    const template = read(templateRoute);
    expect(template).toContain('surface: "class_template"');
    expect(template).not.toContain('surface: "session"');
    const helper = read("src/app/api/v1/owner/session-plan-http.ts");
    expect(helper).toContain('input.surface === "session" ? { surface: "coach_operations" as const } : {}');
  });

  it("la detección exige la unicidad de posición diferida y distingue las violaciones de unicidad", () => {
    const storage = read("src/modules/session-plans/application/session-plan/storage.ts");
    expect(storage).toContain("con.condeferrable and con.condeferred");
    expect(storage).toContain("con.conname = 'session_plan_blocks_position_uq'");
    expect(storage).toMatch(/\$\{allColumnsMatch\}\s+and \$\{positionDeferred\}/);
    const plans = read("src/modules/session-plans/application/session-plan/plans.ts");
    const mapping = plans.slice(plans.indexOf("function uniqueViolation"), plans.indexOf("async function loadPlan"));
    expect(mapping).toContain('cause.constraint === "session_plans_session_uq"');
    expect(mapping).toContain('cause.constraint === "session_plans_request_uq") return idempotencyConflict();');
    expect(mapping).toContain('"CONCURRENCY_RETRY"');
  });

  it("lee los objetivos por la fachada de athlete-progress, no por su infraestructura", () => {
    const dir = "src/modules/session-plans/application/session-plan";
    for (const file of readdirSync(join(ROOT, dir))) {
      const source = read(`${dir}/${file}`);
      expect(source, file).not.toContain("athlete-progress/infrastructure");
      expect(source, file).not.toMatch(/athleteObjectives\b/);
    }
    expect(read(`${dir}/plans.ts`)).toContain('from "@/modules/athlete-progress/application/athlete-progress-service"');
  });

  it("marcar un bloque y guardar el guion toman el mismo cerrojo por sesión", () => {
    const plans = read("src/modules/session-plans/application/session-plan/plans.ts");
    const lockCalls = plans.match(/await lockCommand\(tx, organizationId, planLockKey\(session\.id\)\);/g) ?? [];
    expect(lockCalls).toHaveLength(2);
    const mark = plans.slice(plans.indexOf("export async function markSessionPlanBlock"));
    expect(mark.indexOf("planLockKey(session.id)")).toBeLessThan(mark.indexOf("loadPlan("));
  });

  it("el guion no depende de quién está asignado a la sesión (criterio de Pasar lista)", () => {
    const dir = "src/modules/session-plans/application/session-plan";
    const files = readdirSync(join(ROOT, dir));
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      // Solo el código: los comentarios explican precisamente que no se usa.
      const code = read(`${dir}/${file}`).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(code, file).not.toMatch(/sessionStaff|session_staff/);
    }
  });
});
