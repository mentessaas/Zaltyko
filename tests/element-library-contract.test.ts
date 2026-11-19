import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  CATALOG_DISCIPLINES,
  CATALOG_EDITION_TITLE_MAX,
  CATALOG_ELEMENT_DESCRIPTION_MAX,
  CATALOG_ELEMENT_GROUP_MAX,
  CATALOG_ELEMENT_NAME_MAX,
  CATALOG_ELEMENT_NAME_MIN,
  CATALOG_ELEMENT_SHORT_NAME_MAX,
  CATALOG_FIG_REFERENCE_MAX,
  CATALOG_WITHDRAWN_REASON_MAX,
  EDITION_CODES,
  EDITION_DISCIPLINE,
  EDITION_STATUSES,
  ELEMENT_DATA_NOTICE,
  ELEMENT_KEY_PATTERN,
  ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG,
  ELEMENT_LIBRARY_ENV_FLAG,
  ELEMENT_NOTE_MAX,
  REVIEW_STATUSES,
  VALUE_LETTERS,
  type EditionFile,
  type ElementDataFile,
} from "@/modules/element-library/domain/element-library";
import { ELEMENT_SEED_TABLES, renderElementSeedSql } from "@/modules/element-library/domain/seed-sql";
import {
  ELEMENT_LIBRARY_LINK_COLUMNS,
  ELEMENT_LIBRARY_TABLES,
  academyElementNotes,
  catalogElementEditions,
  catalogElements,
  contentNotices,
  contentWithdrawals,
} from "@/modules/element-library/infrastructure/element-library-schema";
import { SKILL_APPARATUS_BY_DISCIPLINE } from "@/modules/skill-levels/domain/skill-levels";

/**
 * Contrato de las candidatas SQL de la biblioteca de elementos. Las tablas no
 * están en supabase/migrations, así que este test protege que las candidatas,
 * el espejo Drizzle y ELEMENT_LIBRARY_TABLES coincidan, que los CHECK sigan
 * los límites del dominio, que todas las tablas tengan RLS forzado y REVOKE a
 * clientes directos, que no haya columnas de vídeo, imagen ni URL de terceros,
 * que drizzle-kit no pueda crearlas por su cuenta, que las banderas estén
 * apagadas por defecto y que el README documente los dos archivos con su hash.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const LIBRARY_FILE = "20261119120000_element_library_candidate.sql";
const NOTES_FILE = "20261119120500_element_library_notes_candidate.sql";
const LIBRARY = `docs/deployment/candidates/${LIBRARY_FILE}`;
const NOTES = `docs/deployment/candidates/${NOTES_FILE}`;
const SCHEMA = "src/modules/element-library/infrastructure/element-library-schema.ts";
const TABLES = Object.keys(ELEMENT_LIBRARY_TABLES).sort();
const LIBRARY_TABLES = ["catalog_element_editions", "catalog_elements", "content_notices", "content_withdrawals"];

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
  "numeric(4,2)": "numeric(4,2)",
};

const byName = <T extends { name: string }>(left: T, right: T) =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0;

function tableBlocks(sql: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of stripSqlComments(sql).matchAll(/create table zaltyko\.([a-z_]+) \(\n([\s\S]*?)\n\);/g)) {
    blocks.set(match[1]!, match[2]!);
  }
  return blocks;
}

/** Columnas declaradas en un `create table zaltyko.<name> (...)`. */
function candidateColumns(block: string): CandidateColumn[] {
  return block
    .split("\n")
    .map((line) => line.match(/^  ([a-z_]+) (uuid|text|date|integer|boolean|timestamptz|numeric\(4,2\))(?=[\s,]|$)(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1]!,
      type: SQL_TYPES[match[2]!]!,
      notNull: /\bnot null\b|\bprimary key\b/.test(match[3]!),
      hasDefault: /\bdefault\b/.test(match[3]!),
    }))
    .sort(byName);
}

/** Solo se normalizan los espacios: el texto del CHECK se compara tal cual. */
const normalize = (expression: string) => expression.replace(/\s+/g, " ").trim();

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
    checks.set(match[1]!, normalize(block.slice(start, index - 1)));
  }
  return checks;
}

function candidateUniques(block: string): string[] {
  return [...block.matchAll(/constraint ([a-z_]+) unique \(/g)].map((match) => match[1]!).sort();
}

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(", ");
const sha256 = (path: string) => createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

const librarySql = read(LIBRARY);
const notesSql = read(NOTES);
const blocks = new Map([...tableBlocks(librarySql), ...tableBlocks(notesSql)]);
const drizzleTables = new Map(
  [catalogElementEditions, catalogElements, contentNotices, contentWithdrawals, academyElementNotes].map((table) => {
    const config = getTableConfig(table);
    return [config.name, config] as const;
  })
);
const dialect = new PgDialect();
const checksOf = (table: string) => candidateChecks(blocks.get(table)!);

describe("candidatas SQL de la biblioteca de elementos", () => {
  it("se marcan como pendientes de autorización y no están en el historial aplicable", () => {
    for (const [file, sql] of [
      [LIBRARY_FILE, librarySql],
      [NOTES_FILE, notesSql],
    ] as const) {
      const lower = sql.toLowerCase();
      expect(lower, file).toContain("candidate only");
      expect(lower, file).toContain("requiere autorización de elvis");
      expect(lower, file).toContain("no aplicado en ningún entorno");
      expect(existsSync(join(ROOT, "supabase/migrations", file)), file).toBe(false);
    }
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(
        /catalog_element|content_notices|content_withdrawals|academy_element_notes/
      );
    }
  });

  it("abren y cierran su transacción con lock_timeout y comentan la vuelta atrás", () => {
    for (const sql of [librarySql, notesSql]) {
      const body = stripSqlComments(sql).trim();
      expect(body.startsWith("begin;\n\nset local lock_timeout = '5s';")).toBe(true);
      expect(body.endsWith("commit;")).toBe(true);
      const rollback = sql.match(/^-- >>> vuelta atrás\n([\s\S]*?)^-- <<< vuelta atrás$/m);
      expect(rollback).not.toBeNull();
      for (const line of rollback![1]!.split("\n").filter(Boolean)) expect(line.startsWith("-- ")).toBe(true);
    }
    // Columnas y tablas en orden inverso a su creación.
    const libraryRollback = librarySql.match(/^-- >>> vuelta atrás\n([\s\S]*?)^-- <<< vuelta atrás$/m)![1]!;
    expect(libraryRollback.split("\n").filter(Boolean)).toEqual([
      "-- begin;",
      "-- set local lock_timeout = '5s';",
      "-- alter table zaltyko.session_plan_blocks drop column catalog_element_id;",
      "-- alter table zaltyko.skill_elements drop column catalog_element_id;",
      "-- drop table zaltyko.content_withdrawals;",
      "-- drop table zaltyko.content_notices;",
      "-- drop table zaltyko.catalog_elements;",
      "-- drop table zaltyko.catalog_element_editions;",
      "-- commit;",
    ]);
    expect(notesSql).toContain("-- drop table zaltyko.academy_element_notes;");
  });

  it("abortan antes de crear nada si ya existe algo o falta lo que requieren", () => {
    const lower = stripSqlComments(librarySql.toLowerCase());
    const preflightEnd = lower.indexOf("$element_library_candidate_preflight$;");
    expect(preflightEnd).toBeGreaterThan(0);
    expect(preflightEnd).toBeLessThan(lower.indexOf("create table"));
    expect(preflightEnd).toBeLessThan(lower.indexOf("alter table"));
    const preflight = lower.slice(0, preflightEnd);
    for (const table of LIBRARY_TABLES) {
      expect(preflight, table).toContain(`to_regclass('zaltyko.${table}') is not null`);
    }
    expect(preflight).toContain("attname = 'catalog_element_id'");
    // Niveles y guiones con las columnas exactas de sus candidatas.
    for (const table of Object.keys(ELEMENT_LIBRARY_LINK_COLUMNS)) {
      expect(preflight, table).toContain(`and table_name = '${table}'`);
    }
    expect(preflight).toContain("'is_required|boolean|no'");
    expect(preflight).toContain("'done_by_member_id|uuid|yes'");
    expect(preflight.match(/raise exception/g)).toHaveLength(2);

    const notes = stripSqlComments(notesSql.toLowerCase());
    const notesEnd = notes.indexOf("$element_library_notes_candidate_preflight$;");
    expect(notesEnd).toBeLessThan(notes.indexOf("create table"));
    const notesPreflight = notes.slice(0, notesEnd);
    for (const table of LIBRARY_TABLES) {
      expect(notesPreflight, table).toContain(`to_regclass('zaltyko.${table}') is null`);
    }
    expect(notesPreflight).toContain("to_regclass('zaltyko.academy_element_notes') is not null");
  });

  it("crean exactamente las tablas, columnas, tipos, NOT NULL y defaults del espejo y de ELEMENT_LIBRARY_TABLES", () => {
    expect([...tableBlocks(librarySql).keys()].sort()).toEqual(LIBRARY_TABLES);
    expect([...tableBlocks(notesSql).keys()]).toEqual(["academy_element_notes"]);
    expect([...blocks.keys()].sort()).toEqual(TABLES);
    expect([...drizzleTables.keys()].sort()).toEqual(TABLES);
    for (const table of TABLES) {
      const columns = candidateColumns(blocks.get(table)!);
      const config = drizzleTables.get(table)!;
      expect(config.schema, table).toBe("zaltyko");
      expect(
        columns.map((column) => column.name),
        table
      ).toEqual([...ELEMENT_LIBRARY_TABLES[table as keyof typeof ELEMENT_LIBRARY_TABLES]]);
      const drizzleColumns = config.columns
        .map((column) => ({
          name: column.name,
          type: column.getSQLType().replace(/,\s+/g, ","),
          notNull: column.notNull,
          hasDefault: column.hasDefault,
        }))
        .sort(byName);
      expect(drizzleColumns, table).toEqual(columns);
    }
  });

  it("repite en Drizzle cada CHECK con el mismo nombre y la misma expresión", () => {
    for (const table of TABLES) {
      const drizzleChecks = new Map(
        drizzleTables.get(table)!.checks.map((check) => [check.name, normalize(dialect.sqlToQuery(check.value).sql)])
      );
      expect(Object.fromEntries(drizzleChecks), table).toEqual(Object.fromEntries(checksOf(table)));
    }
  });

  it("sigue los límites y listas del dominio de la biblioteca", () => {
    const editions = checksOf("catalog_element_editions");
    expect(editions.get("catalog_element_editions_code_check")).toBe(`code in (${quoted(EDITION_CODES)})`);
    expect(editions.get("catalog_element_editions_discipline_check")).toBe(
      `discipline in (${quoted(CATALOG_DISCIPLINES)})`
    );
    expect(editions.get("catalog_element_editions_code_discipline_check")).toBe(
      EDITION_CODES.map((code) => `(code = '${code}' and discipline = '${EDITION_DISCIPLINE[code]}')`).join(" or ")
    );
    expect(editions.get("catalog_element_editions_status_check")).toBe(`status in (${quoted(EDITION_STATUSES)})`);
    expect(editions.get("catalog_element_editions_title_check")).toContain(
      `length(title) <= ${CATALOG_EDITION_TITLE_MAX}`
    );
    expect(editions.get("catalog_element_editions_document_url_check")).toContain("document_url ~ '^https://'");

    const elements = checksOf("catalog_elements");
    expect(elements.get("catalog_elements_key_check")).toBe(`element_key ~ '${ELEMENT_KEY_PATTERN.source}'`);
    expect(elements.get("catalog_elements_discipline_check")).toBe(`discipline in (${quoted(CATALOG_DISCIPLINES)})`);
    expect(elements.get("catalog_elements_apparatus_check")).toBe(
      CATALOG_DISCIPLINES.map(
        (discipline) =>
          `(discipline = '${discipline}' and apparatus in (${quoted(SKILL_APPARATUS_BY_DISCIPLINE[discipline])}))`
      ).join(" or ")
    );
    expect(elements.get("catalog_elements_group_check")).toBe(
      normalize(`element_group ~ '^[A-Za-z0-9_-]{1,${CATALOG_ELEMENT_GROUP_MAX}}$'`)
    );
    expect(elements.get("catalog_elements_value_letter_check")).toBe(
      normalize(`value_letter is null or value_letter ~ '^[${VALUE_LETTERS[0]}-${VALUE_LETTERS.at(-1)}]$'`)
    );
    // Letra o puntos, exactamente uno; puntos solo en salto.
    expect(elements.get("catalog_elements_value_one_check")).toBe("(value_letter is null) <> (value_points is null)");
    expect(elements.get("catalog_elements_value_points_vault_check")).toBe("value_points is null or apparatus = 'vault'");
    expect(elements.get("catalog_elements_name_check")).toContain(
      `length(btrim(name)) >= ${CATALOG_ELEMENT_NAME_MIN} and length(name) <= ${CATALOG_ELEMENT_NAME_MAX}`
    );
    expect(elements.get("catalog_elements_short_name_check")).toContain(
      `length(short_name) <= ${CATALOG_ELEMENT_SHORT_NAME_MAX}`
    );
    expect(elements.get("catalog_elements_description_check")).toContain(
      `length(description) <= ${CATALOG_ELEMENT_DESCRIPTION_MAX}`
    );
    expect(elements.get("catalog_elements_fig_reference_check")).toContain(
      `length(fig_reference) <= ${CATALOG_FIG_REFERENCE_MAX}`
    );
    expect(elements.get("catalog_elements_withdrawn_reason_check")).toContain(
      `length(withdrawn_reason) <= ${CATALOG_WITHDRAWN_REASON_MAX}`
    );
    expect(elements.get("catalog_elements_review_status_check")).toBe(`review_status in (${quoted(REVIEW_STATUSES)})`);
    expect(elements.get("catalog_elements_reviewed_on_check")).toBe("(review_status = 'reviewed') = (reviewed_on is not null)");
    expect(elements.get("catalog_elements_withdrawn_check")).toBe("(withdrawn_at is null) = (withdrawn_reason is null)");
    expect(blocks.get("catalog_elements")).toContain("  value_points numeric(4,2),");

    const notices = checksOf("content_notices");
    expect(notices.get("content_notices_sender_check")).toBe(
      "(sender_erased_at is null and sender_name is not null and sender_email is not null) or (sender_erased_at is not null and sender_name is null and sender_email is null)"
    );
    expect(notices.get("content_notices_good_faith_check")).toBe("good_faith_confirmed = true");
    expect(notices.get("content_notices_closed_check")).toBe("(status = 'closed') = (closed_at is not null)");
    expect(notices.get("content_notices_status_check")).toBe("status in ('received', 'reviewing', 'closed')");
    expect(notices.get("content_notices_content_kind_check")).toBe(
      "content_kind in ('element', 'federation_template', 'other')"
    );
    expect(notices.get("content_notices_reason_check")).toBe("length(btrim(reason)) >= 10 and length(reason) <= 2000");

    expect(checksOf("content_withdrawals").get("content_withdrawals_kind_check")).toBe("kind in ('federation_template')");
    expect(checksOf("academy_element_notes").get("academy_element_notes_note_check")).toBe(
      `length(btrim(note)) >= 1 and length(note) <= ${ELEMENT_NOTE_MAX}`
    );
  });

  it("nombra únicos e índices igual que el espejo y por debajo del límite de 63 caracteres", () => {
    const body = stripSqlComments(`${librarySql}\n${notesSql}`.toLowerCase());
    for (const table of TABLES) {
      const config = drizzleTables.get(table)!;
      expect(config.uniqueConstraints.map((unique) => unique.getName()).sort(), table).toEqual(
        candidateUniques(blocks.get(table)!)
      );
      for (const index of config.indexes) {
        expect(body, index.config.name).toContain(`create index ${index.config.name}\n  on zaltyko.${table}(`);
      }
    }
    expect(body).toContain("constraint catalog_element_editions_code_uq unique (code)");
    expect(body).toContain("constraint catalog_elements_edition_key_uq unique (edition_id, element_key)");
    expect(body).toContain("constraint content_notices_submission_hash_uq unique (submission_hash)");
    expect(body).toContain("constraint content_withdrawals_kind_key_uq unique (kind, key)");
    expect(body).toContain("constraint academy_element_notes_element_uq unique (organization_id, catalog_element_id)");
    expect(body).toContain("create index catalog_elements_browse_idx\n  on zaltyko.catalog_elements(edition_id, apparatus, element_group);");
    expect(body).toContain("create index content_notices_status_idx\n  on zaltyko.content_notices(status, closed_at);");
    const names = [...body.matchAll(/(?:constraint|create index) ([a-z_]+)/g)].map((match) => match[1]!);
    expect(names.length).toBeGreaterThan(45);
    for (const name of names) expect(name.length, name).toBeLessThan(63);
    expect(names).toContain("academy_element_notes_created_by_fk");
    expect(names).toContain("academy_element_notes_updated_by_fk");
  });

  it("declara las claves foráneas del catálogo, los avisos y las notas", () => {
    const body = stripSqlComments(`${librarySql}\n${notesSql}`.toLowerCase());
    expect(body).toContain(
      "edition_id uuid not null references zaltyko.catalog_element_editions(id) on delete restrict"
    );
    expect(body).toContain("notice_id uuid references zaltyko.content_notices(id) on delete set null,");
    expect(body.indexOf("create table zaltyko.content_notices")).toBeLessThan(
      body.indexOf("create table zaltyko.content_withdrawals")
    );
    const notes = blocks.get("academy_element_notes")!;
    expect(notes).toContain("organization_id uuid not null references zaltyko.organizations(id) on delete cascade");
    expect(notes).toContain(
      "catalog_element_id uuid not null references zaltyko.catalog_elements(id) on delete restrict"
    );
    for (const column of ["created_by_member_id", "updated_by_member_id"]) {
      expect(notes, column).toContain(
        `foreign key (organization_id, ${column}) references zaltyko.organization_members(organization_id, id) on delete set null (${column})`
      );
    }
    // Las dos claves compuestas de autoría llevan nombre, igual en el espejo.
    const authorship = ["academy_element_notes_created_by_fk", "academy_element_notes_updated_by_fk"];
    for (const name of authorship) expect(notes, name).toContain(`constraint ${name} foreign key (organization_id, `);
    expect(
      drizzleTables
        .get("academy_element_notes")!
        .foreignKeys.map((foreignKey) => foreignKey.getName())
        .filter((name) => authorship.includes(name))
        .sort()
    ).toEqual(authorship);
    // El catálogo y los avisos son globales: sin organization_id.
    for (const table of LIBRARY_TABLES) expect(blocks.get(table), table).not.toContain("organization_id");
  });

  it("añade el enlace opcional a niveles y guiones sin valor por defecto, con índice parcial", () => {
    const body = stripSqlComments(librarySql.toLowerCase());
    const added = [...body.matchAll(/alter table zaltyko\.([a-z_]+) add column ([a-z_]+) ([^;]*);/g)].map((match) => ({
      table: match[1]!,
      column: match[2]!,
      definition: match[3]!,
    }));
    const expected = Object.entries(ELEMENT_LIBRARY_LINK_COLUMNS).flatMap(([table, columns]) =>
      columns.map((column) => ({
        table,
        column,
        definition: "uuid references zaltyko.catalog_elements(id) on delete restrict",
      }))
    );
    expect(added).toEqual(expected);
    for (const table of Object.keys(ELEMENT_LIBRARY_LINK_COLUMNS)) {
      expect(body, table).toContain(
        `create index ${table}_catalog_element_idx\n  on zaltyko.${table}(catalog_element_id)\n  where catalog_element_id is not null;`
      );
    }
    expect(body).not.toMatch(/\bupdate zaltyko\./);
  });

  it("habilita y fuerza RLS y revoca a public, anon y authenticated en todas, sin grants ni políticas", () => {
    const lower = `${librarySql}\n${notesSql}`.toLowerCase();
    for (const table of TABLES) {
      expect(lower, table).toContain(`alter table zaltyko.${table} enable row level security;`);
      expect(lower, table).toContain(`alter table zaltyko.${table} force row level security;`);
      expect(lower, table).toContain(`revoke all on table zaltyko.${table} from public, anon, authenticated;`);
    }
    expect(stripSqlComments(lower)).not.toMatch(/\bgrant\b/);
    expect(stripSqlComments(lower)).not.toMatch(/create policy/);
  });

  it("no tiene columnas de vídeo, imagen ni URL salvo el documento oficial y el contenido señalado", () => {
    const columns = TABLES.flatMap((table) => [...ELEMENT_LIBRARY_TABLES[table as keyof typeof ELEMENT_LIBRARY_TABLES]]);
    const linkColumns = Object.values(ELEMENT_LIBRARY_LINK_COLUMNS).flat();
    const suspicious = [...columns, ...linkColumns].filter((column) => /video|youtube|image|url/.test(column));
    expect(suspicious.sort()).toEqual(["content_url", "document_url"]);
  });

  it("acepta exactamente las columnas que escribe la semilla generada", () => {
    const edition: EditionFile = {
      code: "fig-wag-2025-2028",
      discipline: "artistic_female",
      cycleStart: 2025,
      cycleEnd: 2028,
      title: "Código de prueba",
      documentUrl: "https://www.gymnastics.sport/",
      coverDate: "2026-10-14",
      status: "draft",
      groups: { vault: [{ key: "1", label: "Grupo de prueba" }] },
    };
    const file: ElementDataFile = {
      aviso: ELEMENT_DATA_NOTICE,
      edition: "fig-wag-2025-2028",
      apparatus: "vault",
      elements: [
        {
          elementKey: "ci_vault_one",
          group: "1",
          valuePoints: 2.4,
          name: "Salto de prueba uno",
          shortName: "Prueba uno",
          sourcePage: 10,
          sourceCheckedOn: "2026-11-19",
          draftedBy: "Claude",
          draftedOn: "2026-11-19",
          batch: 1,
          reviewStatus: "draft",
        },
      ],
    };
    const seed = renderElementSeedSql(edition, [file], 1);
    const inserted = (table: string) => {
      const match = seed.match(new RegExp(`insert into ${table.replace(".", "\\.")}\\n  \\(([^)]*)\\)`));
      expect(match, table).not.toBeNull();
      return match![1]!.split(", ");
    };
    for (const [key, table] of Object.entries(ELEMENT_SEED_TABLES)) {
      const name = table.replace("zaltyko.", "") as keyof typeof ELEMENT_LIBRARY_TABLES;
      const columns = inserted(table);
      for (const column of columns) expect(ELEMENT_LIBRARY_TABLES[name], `${key}.${column}`).toContain(column);
      // La semilla nunca escribe la retirada.
      expect(columns, key).not.toContain("withdrawn_at");
      expect(columns, key).not.toContain("withdrawn_reason");
    }
    expect(seed).toContain("on conflict (code) do update set");
    expect(seed).toContain("on conflict (edition_id, element_key) do update set");
  });

  it("documenta las dos candidatas en el README con su SHA-256 y el orden de instalación", () => {
    const readme = read("docs/deployment/candidates/README.md");
    for (const path of [LIBRARY, NOTES]) {
      expect(readme, path).toContain(path.split("/").at(-1)!);
      expect(readme, path).toContain(sha256(path));
    }
    const section = readme.slice(readme.indexOf("## Candidatas de la biblioteca de elementos"));
    expect(section).toContain("No se ha aplicado en ningún entorno");
    expect(section.indexOf(LIBRARY_FILE)).toBeLessThan(section.indexOf(NOTES_FILE));
  });
});

describe("el esquema de la biblioteca queda fuera de drizzle-kit y de validate:rls", () => {
  it("no se exporta desde los índices ni vive en src/db/schema", () => {
    for (const path of ["src/db/schema/index.ts", "src/db/zaltyko-schema.ts", "drizzle.config.ts"]) {
      expect(read(path), path).not.toMatch(/element-library/);
    }
    const schemaDir = join(ROOT, "src/db/schema");
    for (const entry of readdirSync(schemaDir)) {
      const path = join(schemaDir, entry);
      if (statSync(path).isFile()) {
        expect(readFileSync(path, "utf8"), entry).not.toMatch(
          /"(catalog_element_editions|catalog_elements|content_notices|content_withdrawals|academy_element_notes)"/
        );
      }
    }
    expect(read(SCHEMA)).toContain("NO se exporta");
  });
});

describe("banderas apagadas por defecto", () => {
  it("están documentadas en .env.example con el valor false y vinculadas a las candidatas", () => {
    const example = read(".env.example");
    for (const flag of [ELEMENT_LIBRARY_ENV_FLAG, ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG]) {
      expect(example, flag).toMatch(new RegExp(`^${flag}=false$`, "m"));
    }
    expect(example).toContain(LIBRARY_FILE);
    expect(example).toContain(NOTES_FILE);
  });
});
