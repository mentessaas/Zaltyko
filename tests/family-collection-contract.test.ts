import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { execute: vi.fn() } }));

import {
  FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX,
  FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS,
  FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE,
  FAMILY_COLLECTION_TABLES,
  FAMILY_COLLECTION_UNIQUE_CONSTRAINTS,
  isFamilyCollectionStorageAvailable,
} from "@/modules/family-collection/application/storage";
import {
  familyCollectionAttemptCharges,
  familyCollectionAttempts,
  organizationCollectionSettings,
} from "@/modules/family-collection/infrastructure/family-collection-schema";

/**
 * Contrato de la candidata de la Fase 3 del cobro automático. Sus tablas no
 * están en supabase/migrations, así que este test protege que la candidata, el
 * espejo Drizzle y la detección de almacenamiento describan lo mismo (columnas,
 * tipos, nulos, checks, únicos, índices y claves foráneas), que las tres
 * tablas sean solo de servidor y que drizzle-kit no pueda crearlas por su
 * cuenta. Las reglas reales las comprueba tests/family-collection-pg.test.ts.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANDIDATE_FILE = "20261117120000_family_collection_candidate.sql";
const CANDIDATE = `docs/deployment/candidates/${CANDIDATE_FILE}`;
const SCHEMA = "src/modules/family-collection/infrastructure/family-collection-schema.ts";
const TABLES = ["family_collection_attempt_charges", "family_collection_attempts", "organization_collection_settings"] as const;

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
    .map((line) => line.match(/^ {2}([a-z_]+) (uuid|text|timestamptz|integer|bigint|smallint)\b(.*)$/))
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
      expect(drizzleColumns, table).toEqual(columns);
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
      expect(drizzleChecks, table).toEqual(Object.fromEntries(candidateChecks(block)));
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
    expect(normalize(dialect.sqlToQuery(drizzleOpen!.config.where as SQL).sql)).toBe("status in ('claimed', 'created', 'processing')");
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
      "next_retry_at is null or (payment_method_kind = 'card' and attempt_number <= 3)"
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

  it("exige cada tabla con sus columnas, tipos y nulos exactos y el índice de un intento abierto", async () => {
    const execute = vi.fn(async (_query: SQL) => ({ rows: [{ available: true }] }));
    expect(await isFamilyCollectionStorageAvailable({ execute } as never)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    for (const table of TABLES) {
      expect(query.params, table).toContain(table);
      expectBoundArray(
        query,
        specOf(table).map(([column, type, nullable]) => `${column}|${type}|${nullable}`),
        table
      );
    }
    // Índice parcial: único, válido, con sus columnas y su predicado.
    expect(query.params).toContain(`zaltyko.${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX}`);
    expect(query.params).toContain(FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE);
    expect(query.params).toContain(`(${FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE})`);
    expect(query.sql).toContain("i.indisunique");
    expect(query.sql).toContain("i.indisvalid");
    expect(query.sql).toContain("pg_get_expr(i.indpred, i.indrelid)");
    expectBoundArray(query, FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS, FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX);
    // Únicos de número de intento y de pi_, con sus columnas.
    for (const [name, columns] of Object.entries(FAMILY_COLLECTION_UNIQUE_CONSTRAINTS)) {
      expect(query.params, name).toContain(name);
      expectBoundArray(query, columns, name);
    }
    expect(query.sql).toContain("c.contype = 'u'");
    expect(query.sql).toContain("information_schema.columns");
    // Solo lee el catálogo, y ninguna columna esperada va como texto en la consulta.
    expect(query.sql).not.toMatch(/\b(create|alter|insert|update|delete|grant)\b/i);
    expect(query.sql).not.toContain("provider_payment_intent_reference");
  });

  it("responde que no está disponible si el catálogo no lo confirma", async () => {
    const cases: Array<Array<Record<string, unknown>>> = [[{ available: false }], [{ available: null }], [{}], []];
    for (const rows of cases) {
      const execute = vi.fn(async () => ({ rows }));
      expect(await isFamilyCollectionStorageAvailable({ execute } as never), JSON.stringify(rows)).toBe(false);
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
          /"family_collection_attempts"|"family_collection_attempt_charges"|"organization_collection_settings"/
        );
      }
    }
    expect(read(SCHEMA)).toContain("NO se exportan");
  });
});
