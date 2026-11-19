import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACTIVATED_MODULES_ERASURE_POLICY,
  type ActivatedTableErasurePolicy,
  type ErasureEffect,
} from "@/modules/data-rights/application/activated-modules-erasure-policy";
import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES,
  CLASS_PLAN_TEMPLATE_BLOCK_FIELDS,
  CLASS_PLAN_TEMPLATE_BLOCK_OPTIONAL_FIELDS,
  INTERNAL_NON_CUSTOMER_TABLES,
  OPTIONAL_EXPORT_MODULE_GROUPS,
  OPTIONAL_FAMILY_COLLECTION_EVENTS_EXPORT_TABLES,
  OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES,
  OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES,
  OPTIONAL_INCLUDED_EXPORT_MODULES,
  OPTIONAL_INCLUDED_EXPORT_TABLES,
  OPTIONAL_SHARED_CATALOG_TABLES,
  OPTIONAL_TEAM_ACCESS_EXPORT_TABLES,
} from "@/modules/data-rights/application/catalog";
import {
  REVIEWED_DISPOSITION_OPTIONAL_GROUPS,
  REVIEWED_DISPOSITION_OPTIONAL_INCLUDED_MODULES,
  REVIEWED_DISPOSITION_OPTIONAL_SHARED_CATALOGS,
} from "@/modules/data-rights/application/canonical-disposition-policy";
import { CONTENT_NOTICE_SENDER_RETENTION_DAYS } from "@/modules/element-library/domain/element-library";
import { normalizeTemplateBlock } from "@/modules/session-plans/domain/session-plan";

/**
 * Contrato de derechos de datos de las funciones activadas el 12-11-2026.
 * Lee el SQL (historial aplicado y candidatos aplicados fuera de banda) y
 * exige que toda tabla zaltyko.* tenga una clasificación de exportación, que
 * las columnas exportadas coincidan con el SQL y que la política de supresión
 * declarada sea exactamente lo que hacen sus claves foráneas.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const sqlFiles = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => `${dir}/${name}`);
const ALL_SQL = [...sqlFiles("supabase/migrations"), ...sqlFiles("docs/deployment/candidates")];
const CANDIDATES = {
  athlete_progress: "docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql",
  coach_assignment: "docs/deployment/candidates/20261111180000_coach_assignment_candidate.sql",
  session_plans: "docs/deployment/candidates/20261111200000_session_plans_candidate.sql",
  skill_levels: "docs/deployment/candidates/20261114121000_skill_levels_candidate.sql",
  admissions: "docs/deployment/candidates/20261110120000_admission_requests_candidate.sql",
  team_access: "docs/deployment/candidates/20261105120000_canonical_team_access_candidate.sql",
  payment_reminders: "docs/deployment/candidates/20261114120500_payment_reminders_candidate.sql",
  family_access: "docs/deployment/candidates/20261114121500_family_access_notices_candidate.sql",
  element_library: "docs/deployment/candidates/20261119120500_element_library_notes_candidate.sql",
} as const;
/**
 * Biblioteca de elementos (sin aplicar): crea los catálogos globales y el
 * registro de avisos (OPTIONAL_SHARED_CATALOG_TABLES) y añade
 * catalog_element_id a skill_elements y session_plan_blocks
 * (laterCandidateColumns de esas tablas incluidas).
 */
const ELEMENT_LIBRARY = "docs/deployment/candidates/20261119120000_element_library_candidate.sql";
/**
 * Cobro automático, Fase 2 (sin aplicar). No es una función activada: su tabla
 * se clasifica como grupo opcional excluido (solo recuento) y no entra en la
 * política de supresión de las funciones activadas.
 */
const FAMILY_PAYMENT_METHODS = "docs/deployment/candidates/20261116180000_family_payment_methods_candidate.sql";
/**
 * Cobro automático, Fase 3 (sin aplicar). Tampoco es una función activada: sus
 * tres tablas forman un grupo opcional excluido (solo recuento), todo o nada.
 */
const FAMILY_COLLECTION = "docs/deployment/candidates/20261117120000_family_collection_candidate.sql";
/**
 * Cobro automático, Fase 4 (sin aplicar). Añade action_deadline_at a los
 * intentos (laterCandidateColumns de la Fase 3) y crea la tabla de disputas,
 * un grupo opcional excluido propio (solo recuento).
 */
const FAMILY_COLLECTION_EVENTS = "docs/deployment/candidates/20261118120000_family_collection_events_candidate.sql";
const COMPETITIVE_INTELLIGENCE =
  "docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql";

const clean = (sql: string) => sql.replace(/--[^\n]*/g, "").toLowerCase();

type FkAction = "cascade" | "set_null" | "restrict" | "no_action";
interface ForeignKey {
  columns: string[];
  target: string;
  action: FkAction;
}
interface ParsedTable {
  columns: string[];
  foreignKeys: ForeignKey[];
  checks: string[];
}

/** Top-level items of a CREATE TABLE body, split on commas outside parentheses. */
function splitItems(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      items.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function parseAction(text: string | undefined): FkAction {
  if (!text) return "no_action";
  if (text === "cascade") return "cascade";
  if (text.startsWith("set null")) return "set_null";
  if (text === "restrict") return "restrict";
  return "no_action";
}

const ACTION = String.raw`(?:\s+on\s+delete\s+(cascade|set\s+null(?:\s*\([^)]*\))?|restrict|no\s+action))?`;

function parseCreateTables(path: string, schema: "zaltyko" | "public"): Map<string, ParsedTable> {
  const sql = clean(read(path));
  const tables = new Map<string, ParsedTable>();
  const header = new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${schema}\.([a-z_][a-z0-9_]*)\s*\(`, "g");
  for (const match of sql.matchAll(header)) {
    let depth = 1;
    let index = match.index! + match[0].length;
    const start = index;
    while (depth > 0 && index < sql.length) {
      if (sql[index] === "(") depth += 1;
      if (sql[index] === ")") depth -= 1;
      index += 1;
    }
    const items = splitItems(sql.slice(start, index - 1));
    const parsed: ParsedTable = { columns: [], foreignKeys: [], checks: [] };
    for (const item of items) {
      const tableFk = new RegExp(
        String.raw`^(?:constraint\s+\S+\s+)?foreign\s+key\s*\(([^)]*)\)\s*references\s+([a-z_]+\.[a-z_]+)\s*\([^)]*\)${ACTION}`
      ).exec(item);
      if (tableFk) {
        parsed.foreignKeys.push({
          columns: tableFk[1]!.split(",").map((column) => column.trim()),
          target: tableFk[2]!,
          action: parseAction(tableFk[3]?.replace(/\s+/g, " ").replace(/\s*\(.*$/, "").trim()),
        });
        continue;
      }
      if (/^(?:constraint\s+\S+\s+)?check\b/.test(item)) {
        parsed.checks.push(item.replace(/\s+/g, " "));
        continue;
      }
      if (/^(?:constraint\s+\S+\s+)?(?:unique|primary\s+key)\b/.test(item)) continue;
      const column = /^([a-z_][a-z0-9_]*)\s/.exec(item);
      if (!column) throw new Error(`Unparsed item in ${path}: ${item}`);
      parsed.columns.push(column[1]!);
      const inlineFk = new RegExp(String.raw`references\s+([a-z_]+\.[a-z_]+)\s*\([^)]*\)${ACTION}`).exec(item);
      if (inlineFk) {
        parsed.foreignKeys.push({
          columns: [column[1]!],
          target: inlineFk[1]!,
          action: parseAction(inlineFk[2]?.replace(/\s+/g, " ").replace(/\s*\(.*$/, "").trim()),
        });
      }
      const inlineCheck = /\bcheck\s*\(([\s\S]*)\)\s*$/.exec(item);
      if (inlineCheck) parsed.checks.push(inlineCheck[0].replace(/\s+/g, " "));
    }
    tables.set(match[1]!, parsed);
  }
  return tables;
}

const activated = new Map<string, ParsedTable>();
for (const path of Object.values(CANDIDATES)) {
  for (const [name, table] of parseCreateTables(path, "zaltyko")) activated.set(name, table);
}

const ACCOUNT_ERASURE = "docs/deployment/candidates/20261114120000_account_erasure_candidate.sql";

/**
 * Claves a auth.users que cambia el candidato de supresión de cuentas, leídas
 * de su SQL: `tabla.columna` -> acción nueva.
 */
function accountErasureOverrides(): Map<string, FkAction> {
  const overrides = new Map<string, FkAction>();
  const statements = /alter\s+table\s+([a-z_]+\.[a-z_]+)\s([^;]*);/g;
  const foreignKey = /add\s+constraint\s+\S+\s+foreign\s+key\s*\(([a-z_]+)\)\s*references\s+auth\.users\s*\(id\)\s*on\s+delete\s+(cascade|set\s+null)/g;
  for (const statement of clean(read(ACCOUNT_ERASURE)).matchAll(statements)) {
    for (const match of statement[2]!.matchAll(foreignKey)) {
      overrides.set(`${statement[1]}.${match[1]}`, parseAction(match[2]!.replace(/\s+/g, " ")));
    }
  }
  return overrides;
}
const erasureOverrides = accountErasureOverrides();

/** Lo mismo que `activated`, con las claves a auth.users del candidato de supresión. */
const afterAccountErasure = new Map<string, ParsedTable>(
  [...activated].map(([name, table]) => [name, {
    ...table,
    foreignKeys: table.foreignKeys.map((fk) => {
      const override = fk.target === "auth.users" && fk.columns.length === 1
        ? erasureOverrides.get(`zaltyko.${name}.${fk.columns[0]}`)
        : undefined;
      return override ? { ...fk, action: override } : fk;
    }),
  }])
);

const RANK: Record<ErasureEffect, number> = { not_linked: 0, set_null: 1, cascade_delete: 2, blocks: 3 };
const worst = (effects: ErasureEffect[]): ErasureEffect =>
  effects.reduce<ErasureEffect>((left, right) => (RANK[right] > RANK[left] ? right : left), "not_linked");
const fromAction = (action: FkAction): ErasureEffect =>
  action === "cascade" ? "cascade_delete" : action === "set_null" ? "set_null" : "blocks";

/**
 * What PostgreSQL does to a row of `table` when a row of `root` is deleted:
 * direct references to the root, plus references to activated tables whose
 * rows are themselves deleted in cascade. Rows that block or survive do not
 * propagate further.
 */
function effectOf(
  table: string,
  root: string,
  seen: readonly string[] = [],
  tables: ReadonlyMap<string, ParsedTable> = activated
): ErasureEffect {
  const parsed = tables.get(table);
  if (!parsed) throw new Error(`Unknown activated table ${table}`);
  const effects: ErasureEffect[] = [];
  for (const fk of parsed.foreignKeys) {
    if (fk.target === root) {
      effects.push(fromAction(fk.action));
      continue;
    }
    const [schema, parent] = fk.target.split(".");
    if (schema === "zaltyko" && tables.has(parent!) && !seen.includes(parent!) &&
        effectOf(parent!, root, [...seen, table], tables) === "cascade_delete") {
      effects.push(fromAction(fk.action));
    }
  }
  return worst(effects);
}

describe("inventario de derechos de datos frente al SQL", () => {
  const created = new Set<string>();
  for (const path of ALL_SQL) {
    for (const match of clean(read(path)).matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?"?zaltyko"?\."?([a-z_][a-z0-9_]*)/g)) {
      created.add(match[1]!);
    }
  }
  const classified = [
    ...ALL_KNOWN_CANONICAL_TABLE_NAMES,
    ...OPTIONAL_EXPORT_MODULE_GROUPS.flat().map((table) => table.table),
    ...OPTIONAL_SHARED_CATALOG_TABLES.map((table) => table.table),
    ...OPTIONAL_INCLUDED_EXPORT_TABLES.map((table) => table.name),
  ];

  it("clasifica toda tabla zaltyko.* creada en el historial o en un candidato, sin duplicados", () => {
    expect(new Set(classified).size).toBe(classified.length);
    const unclassified = [...created].filter((name) => !classified.includes(name)).sort();
    expect(unclassified, "tablas zaltyko.* sin política de exportación/supresión").toEqual([]);
    expect(classified.filter((name) => !created.has(name)).sort()).toEqual([]);
  });

  it("exporta exactamente las columnas que crean los candidatos activados", () => {
    for (const module of OPTIONAL_INCLUDED_EXPORT_MODULES) {
      const candidate = parseCreateTables(CANDIDATES[module.module], "zaltyko");
      expect([...candidate.keys()].sort(), module.module).toEqual(module.tables.map((table) => table.name).sort());
      for (const table of module.tables) {
        expect([...table.expectedColumns].sort(), table.name).toEqual([...candidate.get(table.name)!.columns].sort());
        expect(candidate.get(table.name)!.foreignKeys).toContainEqual(
          { columns: ["organization_id"], target: "zaltyko.organizations", action: "cascade" }
        );
      }
    }
    for (const table of OPTIONAL_TEAM_ACCESS_EXPORT_TABLES) {
      expect([...table.columns].sort(), table.table).toEqual([...activated.get(table.table)!.columns].sort());
    }
  });

  it("declara el recuento de los intentos de método de pago con exactamente las columnas del candidato", () => {
    const candidate = parseCreateTables(FAMILY_PAYMENT_METHODS, "zaltyko");
    expect([...candidate.keys()]).toEqual(["family_payment_setup_attempts"]);
    expect(OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES.map((table) => table.table)).toEqual(["family_payment_setup_attempts"]);
    for (const table of OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES) {
      expect([...table.columns].sort(), table.table).toEqual([...candidate.get(table.table)!.columns].sort());
      expect(table.category).toBe("payment_authorizations");
      // La academia arrastra sus intentos; el recuento usa organization_id.
      expect(candidate.get(table.table)!.foreignKeys).toContainEqual(
        { columns: ["organization_id"], target: "zaltyko.organizations", action: "cascade" }
      );
    }
    expect(OPTIONAL_EXPORT_MODULE_GROUPS).toContain(OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES);
    // No es una función activada: no se exporta con valores.
    expect(OPTIONAL_INCLUDED_EXPORT_TABLES.some((table) => table.name === "family_payment_setup_attempts")).toBe(false);
    expect(ACTIVATED_MODULES_ERASURE_POLICY.some((entry) => entry.table === "family_payment_setup_attempts")).toBe(false);
  });

  it("declara el recuento de los intentos de cobro automático con exactamente las columnas del candidato", () => {
    const candidate = parseCreateTables(FAMILY_COLLECTION, "zaltyko");
    const tables = ["family_collection_attempts", "family_collection_attempt_charges", "organization_collection_settings"];
    expect([...candidate.keys()]).toEqual(tables);
    expect(OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES.map((table) => table.table)).toEqual(tables);
    const categories: Record<string, string> = {
      family_collection_attempts: "payment_provider_attempts",
      family_collection_attempt_charges: "payment_provider_attempts",
      organization_collection_settings: "payment_provider_configuration",
    };
    for (const table of OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES) {
      expect([...table.columns].sort(), table.table).toEqual([...candidate.get(table.table)!.columns].sort());
      expect(table.category, table.table).toBe(categories[table.table]);
      // La academia arrastra sus filas; el recuento usa organization_id.
      expect(candidate.get(table.table)!.foreignKeys, table.table).toContainEqual(
        { columns: ["organization_id"], target: "zaltyko.organizations", action: "cascade" }
      );
    }
    // Solo los intentos ganan columnas con la Fase 4: exactamente las que añade su alter table.
    const added = [...clean(read(FAMILY_COLLECTION_EVENTS)).matchAll(
      /alter\s+table\s+zaltyko\.([a-z_]+)\s+add\s+column\s+([a-z_]+)/g
    )].map((match) => `${match[1]}.${match[2]}`);
    expect(added).toEqual(["family_collection_attempts.action_deadline_at"]);
    const declared = OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES.flatMap((table) => {
      const later: readonly string[] = "laterCandidateColumns" in table ? table.laterCandidateColumns : [];
      return later.map((column) => `${table.table}.${column}`);
    });
    expect(declared).toEqual(added);
    // Un solo grupo, revisado igual en el plan de disposición.
    expect(OPTIONAL_EXPORT_MODULE_GROUPS).toContain(OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES);
    const index = OPTIONAL_EXPORT_MODULE_GROUPS.indexOf(OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES);
    expect(REVIEWED_DISPOSITION_OPTIONAL_GROUPS[index]).toEqual(
      OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES.map((table) => ({ table: table.table, category: table.category, scoped: true }))
    );
    // No es una función activada: no se exporta con valores ni entra en la supresión.
    for (const table of tables) {
      expect(OPTIONAL_INCLUDED_EXPORT_TABLES.some((included) => included.name === table), table).toBe(false);
      expect(ACTIVATED_MODULES_ERASURE_POLICY.some((entry) => entry.table === table), table).toBe(false);
    }
  });

  it("derechos de datos: family_collection_disputes en el grupo opcional, solo recuento", () => {
    const candidate = parseCreateTables(FAMILY_COLLECTION_EVENTS, "zaltyko");
    expect([...candidate.keys()]).toEqual(["family_collection_disputes"]);
    expect(OPTIONAL_FAMILY_COLLECTION_EVENTS_EXPORT_TABLES.map((table) => table.table)).toEqual(["family_collection_disputes"]);
    for (const table of OPTIONAL_FAMILY_COLLECTION_EVENTS_EXPORT_TABLES) {
      expect([...table.columns].sort(), table.table).toEqual([...candidate.get(table.table)!.columns].sort());
      expect(table.category, table.table).toBe("payment_provider_attempts");
      // La academia arrastra sus filas; el recuento usa organization_id.
      expect(candidate.get(table.table)!.foreignKeys, table.table).toContainEqual(
        { columns: ["organization_id"], target: "zaltyko.organizations", action: "cascade" }
      );
      // Borrar un evento solo quita el enlace (set null de su columna).
      expect(candidate.get(table.table)!.foreignKeys, table.table).toContainEqual(
        { columns: ["organization_id", "last_provider_event_id"], target: "zaltyko.payment_provider_events", action: "set_null" }
      );
    }
    // Grupo propio, no dentro del de la Fase 3: una base con solo la Fase 3 no queda «a medias».
    expect(OPTIONAL_EXPORT_MODULE_GROUPS).toContain(OPTIONAL_FAMILY_COLLECTION_EVENTS_EXPORT_TABLES);
    expect(OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES.map((table): string => table.table)).not.toContain("family_collection_disputes");
    const index = OPTIONAL_EXPORT_MODULE_GROUPS.indexOf(OPTIONAL_FAMILY_COLLECTION_EVENTS_EXPORT_TABLES);
    expect(REVIEWED_DISPOSITION_OPTIONAL_GROUPS[index]).toEqual([
      { table: "family_collection_disputes", category: "payment_provider_attempts", scoped: true },
    ]);
    // No es una función activada: no se exporta con valores ni entra en la supresión.
    expect(OPTIONAL_INCLUDED_EXPORT_TABLES.some((included) => included.name === "family_collection_disputes")).toBe(false);
    expect(ACTIVATED_MODULES_ERASURE_POLICY.some((entry) => entry.table === "family_collection_disputes")).toBe(false);
  });

  it("biblioteca: catálogos globales y avisos fuera del paquete, sin recuento, con las columnas de la candidata", () => {
    const candidate = parseCreateTables(ELEMENT_LIBRARY, "zaltyko");
    expect([...candidate.keys()].sort()).toEqual(OPTIONAL_SHARED_CATALOG_TABLES.map((table) => table.table).sort());
    for (const table of OPTIONAL_SHARED_CATALOG_TABLES) {
      expect([...table.columns].sort(), table.table).toEqual([...candidate.get(table.table)!.columns].sort());
      // Globales: sin organization_id, así que no hay recuento por academia.
      expect(table.columns, table.table).not.toContain("organization_id");
      expect(table.category, table.table).toBe(table.table === "content_notices" ? "internal_content_notices" : "shared_catalogs");
    }
    // El plazo de borrado del remitente sale de la constante del dominio (2 años).
    expect(CONTENT_NOTICE_SENDER_RETENTION_DAYS).toBe(730);
    const notices = OPTIONAL_SHARED_CATALOG_TABLES.find((table) => table.table === "content_notices")!;
    expect(notices.reason).toContain(`${CONTENT_NOTICE_SENDER_RETENTION_DAYS} days`);
    expect(notices.columns).toEqual(expect.arrayContaining(["sender_name", "sender_email", "closed_at", "sender_erased_at"]));
    // Revisadas igual en el plan de disposición, sin recuento.
    expect(REVIEWED_DISPOSITION_OPTIONAL_SHARED_CATALOGS).toEqual(
      OPTIONAL_SHARED_CATALOG_TABLES.map((table) => ({ table: table.table, category: table.category, scoped: false }))
    );
    // Ni valores ni supresión de academia.
    for (const table of OPTIONAL_SHARED_CATALOG_TABLES) {
      expect(OPTIONAL_INCLUDED_EXPORT_TABLES.some((included) => included.name === table.table), table.table).toBe(false);
      expect(ACTIVATED_MODULES_ERASURE_POLICY.some((entry) => entry.table === table.table), table.table).toBe(false);
    }
  });

  it("acepta en las tablas incluidas exactamente las columnas que añaden las candidatas posteriores", () => {
    // Columnas añadidas con alter table … add column, por la candidata que crea
    // la tabla referenciada o por la que la amplía.
    const added = [...clean(read(ELEMENT_LIBRARY)).matchAll(
      /alter\s+table\s+zaltyko\.([a-z_]+)\s+add\s+column\s+([a-z_]+)\s+uuid\s+references\s+zaltyko\.catalog_elements\s*\(id\)\s+on\s+delete\s+restrict/g
    )].map((match) => `${match[1]}.${match[2]}`);
    expect(added).toEqual(["skill_elements.catalog_element_id", "session_plan_blocks.catalog_element_id"]);
    expect([...clean(read(ELEMENT_LIBRARY)).matchAll(/add\s+column/g)]).toHaveLength(added.length);
    const declared = OPTIONAL_INCLUDED_EXPORT_TABLES.flatMap((table) =>
      (table.laterCandidateColumns ?? []).map((column) => `${table.name}.${column}`)
    );
    expect([...declared].sort()).toEqual([...added].sort());
    for (const table of OPTIONAL_INCLUDED_EXPORT_TABLES.filter((item) => item.laterCandidateColumns)) {
      // Las columnas posteriores se exportan con valores: nunca se omiten ni chocan con las base.
      for (const column of table.laterCandidateColumns!) {
        expect(table.expectedColumns, table.name).not.toContain(column);
      }
    }
  });

  it("revisa en el plan de disposición los mismos módulos activados que exporta", () => {
    expect(REVIEWED_DISPOSITION_OPTIONAL_INCLUDED_MODULES).toEqual(
      OPTIONAL_INCLUDED_EXPORT_MODULES.map((module) => module.tables.map((table) => table.name))
    );
  });

  it("no exporta claves de reintento ni el token del enlace público", () => {
    const exported = OPTIONAL_INCLUDED_EXPORT_TABLES.flatMap((table) => table.exportColumns.map((column) => `${table.name}.${column}`));
    for (const hidden of [
      "athlete_objectives.client_request_id", "athlete_observations.client_request_id",
      "session_plans.client_request_id", "session_plans.last_request_id",
      "skill_templates.client_request_id", "athlete_level_passes.client_request_id",
      "admission_links.token", "admission_requests.submission_id",
    ]) {
      expect(exported).not.toContain(hidden);
    }
  });

  it("exporta los bloques del modelo de la clase solo con los campos clasificados", () => {
    const template = OPTIONAL_INCLUDED_EXPORT_TABLES.find((table) => table.name === "class_plan_templates")!;
    expect(template.exportColumns).toContain("blocks");
    // Los campos clasificados son exactamente los que escribe el servidor: los
    // cinco de siempre y, solo si el bloque enlaza la biblioteca, catalogElementId.
    expect([...CLASS_PLAN_TEMPLATE_BLOCK_FIELDS].sort())
      .toEqual(Object.keys(normalizeTemplateBlock({ kind: "warmup", content: "x" })).sort());
    expect([...CLASS_PLAN_TEMPLATE_BLOCK_FIELDS, ...CLASS_PLAN_TEMPLATE_BLOCK_OPTIONAL_FIELDS].sort())
      .toEqual(Object.keys(normalizeTemplateBlock({
        kind: "warmup", content: "x", catalogElementId: "a0000000-0000-4000-8000-000000000001",
      })).sort());
    const projection = template.projections?.blocks ?? "";
    for (const field of [...CLASS_PLAN_TEMPLATE_BLOCK_FIELDS, ...CLASS_PLAN_TEMPLATE_BLOCK_OPTIONAL_FIELDS]) {
      expect(projection).toContain(`'${field}'`);
    }
    expect(projection.match(/'[a-zA-Z]+', (?:element\.value|case when)/g))
      .toHaveLength(CLASS_PLAN_TEMPLATE_BLOCK_FIELDS.length + CLASS_PLAN_TEMPLATE_BLOCK_OPTIONAL_FIELDS.length);
    // El enlace solo se añade si el bloque guardado lo trae.
    expect(projection).toContain("case when jsonb_typeof(element.value -> 'catalogElementId') in ('string', 'null')");
    expect(projection).toContain("else '{}'::jsonb end");
    // Ninguna otra tabla proyecta columnas a mano.
    expect(OPTIONAL_INCLUDED_EXPORT_TABLES.filter((table) => table.projections).map((table) => table.name)).toEqual(["class_plan_templates"]);
  });

  it("marca las tablas ci_* como catálogo interno sin datos de clientes", () => {
    const ci = parseCreateTables(COMPETITIVE_INTELLIGENCE, "public");
    expect(INTERNAL_NON_CUSTOMER_TABLES.map((entry) => entry.table).sort()).toEqual([...ci.keys()].sort());
    for (const [name, table] of ci) {
      expect(table.columns, name).not.toContain("organization_id");
      // Solo enlaza con otras ci_* y con el perfil interno que creó o editó la ficha.
      expect(table.foreignKeys.every((fk) => fk.target.startsWith("public.ci_") || fk.target === "public.profiles"), name).toBe(true);
    }
    expect(INTERNAL_NON_CUSTOMER_TABLES.every((entry) => entry.schema === "public" && entry.category === "internal_market_catalog")).toBe(true);
  });
});

describe("política de supresión de las funciones activadas", () => {
  it("cubre exactamente las tablas activadas y su modo de exportación", () => {
    expect(ACTIVATED_MODULES_ERASURE_POLICY.map((entry) => entry.table).sort()).toEqual([...activated.keys()].sort());
    for (const entry of ACTIVATED_MODULES_ERASURE_POLICY) {
      const included = OPTIONAL_INCLUDED_EXPORT_TABLES.some((table) => table.name === entry.table);
      expect(entry.academyExport, entry.table).toBe(included ? "values" : "count_only");
    }
  });

  it.each(ACTIVATED_MODULES_ERASURE_POLICY.map((entry): [string, ActivatedTableErasurePolicy] => [entry.table, entry]))(
    "%s: el efecto declarado coincide con sus claves foráneas", (table, entry) => {
      expect(entry.onAthleteErasure, "gimnasta").toBe(effectOf(table, "zaltyko.athletes"));
      const member = effectOf(table, "zaltyko.organization_members");
      expect(entry.onMemberErasure, "integrante").toBe(member);
      // Con el candidato de supresión, la pertenencia no se borra (SET NULL):
      // solo cuentan las claves directas a auth.users, ya cambiadas.
      expect(entry.onAuthAccountErasure, "cuenta").toBe(effectOf(table, "auth.users", [], afterAccountErasure));
      // La academia arrastra todas sus tablas; ninguna usa RESTRICT salvo hacia
      // un elemento del catálogo global (un elemento con notas no se borra: se retira).
      const parsed = activated.get(table)!;
      expect(parsed.foreignKeys).toContainEqual({ columns: ["organization_id"], target: "zaltyko.organizations", action: "cascade" });
      expect(parsed.foreignKeys.some((fk) => fk.action === "restrict" && fk.target !== "zaltyko.catalog_elements")).toBe(false);
      expect(entry.onAcademyErasure).toBe("cascade_delete");
    }
  );

  it("el candidato de supresión conserva la pertenencia y solo cambia las claves revisadas", () => {
    const candidate = clean(read(ACCOUNT_ERASURE));
    // La pertenencia deja de borrarse en cascada y exige estar revocada sin cuenta.
    expect(erasureOverrides.get("zaltyko.organization_members.user_id")).toBe("set_null");
    expect(candidate).toMatch(/check \(user_id is not null or status = 'revoked'\)/);
    expect([...erasureOverrides.entries()].sort()).toEqual([
      ["public.directory_audit.actor_id", "set_null"],
      ["public.directory_claims.decided_by", "set_null"],
      ["public.directory_claims.user_id", "set_null"],
      ["public.directory_grants.approved_by", "set_null"],
      ["public.directory_grants.user_id", "cascade"],
      ["public.directory_revisions.user_id", "set_null"],
      ["public.directory_subscriptions.user_id", "set_null"],
      ["zaltyko.insight_actions.actor_user_id", "set_null"],
      ["zaltyko.organization_member_invitations.accepted_by_user_id", "set_null"],
      ["zaltyko.organization_members.user_id", "set_null"],
      ["zaltyko.organization_team_command_receipts.actor_user_id", "cascade"],
      ["zaltyko.payments.recorded_by_user_id", "set_null"],
    ]);
    // Ninguna clave a auth.users de las tablas activadas queda bloqueando.
    for (const [name, table] of afterAccountErasure) {
      for (const fk of table.foreignKeys.filter((item) => item.target === "auth.users")) {
        expect(["set_null", "cascade"], `${name}.${fk.columns.join(",")}`).toContain(fk.action);
      }
    }
    // La evidencia fiscal de conciliación SaaS sigue en RESTRICT (no se toca).
    expect(candidate).not.toMatch(/alter table zaltyko\.organization_saas_webhook_reconciliation_decisions/);
  });

  it("conserva las solicitudes descartadas anonimizadas según el CHECK y el servidor", () => {
    const entry = ACTIVATED_MODULES_ERASURE_POLICY.find((item) => item.table === "admission_requests")!;
    expect(entry.retention.kind).toBe("manual_anonymization_of_declined");
    if (entry.retention.kind !== "manual_anonymization_of_declined") return;
    expect(entry.retention.automaticAfterDays).toBeNull();
    expect(entry.retention.status).toBe("pending_legal_decision");
    const check = activated.get("admission_requests")!.checks.find((item) => item.includes("anonymized_at is null"));
    expect(check).toBeDefined();
    expect(check).toContain("status = 'declined'");
    const cleared = [...check!.matchAll(/([a-z_]+) is null/g)].map((match) => match[1]).filter((column) => column !== "anonymized_at");
    expect([...cleared].sort()).toEqual([...entry.retention.clearedColumns].sort());
    const service = read("src/modules/admissions/application/admission-requests.ts");
    for (const column of entry.retention.clearedColumns) expect(service).toMatch(new RegExp(`${column} = null`));
    expect(service).toMatch(/contact_name = \$\{ANONYMIZED_CONTACT_NAME\}/);
    expect(service).toMatch(/contact_email = \$\{anonymizedContactEmail\(/);
    expect(service).toMatch(/athlete_given_name = \$\{ANONYMIZED_ATHLETE_NAME\}/);
    expect(service).toMatch(/anonymized_at = now\(\)/);
    for (const other of ACTIVATED_MODULES_ERASURE_POLICY.filter((item) => item.table !== "admission_requests")) {
      expect(other.retention, other.table).toEqual({ kind: "while_academy_exists", automaticAfterDays: null });
    }
  });
});
