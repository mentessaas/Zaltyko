import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { execute: vi.fn() } }));

import {
  FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT,
  FAMILY_COLLECTION_EVENTS_OPEN_ATTEMPT_PREDICATE,
  FAMILY_COLLECTION_EVENTS_TABLES,
  FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX,
  FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS,
  FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE,
  FAMILY_COLLECTION_TABLES,
  FAMILY_COLLECTION_UNIQUE_CONSTRAINTS,
  familyCollectionStorageShape,
  isFamilyCollectionEventsStorageAvailable,
  isFamilyCollectionStorageAvailable,
} from "@/modules/family-collection/application/storage";
import {
  FAMILY_COLLECTION_ATTEMPT_STATUSES,
  FAMILY_COLLECTION_DISPUTE_CLOSED_STATUSES,
  FAMILY_COLLECTION_DISPUTE_STATUSES,
  FAMILY_COLLECTION_OPEN_STATUSES,
  familyCollectionAttemptCharges,
  familyCollectionAttempts,
  familyCollectionDisputes,
  organizationCollectionSettings,
} from "@/modules/family-collection/infrastructure/family-collection-schema";

/**
 * Contrato de las candidatas de las Fases 3 y 4 del cobro automático. Sus
 * tablas no están en supabase/migrations, así que este test protege que las
 * candidatas, el espejo Drizzle y la detección de almacenamiento describan lo
 * mismo (columnas, tipos, nulos, checks, únicos, índices y claves foráneas),
 * que las tablas sean solo de servidor y que drizzle-kit no pueda crearlas por
 * su cuenta. El espejo describe la base con las dos candidatas: la Fase 3 más
 * lo que su `alter table` añade, cambia o quita. Las reglas reales las
 * comprueban tests/family-collection-pg.test.ts (Fase 3) y
 * tests/family-collection-events-pg.test.ts (Fase 4).
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANDIDATE_FILE = "20261117120000_family_collection_candidate.sql";
const CANDIDATE = `docs/deployment/candidates/${CANDIDATE_FILE}`;
const SCHEMA = "src/modules/family-collection/infrastructure/family-collection-schema.ts";
const TABLES = ["family_collection_attempt_charges", "family_collection_attempts", "organization_collection_settings"] as const;
const EVENTS_FILE = "20261118120000_family_collection_events_candidate.sql";
const EVENTS_CANDIDATE = `docs/deployment/candidates/${EVENTS_FILE}`;

const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, "");
const normalize = (expression: string) => expression.replace(/\s+/g, " ").trim().toLowerCase();
const byCodePoint = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const SQL_TYPES: Record<string, string> = {
  uuid: "uuid",
  text: "text",
  timestamptz: "timestamp with time zone",
  integer: "integer",
  bigint: "bigint",
  smallint: "smallint",
  boolean: "boolean",
};

type CandidateColumn = { name: string; type: string; notNull: boolean; hasDefault: boolean };

function tableBlocks(sql: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of stripSqlComments(sql).matchAll(/create table zaltyko\.([a-z_]+) \(\n([\s\S]*?)\n\);/g)) {
    blocks.set(match[1]!, match[2]!);
  }
  return blocks;
}

function candidateColumns(block: string): CandidateColumn[] {
  return block
    .split("\n")
    .map((line) => line.match(/^ {2}([a-z_]+) (uuid|text|timestamptz|integer|bigint|smallint|boolean)\b(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1]!,
      type: SQL_TYPES[match[2]!]!,
      notNull: /\bnot null\b|\bprimary key\b/.test(match[3]!),
      hasDefault: /\bdefault\b/.test(match[3]!),
    }))
    .sort((left, right) => byCodePoint(left.name, right.name));
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
    checks.set(match[1]!, normalize(block.slice(start, index - 1)));
  }
  return checks;
}

const named = (block: string, kind: "unique" | "foreign key") =>
  [...block.matchAll(new RegExp(`constraint ([a-z_]+)\\s+${kind} \\(`, "g"))].map((match) => match[1]!).sort();

function foreignKeyActions(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/constraint ([a-z_]+)\s+foreign key \([^)]*\)\s+references [^\n]*? on delete (cascade|restrict|set null)/g)].map(
      (match) => [match[1]!, match[2]!] as const
    )
  );
}

/**
 * La Fase 4 sobre la Fase 3: su única sentencia `alter table` de los intentos
 * (columnas añadidas, restricciones quitadas y checks añadidos).
 */
const eventsBody = stripSqlComments(read(EVENTS_CANDIDATE));
const attemptsAlter = /alter table zaltyko\.family_collection_attempts\n([\s\S]*?);\n/.exec(eventsBody)?.[1] ?? "";
const addedAttemptColumns: CandidateColumn[] = [
  ...attemptsAlter.matchAll(/^ {2}add column ([a-z_]+) (uuid|text|timestamptz|integer|bigint|smallint|boolean)\b(.*)$/gm),
].map((match) => ({
  name: match[1]!,
  type: SQL_TYPES[match[2]!]!,
  notNull: /\bnot null\b/.test(match[3]!),
  hasDefault: /\bdefault\b/.test(match[3]!),
}));
const droppedAttemptConstraints = [...attemptsAlter.matchAll(/^ {2}drop constraint ([a-z_]+),?$/gm)].map((match) => match[1]!);

/** Columnas de una tabla de la Fase 3 tal como quedan con la Fase 4. */
function withPhase4Columns(table: string, columns: CandidateColumn[]): CandidateColumn[] {
  if (table !== "family_collection_attempts") return columns;
  return [...columns, ...addedAttemptColumns].sort((left, right) => byCodePoint(left.name, right.name));
}

/** CHECK de una tabla de la Fase 3 tal como quedan con la Fase 4. */
function withPhase4Checks(table: string, checks: Map<string, string>): Map<string, string> {
  if (table !== "family_collection_attempts") return checks;
  const result = new Map(checks);
  for (const name of droppedAttemptConstraints) result.delete(name);
  for (const [name, expression] of candidateChecks(attemptsAlter)) result.set(name, expression);
  return result;
}

describe("candidata SQL del cobro automático (Fase 3)", () => {
  const sql = read(CANDIDATE);
  const lower = sql.toLowerCase();
  const body = stripSqlComments(lower);
  const blocks = tableBlocks(sql);
  const drizzleTables = new Map(
    [familyCollectionAttempts, familyCollectionAttemptCharges, organizationCollectionSettings].map((table) => {
      const config = getTableConfig(table);
      return [config.name, config] as const;
    })
  );
  const dialect = new PgDialect();

  it("se marca como pendiente de autorización y no está en el historial aplicable", () => {
    expect(lower).toContain("candidate only");
    expect(lower).toContain("requiere autorización de elvis");
    expect(lower).toContain("no aplicado en ningún entorno");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_FILE))).toBe(false);
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(
        /family_collection_attempts|family_collection_attempt_charges|organization_collection_settings/
      );
    }
    // Documenta por qué no se reutiliza zaltyko.payment_attempts.
    expect(lower).toContain("no se reutiliza zaltyko.payment_attempts");
  });

  it("el README documenta el SHA-256 exacto del archivo y el rollback", () => {
    const readme = read("docs/deployment/candidates/README.md");
    const sha = createHash("sha256").update(readFileSync(join(ROOT, CANDIDATE))).digest("hex");
    expect(readme).toContain(`| \`${CANDIDATE_FILE}\` | \`${sha}\` |`);
    for (const table of TABLES) {
      expect(readme, table).toContain(`drop table if exists zaltyko.${table};`);
    }
  });

  it("comprueba PostgreSQL 15+, las Fases 1 y 2 y la ausencia de las tablas antes de crear nada", () => {
    const firstCreate = body.indexOf("create table");
    const preflight = body.slice(0, firstCreate);
    expect(preflight).toContain("current_setting('server_version_num')::integer < 150000");
    expect(preflight).toContain("'sepa_debit_payments_capability_status', 'requirements_state'");
    expect(preflight).toContain("to_regclass('zaltyko.family_payment_setup_attempts') is null");
    expect(preflight).toContain("attname = 'payment_method_kind'");
    for (const table of TABLES) {
      expect(preflight, table).toContain(`to_regclass('zaltyko.${table}') is not null`);
    }
    // Transacción propia con lock_timeout.
    expect(body.trimStart().startsWith("begin;")).toBe(true);
    expect(body).toContain("set local lock_timeout = '5s';");
    expect(body.trimEnd().endsWith("commit;")).toBe(true);
    // No toca nada que no sea suyo.
    expect(body).not.toMatch(/\b(drop|truncate|delete from|update zaltyko)\b/);
    expect(body).not.toMatch(/alter table zaltyko\.(?!family_collection_attempts |family_collection_attempt_charges |organization_collection_settings )/);
    expect(body).not.toMatch(/comment on (table|column) zaltyko\.(?!family_collection_attempts |family_collection_attempt_charges |organization_collection_settings )/);
  });

  it("crea exactamente las tres tablas, con las mismas columnas en Drizzle y en la detección de almacenamiento", () => {
    expect([...blocks.keys()].sort()).toEqual([...TABLES]);
    expect(Object.keys(FAMILY_COLLECTION_TABLES).sort()).toEqual([...TABLES]);
    for (const table of TABLES) {
      const columns = candidateColumns(blocks.get(table)!);
      expect(
        columns.map((column) => [column.name, column.type, column.notNull ? "NO" : "YES"]),
        table
      ).toEqual(specOf(table).map((column) => [...column]));
      const drizzleColumns = drizzleTables
        .get(table)!
        .columns.map((column) => ({
          name: column.name,
          type: column.getSQLType(),
          notNull: column.notNull,
          hasDefault: column.hasDefault,
        }))
        .sort((left, right) => byCodePoint(left.name, right.name));
      // El espejo describe la base con la Fase 4 encima.
      expect(drizzleColumns, table).toEqual(withPhase4Columns(table, columns));
    }
  });

  it("la detección de almacenamiento ordena las columnas como PostgreSQL con collate C", () => {
    for (const table of TABLES) {
      const names = specOf(table).map(([name]) => name);
      expect(names, table).toEqual([...names].sort(byCodePoint));
    }
  });

  it("repite en Drizzle los CHECK, únicos, claves foráneas (con su acción) e índices con los mismos nombres", () => {
    for (const table of TABLES) {
      const block = blocks.get(table)!;
      const config = drizzleTables.get(table)!;
      const drizzleChecks = Object.fromEntries(
        config.checks.map((check) => [check.name, normalize(dialect.sqlToQuery(check.value).sql)])
      );
      expect(drizzleChecks, table).toEqual(Object.fromEntries(withPhase4Checks(table, candidateChecks(block))));
      expect(config.uniqueConstraints.map((unique) => unique.getName()).sort(), table).toEqual(named(block, "unique"));
      const foreignKeys = config.foreignKeys.filter((fk) => !fk.getName().endsWith("_organizations_id_fk"));
      expect(foreignKeys.map((fk) => fk.getName()).sort(), table).toEqual(named(block, "foreign key"));
      const actions = foreignKeyActions(block);
      for (const fk of foreignKeys) {
        expect(fk.onDelete, fk.getName()).toBe(actions.get(fk.getName()));
      }
      for (const index of config.indexes) {
        const name = index.config.name!;
        const keyword = index.config.unique ? "create unique index" : "create index";
        expect(body, name).toContain(`${keyword} ${name}\n  on zaltyko.${table} (`);
      }
      // La academia borra en cascada.
      expect(body).toMatch(new RegExp(`create table zaltyko\\.${table} \\([\\s\\S]*?organization_id uuid [^\\n]*references zaltyko\\.organizations\\(id\\) on delete cascade`));
    }
    const indexNames = [...body.matchAll(/create (?:unique )?index ([a-z_]+)/g)].map((match) => match[1]!).sort();
    const drizzleIndexNames = [...drizzleTables.values()].flatMap((config) => config.indexes.map((index) => index.config.name!)).sort();
    expect(drizzleIndexNames).toEqual(indexNames);
    expect(tableConfig(familyCollectionAttemptCharges).primaryKeys.map((pk) => pk.getName())).toEqual(["family_collection_attempt_charges_pkey"]);
    const names = [...body.matchAll(/(?:constraint|create (?:unique )?index) ([a-z_]+)/g)].map((match) => match[1]!);
    for (const name of names) expect(name.length, name).toBeLessThan(63);
  });

  it("un solo intento no terminal y uno solo cobrado por factura, como mucho cinco intentos y tres reanudaciones", () => {
    expect(body).toContain(
      "create unique index family_collection_attempts_open_uq\n  on zaltyko.family_collection_attempts (organization_id, invoice_id)\n  where status in ('claimed', 'created', 'processing');"
    );
    const drizzleOpen = tableConfig(familyCollectionAttempts).indexes.find((index) => index.config.name === FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX);
    expect(drizzleOpen?.config.unique).toBe(true);
    // El espejo lleva el índice como lo rehace la Fase 4, con requires_action.
    expect(normalize(dialect.sqlToQuery(drizzleOpen!.config.where as SQL).sql)).toBe(
      "status in ('claimed', 'created', 'processing', 'requires_action')"
    );
    // Nunca dos cobros registrados de la misma factura.
    expect(body).toContain(
      "create unique index family_collection_attempts_succeeded_uq\n  on zaltyko.family_collection_attempts (organization_id, invoice_id)\n  where status = 'succeeded';"
    );
    const drizzleSucceeded = tableConfig(familyCollectionAttempts).indexes.find(
      (index) => index.config.name === "family_collection_attempts_succeeded_uq"
    );
    expect(drizzleSucceeded?.config.unique).toBe(true);
    expect(drizzleSucceeded?.config.columns.map((column) => (column as { name: string }).name)).toEqual([
      "organization_id",
      "invoice_id",
    ]);
    expect(normalize(dialect.sqlToQuery(drizzleSucceeded!.config.where as SQL).sql)).toBe("status = 'succeeded'");
    const checks = candidateChecks(blocks.get("family_collection_attempts")!);
    expect(checks.get("family_collection_attempts_attempt_number_check")).toBe("attempt_number between 1 and 5");
    expect(checks.get("family_collection_attempts_resume_count_check")).toBe("resume_count between 0 and 3");
    // Reintento pendiente solo en un fallo, solo de tarjeta y solo tras los intentos 1 a 3 (D1).
    expect(checks.get("family_collection_attempts_next_retry_only_failed")).toBe("next_retry_at is null or status = 'failed'");
    expect(checks.get("family_collection_attempts_next_retry_card_only")).toBe(
      "next_retry_at is null or (payment_method_kind is not distinct from 'card' and attempt_number <= 3)"
    );
    // Solo un canceled sin cobro en Stripe puede llevar la moneda (no EUR) de su factura.
    expect(checks.get("family_collection_attempts_currency_check")).toBe(
      "currency = 'eur' or (status = 'canceled' and provider_payment_intent_reference is null)"
    );
    expect(body).toContain(
      "foreign key (organization_id, invoice_id, currency)\n    references zaltyko.invoices (organization_id, id, currency) on delete restrict"
    );
    expect(checks.get("family_collection_attempts_amount_check")).toBe("amount_cents > 0");
    expect(candidateChecks(blocks.get("organization_collection_settings")!).get("organization_collection_settings_day_check")).toBe(
      "collection_day_of_month is null or collection_day_of_month between 1 and 31"
    );
  });

  it("no guarda mensajes de Stripe, datos de tarjeta, banco ni identidad", () => {
    const columns = TABLES.flatMap((table) => candidateColumns(blocks.get(table)!).map((column) => column.name));
    for (const forbidden of ["failure_message", "error_message", "message", "last4", "card_last4", "brand", "iban", "email", "name", "given_name", "family_name", "description", "metadata"]) {
      expect(columns, forbidden).not.toContain(forbidden);
    }
  });

  it("habilita y fuerza RLS y solo concede select, insert y update a service_role", () => {
    for (const table of TABLES) {
      expect(lower, table).toContain(`alter table zaltyko.${table} enable row level security;`);
      expect(lower, table).toContain(`alter table zaltyko.${table} force row level security;`);
      expect(lower, table).toContain(`revoke all on table zaltyko.${table}\n  from public, anon, authenticated, service_role;`);
      expect(lower, table).toContain(`grant select, insert, update on table zaltyko.${table}\n  to service_role;`);
    }
    expect([...body.matchAll(/\bgrant\b/g)]).toHaveLength(TABLES.length);
    expect(body).not.toMatch(/create policy/);
  });
});

function tableConfig(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table);
}

type ColumnSpec = readonly [column: string, dataType: string, isNullable: string];
const specOf = (table: (typeof TABLES)[number]) => FAMILY_COLLECTION_TABLES[table] as readonly ColumnSpec[];

describe("detección del almacenamiento del cobro automático", () => {
  const dialect = new PgDialect();

  /**
   * La consulta compara con `array[$n, …]::text[]`: los valores esperados van
   * como parámetros, en orden y seguidos, nunca como SQL crudo.
   */
  function expectBoundArray(query: { sql: string; params: unknown[] }, values: readonly string[], label: string) {
    const found = query.params.some((_param, start) => {
      if (!values.every((value, offset) => query.params[start + offset] === value)) return false;
      const placeholders = values.map((_value, offset) => `$${start + offset + 1}`).join(", ");
      return query.sql.includes(`array[${placeholders}]::text[]`);
    });
    expect(found, label).toBe(true);
  }

  it("los únicos y el índice que exige coinciden con la candidata", () => {
    const block = stripSqlComments(read(CANDIDATE)).toLowerCase();
    for (const [name, columns] of Object.entries(FAMILY_COLLECTION_UNIQUE_CONSTRAINTS)) {
      expect(block, name).toContain(`constraint ${name} unique (${columns.join(", ")}),`);
    }
    expect(block).toContain(
      `create unique index ${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX}\n  on zaltyko.family_collection_attempts (${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS.join(", ")})\n  where status in ('claimed', 'created', 'processing');`
    );
    for (const status of ["claimed", "created", "processing"]) {
      expect(FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE).toContain(`'${status}'::text`);
    }
    expect(FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE).not.toMatch(/succeeded|failed|canceled/);
  });

  it("exige cada tabla con sus columnas, tipos y nulos exactos y el índice de un intento abierto, en cada fase", async () => {
    const execute = vi.fn(async (_query: SQL) => ({ rows: [{ phase3: true, phase4: false }] }));
    expect(await familyCollectionStorageShape({ execute } as never)).toBe("phase3");
    expect(execute).toHaveBeenCalledTimes(1);
    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    const specs = [
      ...Object.entries(FAMILY_COLLECTION_TABLES),
      ...Object.entries(FAMILY_COLLECTION_EVENTS_TABLES),
    ] as Array<[string, readonly ColumnSpec[]]>;
    for (const [table, spec] of specs) {
      expect(query.params, table).toContain(table);
      expectBoundArray(
        query,
        spec.map(([column, type, nullable]) => `${column}|${type}|${nullable}`),
        table
      );
    }
    // Índice parcial: único, válido, con sus columnas y el predicado de cada fase.
    expect(query.params).toContain(`zaltyko.${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX}`);
    for (const predicate of [FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE, FAMILY_COLLECTION_EVENTS_OPEN_ATTEMPT_PREDICATE]) {
      expect(query.params).toContain(predicate);
      expect(query.params).toContain(`(${predicate})`);
    }
    expect(query.sql).toContain("i.indisunique");
    expect(query.sql).toContain("i.indisvalid");
    expect(query.sql).toContain("pg_get_expr(i.indpred, i.indrelid)");
    expectBoundArray(query, FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS, FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX);
    // Únicos de número de intento y de pi_, y el de la disputa (Fase 4), con sus columnas.
    for (const [name, columns] of Object.entries(FAMILY_COLLECTION_UNIQUE_CONSTRAINTS)) {
      expect(query.params, name).toContain(name);
      expectBoundArray(query, columns, name);
    }
    expect(query.params).toContain(FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT.name);
    expect(query.params).toContain(`zaltyko.${FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT.table}`);
    expectBoundArray(query, FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT.columns, FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT.name);
    expect(query.sql).toContain("c.contype = 'u'");
    expect(query.sql).toContain("information_schema.columns");
    expect(query.sql).toMatch(/\bas phase3\b/);
    expect(query.sql).toMatch(/\bas phase4\b/);
    // Solo lee el catálogo, y ninguna columna esperada va como texto en la consulta.
    expect(query.sql).not.toMatch(/\b(create|alter|insert|update|delete|grant)\b/i);
    expect(query.sql).not.toContain("provider_payment_intent_reference");
    expect(query.sql).not.toContain("action_deadline_at");
    expect(query.sql).not.toContain("provider_dispute_reference");
  });

  it("phase4 si coincide la Fase 4, phase3 si coincide la Fase 3 y none en cualquier otro caso", async () => {
    const cases: Array<[Array<Record<string, unknown>>, "none" | "phase3" | "phase4"]> = [
      [[{ phase3: false, phase4: true }], "phase4"],
      [[{ phase3: true, phase4: true }], "phase4"],
      [[{ phase3: true, phase4: false }], "phase3"],
      [[{ phase3: true, phase4: null }], "phase3"],
      [[{ phase3: false, phase4: false }], "none"],
      [[{ phase3: null, phase4: null }], "none"],
      [[{ phase3: "true", phase4: 1 }], "none"],
      [[{ available: true }], "none"],
      [[{}], "none"],
      [[], "none"],
    ];
    for (const [rows, shape] of cases) {
      const label = JSON.stringify(rows);
      const execute = () => vi.fn(async () => ({ rows }));
      expect(await familyCollectionStorageShape({ execute: execute() } as never), label).toBe(shape);
      // El cobro de la Fase 3 funciona con las dos formas; lo de la Fase 4, solo con la suya.
      expect(await isFamilyCollectionStorageAvailable({ execute: execute() } as never), label).toBe(shape !== "none");
      expect(await isFamilyCollectionEventsStorageAvailable({ execute: execute() } as never), label).toBe(shape === "phase4");
    }
  });
});

describe("el esquema del cobro automático queda fuera de drizzle-kit y de validate:rls", () => {
  it("no se exporta desde los índices ni vive en src/db/schema", () => {
    for (const path of ["src/db/schema/index.ts", "src/db/zaltyko-schema.ts"]) {
      expect(read(path), path).not.toMatch(/modules\/family-collection|family-collection-schema/);
    }
    expect(read("drizzle.config.ts")).not.toMatch(/modules\/family-collection|family-collection-schema/);
    const schemaDir = join(ROOT, "src/db/schema");
    for (const entry of readdirSync(schemaDir)) {
      const path = join(schemaDir, entry);
      if (statSync(path).isFile()) {
        expect(readFileSync(path, "utf8"), entry).not.toMatch(
          /"family_collection_attempts"|"family_collection_attempt_charges"|"organization_collection_settings"|"family_collection_disputes"|"action_deadline_at"/
        );
      }
    }
    expect(read(SCHEMA)).toContain("NO se exportan");
  });
});

/**
 * Bloque de vuelta atrás de la candidata de la Fase 4: comentado entre
 * `-- >>> vuelta atrás` y `-- <<< vuelta atrás`, una línea de SQL por línea
 * de comentario. Devuelve el SQL sin los `-- `.
 */
function rollbackBlock(text: string): string {
  const match = /^-- >>> vuelta atrás\n([\s\S]*?)^-- <<< vuelta atrás$/m.exec(text);
  if (!match) throw new Error("La candidata no tiene bloque de vuelta atrás");
  return match[1]!
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      if (!line.startsWith("-- ")) throw new Error(`Línea de vuelta atrás sin comentar: ${line}`);
      return line.slice(3);
    })
    .join("\n");
}

describe("candidata SQL del cobro automático (Fase 4: requires_action y disputas)", () => {
  const sql = read(EVENTS_CANDIDATE);
  const lower = sql.toLowerCase();
  const body = eventsBody;
  const bodyLower = body.toLowerCase();
  const disputeBlock = tableBlocks(sql).get("family_collection_disputes") ?? "";
  const disputeConfig = getTableConfig(familyCollectionDisputes);
  const attemptsConfig = getTableConfig(familyCollectionAttempts);
  const dialect = new PgDialect();
  const phase3Attempts = tableBlocks(read(CANDIDATE)).get("family_collection_attempts")!;

  it("se marca como pendiente de autorización y no está en el historial aplicable", () => {
    expect(lower).toContain("candidate only");
    expect(lower).toContain("requiere autorización de elvis");
    expect(lower).toContain("no aplicado en ningún entorno");
    expect(existsSync(join(ROOT, "supabase/migrations", EVENTS_FILE))).toBe(false);
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(/family_collection_disputes|action_deadline_at/);
    }
  });

  it("el README documenta el SHA-256 exacto, que no está aplicada y la misma vuelta atrás", () => {
    const readme = read("docs/deployment/candidates/README.md");
    const sha = createHash("sha256").update(readFileSync(join(ROOT, EVENTS_CANDIDATE))).digest("hex");
    expect(readme).toContain(`| \`${EVENTS_FILE}\` | \`${sha}\` | No aplicada | No aplicada |`);
    expect(readme).toContain(rollbackBlock(sql));
  });

  it("comprueba PostgreSQL 15+, las tablas del libro, la Fase 3 exacta y la ausencia de lo suyo antes de tocar nada", () => {
    const preflight = body.slice(0, body.indexOf("alter table"));
    expect(preflight).toContain("current_setting('server_version_num')::integer < 150000");
    for (const table of ["organizations", "payments", "payment_provider_events", "refunds"]) {
      expect(preflight, table).toContain(`to_regclass('zaltyko.${table}') is null`);
    }
    // Lo suyo ausente: la tabla de disputas, la columna y el check nuevos.
    expect(preflight).toContain("to_regclass('zaltyko.family_collection_disputes') is not null");
    expect(preflight).toContain("attname = 'action_deadline_at'");
    expect(preflight).toContain("conname = 'family_collection_attempts_action_deadline_check'");
    // La Fase 3 tal cual: sus tablas, las columnas exactas de los intentos
    // (las mismas que exige la detección de almacenamiento), sus checks de
    // estado sin requires_action y su índice con el predicado de la Fase 3.
    for (const table of TABLES) expect(preflight, table).toContain(`to_regclass('zaltyko.${table}') is null`);
    const expectedColumns = /<> array\[([\s\S]*?)\]::text\[\]/.exec(preflight)?.[1] ?? "";
    expect([...expectedColumns.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual(
      FAMILY_COLLECTION_TABLES.family_collection_attempts.map(([column, type, nullable]) => `${column}|${type}|${nullable}`)
    );
    expect(preflight).toContain("conname in ('family_collection_attempts_status_check', 'family_collection_attempts_intent_reference_by_status')");
    expect(preflight).toContain("position('requires_action' in pg_get_constraintdef(oid)) = 0");
    const quoted = (text: string) => `'${text.replace(/'/g, "''")}'`;
    expect(preflight).toContain(quoted(FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE));
    expect(preflight).toContain(quoted(`(${FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE})`));
    // Transacción propia con lock_timeout.
    expect(bodyLower.trimStart().startsWith("begin;")).toBe(true);
    expect(bodyLower).toContain("set local lock_timeout = '5s';");
    expect(bodyLower.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("solo cambia lo suyo: los intentos, su índice de un intento abierto y la tabla nueva", () => {
    expect(bodyLower).not.toMatch(/\b(truncate|delete from|insert into|update zaltyko)\b/);
    expect(bodyLower).not.toMatch(/\bdrop table\b|\bdrop column\b|\bdrop [^;]*\bcascade\b/);
    expect([...bodyLower.matchAll(/\bdrop (constraint|index) ([a-z_.]+)/g)].map((match) => `${match[1]} ${match[2]}`)).toEqual([
      "constraint family_collection_attempts_status_check",
      "constraint family_collection_attempts_intent_reference_by_status",
      "index zaltyko.family_collection_attempts_open_uq",
    ]);
    expect([...bodyLower.matchAll(/alter table zaltyko\.([a-z_]+)/g)].map((match) => match[1])).toEqual([
      "family_collection_attempts",
      "family_collection_disputes",
      "family_collection_disputes",
    ]);
    expect([...bodyLower.matchAll(/comment on (table|column) zaltyko\.([a-z_.]+)/g)].map((match) => `${match[1]} ${match[2]}`)).toEqual([
      "table family_collection_disputes",
      "column family_collection_attempts.action_deadline_at",
    ]);
    expect([...bodyLower.matchAll(/create table zaltyko\.([a-z_]+)/g)].map((match) => match[1])).toEqual(["family_collection_disputes"]);
    // Sin tabla de eventos ni de devoluciones nuevas: usa las del libro.
    expect(bodyLower).toContain("references zaltyko.payment_provider_events (organization_id, id)");
    expect(bodyLower).toContain("references zaltyko.payments (organization_id, id, currency)");
  });

  it("requires_action solo con pi_, plazo y tarjeta, y cuenta como intento abierto", () => {
    const added = candidateChecks(attemptsAlter);
    expect([...added.keys()].sort()).toEqual([
      "family_collection_attempts_action_deadline_check",
      "family_collection_attempts_intent_reference_by_status",
      "family_collection_attempts_status_check",
    ]);
    expect(added.get("family_collection_attempts_action_deadline_check")).toBe(
      "status <> 'requires_action' or (action_deadline_at is not null and payment_method_kind = 'card')"
    );
    expect(added.get("family_collection_attempts_intent_reference_by_status")).toBe(
      "(status not in ('created', 'processing', 'requires_action', 'succeeded') or provider_payment_intent_reference is not null) and (status <> 'claimed' or provider_payment_intent_reference is null)"
    );
    expect(added.get("family_collection_attempts_status_check")).toBe(
      `status in (${FAMILY_COLLECTION_ATTEMPT_STATUSES.map((status) => `'${status}'`).join(", ")})`
    );
    expect(droppedAttemptConstraints).toEqual(["family_collection_attempts_status_check", "family_collection_attempts_intent_reference_by_status"]);
    expect(addedAttemptColumns).toEqual([{ name: "action_deadline_at", type: "timestamp with time zone", notNull: false, hasDefault: false }]);
    // El índice se rehace con los estados abiertos del espejo.
    const openStatuses = FAMILY_COLLECTION_OPEN_STATUSES.map((status) => `'${status}'`).join(", ");
    expect(openStatuses).toBe("'claimed', 'created', 'processing', 'requires_action'");
    expect(body).toContain(
      `drop index zaltyko.${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX};\ncreate unique index ${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX}\n  on zaltyko.family_collection_attempts (${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS.join(", ")})\n  where status in (${openStatuses});`
    );
    for (const status of FAMILY_COLLECTION_OPEN_STATUSES) {
      expect(FAMILY_COLLECTION_EVENTS_OPEN_ATTEMPT_PREDICATE).toContain(`'${status}'::text`);
    }
    expect(FAMILY_COLLECTION_EVENTS_OPEN_ATTEMPT_PREDICATE).not.toMatch(/succeeded|failed|canceled/);
    expect(FAMILY_COLLECTION_EVENTS_OPEN_ATTEMPT_PREDICATE).toBe(
      FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE.replace("])", ", 'requires_action'::text])")
    );
  });

  it("espejo Drizzle y candidata describen las mismas columnas y checks", () => {
    // Intentos: las columnas de la Fase 3 más las añadidas, en la detección y en Drizzle.
    const attemptColumns = withPhase4Columns("family_collection_attempts", candidateColumns(phase3Attempts));
    const asSpec = (columns: CandidateColumn[]) => columns.map((column) => [column.name, column.type, column.notNull ? "NO" : "YES"]);
    expect(asSpec(attemptColumns)).toEqual(FAMILY_COLLECTION_EVENTS_TABLES.family_collection_attempts.map((column) => [...column]));
    const drizzleAttemptChecks = Object.fromEntries(
      attemptsConfig.checks.map((check) => [check.name, normalize(dialect.sqlToQuery(check.value).sql)])
    );
    expect(drizzleAttemptChecks).toEqual(Object.fromEntries(withPhase4Checks("family_collection_attempts", candidateChecks(phase3Attempts))));
    // Las tablas que la Fase 4 no toca, iguales en las dos formas.
    for (const table of ["family_collection_attempt_charges", "organization_collection_settings"] as const) {
      expect(FAMILY_COLLECTION_EVENTS_TABLES[table], table).toEqual(FAMILY_COLLECTION_TABLES[table]);
    }
    expect(Object.keys(FAMILY_COLLECTION_EVENTS_TABLES).sort()).toEqual([...TABLES, "family_collection_disputes"].sort());

    // Disputas: columnas, tipos, nulos y valores por defecto.
    const columns = candidateColumns(disputeBlock);
    expect(columns.map((column) => [column.name, column.type, column.notNull ? "NO" : "YES"])).toEqual(
      FAMILY_COLLECTION_EVENTS_TABLES.family_collection_disputes.map((column) => [...column])
    );
    const drizzleColumns = disputeConfig.columns
      .map((column) => ({ name: column.name, type: column.getSQLType(), notNull: column.notNull, hasDefault: column.hasDefault }))
      .sort((left, right) => byCodePoint(left.name, right.name));
    expect(drizzleColumns).toEqual(columns);
    for (const table of Object.keys(FAMILY_COLLECTION_EVENTS_TABLES) as Array<keyof typeof FAMILY_COLLECTION_EVENTS_TABLES>) {
      const names = (FAMILY_COLLECTION_EVENTS_TABLES[table] as readonly ColumnSpec[]).map(([name]) => name);
      expect(names, table).toEqual([...names].sort(byCodePoint));
    }

    // CHECK, únicos, claves foráneas (con su acción) e índices con los mismos nombres.
    const drizzleChecks = Object.fromEntries(
      disputeConfig.checks.map((check) => [check.name, normalize(dialect.sqlToQuery(check.value).sql)])
    );
    expect(drizzleChecks).toEqual(Object.fromEntries(candidateChecks(disputeBlock)));
    expect(disputeConfig.uniqueConstraints.map((unique) => unique.getName()).sort()).toEqual(named(disputeBlock, "unique"));
    expect(bodyLower).toContain(
      `constraint ${FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT.name} unique (${FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT.columns.join(", ")}),`
    );
    const foreignKeys = disputeConfig.foreignKeys.filter((fk) => !fk.getName().endsWith("_organizations_id_fk"));
    expect(foreignKeys.map((fk) => fk.getName()).sort()).toEqual(named(disputeBlock, "foreign key"));
    const actions = foreignKeyActions(disputeBlock);
    expect(Object.fromEntries(foreignKeys.map((fk) => [fk.getName(), fk.onDelete]))).toEqual({
      family_collection_disputes_attempt_fk: "restrict",
      family_collection_disputes_payment_fk: "restrict",
      family_collection_disputes_last_event_fk: "set null",
    });
    for (const fk of foreignKeys) expect(fk.onDelete, fk.getName()).toBe(actions.get(fk.getName()));
    // set null solo de su columna: organization_id nunca pasa a null.
    expect(bodyLower).toContain(
      "foreign key (organization_id, last_provider_event_id)\n    references zaltyko.payment_provider_events (organization_id, id) on delete set null (last_provider_event_id)"
    );
    expect(body).toMatch(/create table zaltyko\.family_collection_disputes \([\s\S]*?organization_id uuid [^\n]*references zaltyko\.organizations\(id\) on delete cascade/);
    const indexNames = [...body.matchAll(/create (?:unique )?index ([a-z_]+)/g)].map((match) => match[1]!).sort();
    expect([...disputeConfig.indexes.map((index) => index.config.name!), FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX].sort()).toEqual(indexNames);
    for (const index of disputeConfig.indexes) {
      expect(body, index.config.name).toContain(`create index ${index.config.name}\n  on zaltyko.family_collection_disputes (`);
    }
    expect(bodyLower).toContain(
      "create index family_collection_disputes_status_idx\n  on zaltyko.family_collection_disputes (organization_id, status, updated_at);"
    );
    const names = [...body.matchAll(/(?:constraint|create (?:unique )?index) ([a-z_]+)/g)].map((match) => match[1]!);
    for (const name of names) expect(name.length, name).toBeLessThan(63);
  });

  it("disputa: referencias opacas, importe en EUR, estados de Stripe y closed_at solo en los cerrados", () => {
    const checks = candidateChecks(disputeBlock);
    expect(checks.get("family_collection_disputes_reference_format")).toBe(
      "char_length(provider_dispute_reference) <= 255 and provider_dispute_reference ~ '^(dp|du)_[a-za-z0-9_]+$'"
    );
    expect(checks.get("family_collection_disputes_charge_reference_format")).toBe(
      "char_length(provider_charge_reference) <= 255 and provider_charge_reference ~ '^(ch|py)_[a-za-z0-9_]+$'"
    );
    expect(checks.get("family_collection_disputes_amount_check")).toBe("amount_cents > 0");
    expect(checks.get("family_collection_disputes_currency_check")).toBe("currency = 'eur'");
    expect(checks.get("family_collection_disputes_status_check")).toBe(
      `status in (${FAMILY_COLLECTION_DISPUTE_STATUSES.map((status) => `'${status}'`).join(", ")})`
    );
    expect(checks.get("family_collection_disputes_reason_code_format")).toBe("reason_code is null or reason_code ~ '^[a-z0-9_]{1,64}$'");
    expect(checks.get("family_collection_disputes_closed_iff_final")).toBe(
      `(status in (${FAMILY_COLLECTION_DISPUTE_CLOSED_STATUSES.map((status) => `'${status}'`).join(", ")})) = (closed_at is not null)`
    );
    expect([...FAMILY_COLLECTION_DISPUTE_CLOSED_STATUSES].every((status) => (FAMILY_COLLECTION_DISPUTE_STATUSES as readonly string[]).includes(status))).toBe(true);
    // Ningún mensaje, prueba ni dato de tarjeta, banco o identidad.
    const columnNames = candidateColumns(disputeBlock).map((column) => column.name);
    for (const forbidden of ["failure_message", "message", "evidence", "evidence_details", "last4", "brand", "iban", "email", "name", "description", "metadata", "payload"]) {
      expect(columnNames, forbidden).not.toContain(forbidden);
    }
  });

  it("habilita y fuerza RLS en la tabla nueva y solo concede select, insert y update a service_role", () => {
    expect(lower).toContain("alter table zaltyko.family_collection_disputes enable row level security;");
    expect(lower).toContain("alter table zaltyko.family_collection_disputes force row level security;");
    expect(lower).toContain("revoke all on table zaltyko.family_collection_disputes\n  from public, anon, authenticated, service_role;");
    expect(lower).toContain("grant select, insert, update on table zaltyko.family_collection_disputes\n  to service_role;");
    expect([...bodyLower.matchAll(/\bgrant\b/g)]).toHaveLength(1);
    expect(bodyLower).not.toMatch(/create policy/);
  });

  it("la vuelta atrás comentada deja la Fase 3 exactamente como la instala su candidata", () => {
    const rollback = rollbackBlock(sql);
    const rollbackLower = rollback.toLowerCase();
    expect(rollbackLower.startsWith("begin;\nset local lock_timeout = '5s';\n")).toBe(true);
    expect(rollbackLower.endsWith("\ncommit;")).toBe(true);
    expect(rollbackLower).toContain("drop table zaltyko.family_collection_disputes;");
    expect(rollbackLower).toContain("drop constraint family_collection_attempts_action_deadline_check,");
    expect(rollbackLower).toContain("drop column action_deadline_at;");
    // Rehace los dos checks y el índice con el texto exacto de la Fase 3.
    const phase3Checks = candidateChecks(phase3Attempts);
    const restored = candidateChecks(rollback);
    expect([...restored.keys()].sort()).toEqual(["family_collection_attempts_intent_reference_by_status", "family_collection_attempts_status_check"]);
    for (const [name, expression] of restored) expect(expression, name).toBe(phase3Checks.get(name));
    expect(rollbackLower).toContain(
      "create unique index family_collection_attempts_open_uq\n  on zaltyko.family_collection_attempts (organization_id, invoice_id)\n  where status in ('claimed', 'created', 'processing');"
    );
    expect(stripSqlComments(read(CANDIDATE)).toLowerCase()).toContain(
      "create unique index family_collection_attempts_open_uq\n  on zaltyko.family_collection_attempts (organization_id, invoice_id)\n  where status in ('claimed', 'created', 'processing');"
    );
    // El bloque no se ejecuta con el archivo: todo él es comentario.
    expect(body).not.toContain("drop table zaltyko.family_collection_disputes");
  });
});
