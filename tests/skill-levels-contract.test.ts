import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { SKILL_LEVELS_TABLES } from "@/modules/skill-levels/application/skill-level-service";
import {
  athleteLevelPasses,
  athleteSkillProgress,
  skillElements,
  skillLevels,
  skillTemplates,
} from "@/modules/skill-levels/infrastructure/skill-levels-schema";

/**
 * Contrato del candidato SQL de niveles y progresión. Las tablas no están en
 * supabase/migrations, así que este test protege que el candidato, el espejo
 * Drizzle y la detección de almacenamiento coincidan, que todas las tablas
 * tengan RLS forzado y REVOKE a clientes directos, que drizzle-kit no pueda
 * crearlas por su cuenta, que la bandera esté apagada por defecto y que las
 * rutas documenten su guard.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANDIDATE_FILE = "20261114120000_skill_levels_candidate.sql";
const CANDIDATE = `docs/deployment/candidates/${CANDIDATE_FILE}`;
const SCHEMA = "src/modules/skill-levels/infrastructure/skill-levels-schema.ts";
const TABLES = Object.keys(SKILL_LEVELS_TABLES).sort();

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

type CandidateColumn = { name: string; type: string; notNull: boolean; hasDefault: boolean };

const SQL_TYPES: Record<string, string> = {
  uuid: "uuid",
  text: "text",
  date: "date",
  integer: "integer",
  boolean: "boolean",
  timestamptz: "timestamp with time zone",
};

function tableBlocks(sql: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of stripSqlComments(sql).matchAll(/create table zaltyko\.([a-z_]+) \(\n([\s\S]*?)\n\);/g)) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

/** Columnas declaradas en cada `create table zaltyko.<name> (...)` del candidato. */
function candidateColumns(block: string): CandidateColumn[] {
  return block
    .split("\n")
    .map((line) => line.match(/^  ([a-z_]+) (uuid|text|date|integer|boolean|timestamptz)\b(.*)$/))
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

/** `constraint <nombre> check (<expresión>)`, con paréntesis equilibrados. */
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

describe("candidato SQL de niveles y progresión", () => {
  const sql = read(CANDIDATE);
  const lower = sql.toLowerCase();
  const blocks = tableBlocks(sql);

  it("se marca como pendiente de autorización y no está en el historial aplicable", () => {
    expect(lower).toContain("requiere autorización de elvis");
    expect(lower).toContain("candidate only");
    expect(lower).toContain("no aplicado en ningún entorno");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_FILE))).toBe(false);
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(
        /skill_(templates|levels|elements)|athlete_skill_progress|athlete_level_passes/
      );
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

  const drizzleTables = new Map(
    [skillTemplates, skillLevels, skillElements, athleteSkillProgress, athleteLevelPasses].map((table) => {
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
        ...SKILL_LEVELS_TABLES[table as keyof typeof SKILL_LEVELS_TABLES],
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
    // Las reglas de dominio que no dependen de la API.
    const templates = candidateChecks(blocks.get("skill_templates")!);
    expect(templates.get("skill_templates_name_check")).toContain("between 2 and 80");
    expect(templates.get("skill_templates_discipline_check")).toContain("'artistic_female', 'artistic_male', 'rhythmic'");
    expect(templates.get("skill_templates_starter_key_check")).toContain("(source = 'starter') = (starter_key is not null)");
    const progress = candidateChecks(blocks.get("athlete_skill_progress")!);
    expect(progress.get("athlete_skill_progress_status_check")).toContain("'not_started', 'in_progress', 'achieved'");
    // La fecha del logro existe si y solo si el elemento está conseguido.
    expect(progress.get("athlete_skill_progress_achieved_on_check")).toBe("(status = 'achieved') = (achieved_on is not null)");
  });

  it("nombra únicos e índices igual que el espejo y por debajo del límite de 63 caracteres", () => {
    const body = stripSqlComments(lower);
    for (const table of TABLES) {
      const config = drizzleTables.get(table)!;
      expect(config.uniqueConstraints.map((unique) => unique.getName()).sort(), table).toEqual(
        candidateUniques(blocks.get(table)!)
      );
      expect(config.indexes.length, table).toBeGreaterThan(0);
      for (const index of config.indexes) {
        expect(body, index.config.name).toContain(`create index ${index.config.name}\n  on zaltyko.${table}(`);
      }
    }
    const names = [...body.matchAll(/(?:constraint|create index) ([a-z_]+)/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(25);
    for (const name of names) expect(name.length, name).toBeLessThan(63);
    // Un paso de nivel por gimnasta y nivel; una marca por gimnasta y elemento.
    expect(names).toContain("athlete_level_passes_level_uq");
    expect(names).toContain("athlete_skill_progress_element_uq");
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
    // El elemento es de la plantilla de su nivel; el progreso y el paso, de la plantilla del elemento o nivel.
    expect(body).toContain(
      "foreign key (organization_id, template_id, level_id) references zaltyko.skill_levels(organization_id, template_id, id) on delete cascade"
    );
    expect(body).toContain(
      "foreign key (organization_id, template_id, element_id) references zaltyko.skill_elements(organization_id, template_id, id) on delete cascade"
    );
    // Lo de una gimnasta se borra con ella; la autoría del equipo no se borra a medias.
    expect(body).toContain("foreign key (organization_id, athlete_id) references zaltyko.athletes(organization_id, id) on delete cascade");
    expect(body).toMatch(/foreign key \(organization_id, passed_by_member_id\) references zaltyko\.organization_members\(organization_id, id\)\n/);
  });
});

describe("el esquema de niveles y progresión queda fuera de drizzle-kit y de validate:rls", () => {
  it("no se exporta desde los índices ni vive en src/db/schema", () => {
    for (const path of ["src/db/schema/index.ts", "src/db/zaltyko-schema.ts"]) {
      expect(read(path), path).not.toMatch(/skill-levels/);
    }
    expect(read("drizzle.config.ts")).not.toContain("skill-levels");
    const schemaDir = join(ROOT, "src/db/schema");
    for (const entry of readdirSync(schemaDir)) {
      const path = join(schemaDir, entry);
      if (statSync(path).isFile()) {
        expect(readFileSync(path, "utf8"), entry).not.toMatch(
          /"(skill_templates|skill_levels|skill_elements|athlete_skill_progress|athlete_level_passes)"/
        );
      }
    }
    expect(read(SCHEMA)).toContain("NO se exporta");
  });
});

describe("bandera apagada por defecto", () => {
  it("está documentada en .env.example con el valor false y vinculada al candidato", () => {
    const example = read(".env.example");
    expect(example).toMatch(/^ZALTYKO_SKILL_LEVELS_ENABLED=false$/m);
    expect(example).toContain(CANDIDATE_FILE);
  });

  it("el servidor comprueba la bandera antes de consultar el catálogo", () => {
    const storage = read("src/modules/skill-levels/application/skill-levels/storage.ts");
    expect(storage.indexOf("isSkillLevelsFlagOn()")).toBeGreaterThan(0);
    expect(storage.indexOf("isSkillLevelsFlagOn()")).toBeLessThan(storage.indexOf("return isSkillLevelsStorageInstalled(client)"));
    // Cada operación de acceso y cada lectura de familias pasan por la comprobación.
    expect(read("src/modules/skill-levels/application/skill-levels/access.ts")).toContain("assertSkillLevelsAvailable(tx)");
    expect(read("src/modules/skill-levels/application/skill-levels/reads.ts")).toMatch(
      /getFamilySkills[\s\S]*?isSkillLevelsAvailableForPage\(db\)[\s\S]*?getFamilyDiploma/
    );
  });

  it("las páginas de acceso solo se muestran con la función disponible", () => {
    expect(read("src/app/owner/skills/_lib/skills-scope.ts")).toContain("isSkillLevelsAvailableForPage(db)");
    for (const path of ["src/app/owner/groups/page.tsx", "src/app/owner/attendance/page.tsx"]) {
      expect(read(path), path).toContain("isSkillLevelsAvailableForPage(db)");
    }
    expect(read("src/app/familia/_lib/family-skills.ts")).toContain("getFamilySkills");
  });
});

describe("rutas API de niveles y progresión", () => {
  const routes = [
    "src/app/api/v1/owner/skill-templates/route.ts",
    "src/app/api/v1/owner/skill-templates/[templateId]/route.ts",
    "src/app/api/v1/owner/skill-evaluations/route.ts",
    "src/app/api/v1/owner/athletes/[athleteId]/skills/route.ts",
    "src/app/api/v1/owner/athletes/[athleteId]/skills/level-passes/route.ts",
    "src/app/api/v1/owner/groups/[groupId]/skills/route.ts",
    "src/app/api/v1/owner/sessions/[sessionId]/skills/route.ts",
  ];

  it("autentican, resuelven el alcance del equipo y documentan su guard", () => {
    expect(read("src/app/api/v1/owner/skill-levels-http.ts")).toContain("resolveProgressActor");
    expect(read("src/app/api/v1/owner/athlete-progress-http.ts")).toContain('surface: "coach_operations"');
    for (const route of routes) {
      const source = read(route);
      expect(source, route).toContain("getCurrentUser(request)");
      expect(source, route).toContain("resolveSkillActor(request");
      expect(source, route).toMatch(/@auth-flexible route-guard-reason: \S/);
      expect(source.indexOf("getCurrentUser(request)"), route).toBeLessThan(source.indexOf("safeParse("));
      const mutates = /export async function (?:POST|PUT)\b/.test(source);
      if (mutates) expect(source, route).toContain("sameOriginProblem(request)");
    }
  });
});
