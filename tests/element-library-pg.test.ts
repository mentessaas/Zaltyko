import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  ELEMENT_DATA_NOTICE,
  type EditionFile,
  type ElementDataFile,
  type ElementRecord,
} from "@/modules/element-library/domain/element-library";
import { renderElementSeedSql } from "@/modules/element-library/domain/seed-sql";

import { dropElementLibraryCandidates } from "./helpers/element-library-candidate";

/**
 * Candidatas de la biblioteca de elementos sobre PostgreSQL desechable de
 * GitHub. Instala las candidatas de objetivos, guiones y niveles si faltan y
 * después las dos de la biblioteca, solo aquí y después de todos los guardas,
 * y lo retira todo al terminar; nunca en un proyecto enlazado ni con
 * credenciales externas. Cubre: orden e idempotencia de las candidatas
 * (abortan sin dejar nada a medias), RLS/REVOKE, CHECK de valor, semilla
 * generada idempotente, retirada que sobrevive a la semilla, revisado que no
 * vuelve a borrador, guarda de cambios sin nueva revisión, claves foráneas
 * restrict y la vuelta atrás comentada.
 */
const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";

function assertDisposableTarget() {
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  let target: URL;
  try {
    target = new URL(connection ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    !disposablePgEnabled ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.username !== "supabase_admin" ||
    !target.password ||
    !target.port ||
    target.pathname !== "/postgres" ||
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(
      (value) => value !== connection
    )
  ) {
    throw new Error("Disposable GitHub Linux loopback Postgres is required");
  }
  for (const name of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const candidate = (name: string) => readFileSync(resolve(process.cwd(), "docs/deployment/candidates", name), "utf8");
const PROGRESS = "20261111120000_athlete_progress_candidate.sql";
const PLANS = "20261111200000_session_plans_candidate.sql";
const LEVELS = "20261114121000_skill_levels_candidate.sql";
const LIBRARY = "20261119120000_element_library_candidate.sql";
const NOTES = "20261119120500_element_library_notes_candidate.sql";

const LIBRARY_ALREADY =
  "Element library candidate requires zaltyko.catalog_element_editions, zaltyko.catalog_elements, zaltyko.content_notices, zaltyko.content_withdrawals, skill_elements.catalog_element_id and session_plan_blocks.catalog_element_id absent; inspect existing schema before promotion";
const LIBRARY_REQUIRES =
  "Element library candidate requires the skill levels (20261114121000) and session plans (20261111200000) candidates installed first, with their exact shape";
const NOTES_REQUIRES =
  "Element library notes candidate requires the element library candidate (20261119120000) installed first";
const NOTES_ALREADY =
  "Element library notes candidate requires zaltyko.academy_element_notes absent; inspect existing schema before promotion";

const NEW_TABLES = [
  "academy_element_notes",
  "catalog_element_editions",
  "catalog_elements",
  "content_notices",
  "content_withdrawals",
];
const LINKED_TABLES = ["skill_elements", "session_plan_blocks"];

type PgFailure = { code?: string; message?: string; constraint?: string; cause?: PgFailure } | null;

/** Error de PostgreSQL de una sentencia que debe fallar (Drizzle lo envuelve en `cause`). */
async function failureOf(statement: Promise<unknown>): Promise<PgFailure> {
  const failure = (await statement.then(
    () => null,
    (error) => error
  )) as PgFailure;
  return failure?.cause ?? failure;
}

/**
 * Las candidatas y las semillas abren su propia transacción (`begin; …
 * commit;`). Si fallan a mitad, la conexión queda en una transacción abortada;
 * por eso se ejecutan en una conexión propia que se cierra al terminar y nunca
 * vuelve al pool de `db`. Solo se llama después de assertDisposableTarget().
 */
async function runOnOwnConnection(text: string): Promise<void> {
  const client = new Client({ connectionString: process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

/** Bloque de vuelta atrás comentado de una candidata, sin los `-- `. */
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

async function exists(table: string): Promise<boolean> {
  const result = await db.execute(sql`select to_regclass(${`zaltyko.${table}`}::text) is not null as present`);
  return (result.rows[0] as { present: boolean }).present;
}

/** Columnas de niveles y guiones (nombre, tipo y nulabilidad). */
async function linkedShape(): Promise<string[]> {
  const result = await db.execute(sql`
    select shape
    from (
      select table_name::text || '.' || column_name::text || '|' || data_type::text || '|' || is_nullable::text as shape
      from information_schema.columns
      where table_schema = 'zaltyko' and table_name::text in ('skill_elements', 'session_plan_blocks')
    ) shapes
    order by shape collate "C"
  `);
  return result.rows.map((row) => (row as { shape: string }).shape);
}

/** Columnas, restricciones e índices de las tablas que tocan las candidatas. */
async function schemaFingerprint() {
  const tables = [...NEW_TABLES, ...LINKED_TABLES].join(",");
  const result = await db.execute(sql`
    select
      (select string_agg(table_name::text || '.' || column_name::text || '|' || data_type::text || '|' || is_nullable::text, ','
                         order by table_name::text, column_name::text)
         from information_schema.columns
        where table_schema = 'zaltyko' and table_name::text = any(string_to_array(${tables}, ','))) as columns,
      (select string_agg(cl.relname::text || '.' || c.conname::text, ',' order by cl.relname::text, c.conname::text)
         from pg_constraint c join pg_class cl on cl.oid = c.conrelid
        where cl.relnamespace = 'zaltyko'::regnamespace and cl.relname::text = any(string_to_array(${tables}, ','))) as constraints,
      (select string_agg(indexname::text, ',' order by indexname::text)
         from pg_indexes
        where schemaname = 'zaltyko' and tablename::text = any(string_to_array(${tables}, ','))) as indexes
  `);
  return result.rows[0];
}

/** Ediciones y elementos completos, para comprobar que nada cambia. */
async function catalogSnapshot() {
  const editions = await db.execute(
    sql`select to_jsonb(e) as row from zaltyko.catalog_element_editions e order by code`
  );
  const elements = await db.execute(sql`select to_jsonb(e) as row from zaltyko.catalog_elements e order by element_key`);
  return {
    editions: editions.rows.map((row) => (row as { row: unknown }).row),
    elements: elements.rows.map((row) => (row as { row: unknown }).row),
  };
}

type ElementRow = {
  id: string;
  name: string;
  review_status: string;
  reviewed_on: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
};

async function elementRow(elementKey: string): Promise<ElementRow> {
  const result = await db.execute(sql`
    select id, name, review_status, reviewed_on::text as reviewed_on, withdrawn_at::text as withdrawn_at, withdrawn_reason
    from zaltyko.catalog_elements
    where element_key = ${elementKey}
  `);
  expect(result.rows).toHaveLength(1);
  return result.rows[0] as ElementRow;
}

/** Edición y archivo de datos de prueba: nada sale de los archivos del repositorio. */
const EDITION: EditionFile = {
  code: "fig-wag-2025-2028",
  discipline: "artistic_female",
  cycleStart: 2025,
  cycleEnd: 2028,
  title: "Código de prueba de gimnasia artística femenina",
  documentUrl: "https://www.gymnastics.sport/",
  coverDate: "2026-10-14",
  status: "published",
  groups: { vault: [{ key: "1", label: "Grupo de prueba" }] },
};

function vaultFile(one: Partial<ElementRecord> = {}, two: Partial<ElementRecord> = {}): ElementDataFile {
  return {
    aviso: ELEMENT_DATA_NOTICE,
    edition: "fig-wag-2025-2028",
    apparatus: "vault",
    elements: [
      {
        elementKey: "ci_vault_one",
        group: "1",
        valuePoints: 2.4,
        name: "Salto de prueba con medio giro",
        shortName: "Prueba uno",
        sourcePage: 10,
        sourceCheckedOn: "2026-11-19",
        draftedBy: "Claude",
        draftedOn: "2026-11-19",
        batch: 1,
        reviewStatus: "reviewed",
        reviewedOn: "2026-11-19",
        ...one,
      },
      {
        elementKey: "ci_vault_two",
        group: "1",
        valuePoints: 3.2,
        name: "Salto de prueba con giro completo",
        shortName: "Prueba dos",
        description: "Descripción de prueba redactada para la integración continua.",
        sourcePage: 11,
        sourceCheckedOn: "2026-11-19",
        draftedBy: "Claude",
        draftedOn: "2026-11-19",
        batch: 1,
        reviewStatus: "draft",
        ...two,
      },
    ],
  };
}

const seed = (one: Partial<ElementRecord> = {}, two: Partial<ElementRecord> = {}) =>
  renderElementSeedSql(EDITION, [vaultFile(one, two)], 1);

describe.skipIf(!disposablePgEnabled)("biblioteca de elementos en PostgreSQL desechable", () => {
  const installedHere = { progress: false, plans: false, levels: false };
  let libraryWithoutLevels: PgFailure = null;
  let notesWithoutLibrary: PgFailure = null;
  let baseShape: string[] = [];

  beforeAll(async () => {
    assertDisposableTarget();
    // La base de CI solo tiene supabase/migrations: objetivos, guiones y
    // niveles van primero, cada uno solo si falta.
    if (!(await exists("athlete_objectives"))) {
      await runOnOwnConnection(candidate(PROGRESS));
      installedHere.progress = true;
    }
    if (!(await exists("session_plans"))) {
      await runOnOwnConnection(candidate(PLANS));
      installedHere.plans = true;
    }
    if (!(await exists("skill_templates"))) {
      libraryWithoutLevels = await failureOf(runOnOwnConnection(candidate(LIBRARY)));
      await runOnOwnConnection(candidate(LEVELS));
      installedHere.levels = true;
    }
    baseShape = await linkedShape();
    notesWithoutLibrary = await failureOf(runOnOwnConnection(candidate(NOTES)));
    await runOnOwnConnection(candidate(LIBRARY));
    await runOnOwnConnection(candidate(NOTES));
  }, 120_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    // La academia de prueba se queda (su historial de condiciones no admite
    // borrado); las tablas y columnas se retiran aunque falle alguna sentencia.
    await dropElementLibraryCandidates(installedHere);
  });

  it("se niega a instalarse fuera de orden y a reinstalarse, sin dejar nada a medias", async () => {
    if (installedHere.levels) {
      expect(libraryWithoutLevels?.code).toBe("P0001");
      expect(libraryWithoutLevels?.message).toBe(LIBRARY_REQUIRES);
    }
    expect(notesWithoutLibrary?.code).toBe("P0001");
    expect(notesWithoutLibrary?.message).toBe(NOTES_REQUIRES);
    expect(baseShape.some((column) => column.includes(".catalog_element_id|"))).toBe(false);
    expect(await linkedShape()).toEqual(
      [...baseShape, "session_plan_blocks.catalog_element_id|uuid|YES", "skill_elements.catalog_element_id|uuid|YES"].sort(
        (left, right) => (left < right ? -1 : left > right ? 1 : 0)
      )
    );

    const before = await schemaFingerprint();
    const library = await failureOf(runOnOwnConnection(candidate(LIBRARY)));
    expect(library?.code).toBe("P0001");
    expect(library?.message).toBe(LIBRARY_ALREADY);
    const notes = await failureOf(runOnOwnConnection(candidate(NOTES)));
    expect(notes?.code).toBe("P0001");
    expect(notes?.message).toBe(NOTES_ALREADY);
    expect(await schemaFingerprint()).toEqual(before);

    // Niveles, guiones y notas apuntan al catálogo con restrict.
    const references = await db.execute(sql`
      select cl.relname::text as table_name, c.confdeltype::text as on_delete
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      where c.contype = 'f' and c.confrelid = 'zaltyko.catalog_elements'::regclass
      order by cl.relname
    `);
    expect(references.rows).toEqual([
      { table_name: "academy_element_notes", on_delete: "r" },
      { table_name: "session_plan_blocks", on_delete: "r" },
      { table_name: "skill_elements", on_delete: "r" },
    ]);
  });

  it("fuerza RLS y niega el acceso directo de anon/authenticated", async () => {
    const inventory = await db.execute(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c
      where c.relnamespace = 'zaltyko'::regnamespace
        and c.relkind = 'r'
        and c.relname::text = any(string_to_array(${NEW_TABLES.join(",")}, ','))
    `);
    expect(inventory.rows).toHaveLength(NEW_TABLES.length);
    for (const row of inventory.rows) {
      expect(row).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
        anon_access: false,
        authenticated_access: false,
      });
    }
    for (const role of ["anon", "authenticated"]) {
      for (const table of NEW_TABLES) {
        const failure = await failureOf(
          db.transaction(async (tx) => {
            await tx.execute(sql.raw(`set local role ${role}`));
            await tx.execute(sql.raw(`select id from zaltyko.${table} limit 1`));
          })
        );
        expect(failure?.code, `${role} ${table}`).toBe("42501");
      }
    }
  });

  it("carga la semilla generada y repetirla no cambia ninguna fila", async () => {
    await runOnOwnConnection(seed());
    const first = await catalogSnapshot();
    expect(first.editions).toHaveLength(1);
    expect(first.editions[0]).toMatchObject({ code: "fig-wag-2025-2028", discipline: "artistic_female", status: "published" });
    expect(first.elements).toHaveLength(2);
    expect(first.elements[0]).toMatchObject({
      element_key: "ci_vault_one",
      discipline: "artistic_female",
      apparatus: "vault",
      value_letter: null,
      value_points: 2.4,
      review_status: "reviewed",
      reviewed_on: "2026-11-19",
      withdrawn_at: null,
    });
    await runOnOwnConnection(seed());
    expect(await catalogSnapshot()).toEqual(first);
  });

  it("exige letra o puntos, exactamente uno, y puntos solo en salto", async () => {
    const edition = await db.execute(sql`select id from zaltyko.catalog_element_editions where code = 'fig-wag-2025-2028'`);
    const editionId = (edition.rows[0] as { id: string }).id;
    const insert = (apparatus: string, letter: string | null, points: string | null) =>
      db.execute(sql`
        insert into zaltyko.catalog_elements
          (edition_id, element_key, discipline, apparatus, element_group, value_letter, value_points,
           name, short_name, source_page, source_checked_on, drafted_by, drafted_on, batch)
        values (${editionId}::uuid, 'ci_check_element', 'artistic_female', ${apparatus}, '1', ${letter}, ${points}::numeric,
          'Elemento de prueba', 'Prueba', 1, '2026-11-19', 'Claude', '2026-11-19', 1)
      `);
    const both = await failureOf(insert("vault", "A", "2.40"));
    expect(both?.code).toBe("23514");
    expect(both?.constraint).toBe("catalog_elements_value_one_check");
    const neither = await failureOf(insert("vault", null, null));
    expect(neither?.code).toBe("23514");
    expect(neither?.constraint).toBe("catalog_elements_value_one_check");
    const pointsOffVault = await failureOf(insert("beam", null, "2.40"));
    expect(pointsOffVault?.code).toBe("23514");
    expect(pointsOffVault?.constraint).toBe("catalog_elements_value_points_vault_check");
    const letterOutOfRange = await failureOf(insert("beam", "K", null));
    expect(letterOutOfRange?.code).toBe("23514");
    expect(letterOutOfRange?.constraint).toBe("catalog_elements_value_letter_check");
    // Una letra sola en barra sí vale.
    await insert("beam", "D", null);
    await db.execute(sql`delete from zaltyko.catalog_elements where element_key = 'ci_check_element'`);
  });

  it("una retirada sobrevive a recargar la semilla, aunque cambie el texto del borrador", async () => {
    await db.execute(sql`
      update zaltyko.catalog_elements
      set withdrawn_at = now(), withdrawn_reason = 'Aviso de prueba'
      where element_key = 'ci_vault_two'
    `);
    const withdrawn = await elementRow("ci_vault_two");
    expect(withdrawn.withdrawn_at).not.toBeNull();

    await runOnOwnConnection(seed());
    expect(await elementRow("ci_vault_two")).toEqual(withdrawn);

    await runOnOwnConnection(seed({}, { name: "Salto de prueba con giro completo y medio" }));
    expect(await elementRow("ci_vault_two")).toMatchObject({
      name: "Salto de prueba con giro completo y medio",
      withdrawn_at: withdrawn.withdrawn_at,
      withdrawn_reason: "Aviso de prueba",
    });
  });

  it("un elemento revisado no vuelve a borrador", async () => {
    await runOnOwnConnection(seed({ reviewStatus: "draft", reviewedOn: undefined }));
    expect(await elementRow("ci_vault_one")).toMatchObject({ review_status: "reviewed", reviewed_on: "2026-11-19" });
  });

  it("aborta sin cambiar nada si un revisado cambia sin una revisión posterior", async () => {
    const before = await catalogSnapshot();
    for (const reviewedOn of ["2026-11-19", "2026-11-18"]) {
      const failure = await failureOf(runOnOwnConnection(seed({ name: "Salto de prueba renombrado", reviewedOn })));
      expect(failure?.code, reviewedOn).toBe("P0001");
      expect(failure?.message, reviewedOn).toBe(
        "Element catalog seed would change reviewed elements without a newer reviewed_on: ci_vault_one"
      );
      expect(await catalogSnapshot()).toEqual(before);
    }
    // Con una revisión posterior, el cambio entra.
    await runOnOwnConnection(seed({ name: "Salto de prueba renombrado", reviewedOn: "2026-11-20" }));
    expect(await elementRow("ci_vault_one")).toMatchObject({
      name: "Salto de prueba renombrado",
      review_status: "reviewed",
      reviewed_on: "2026-11-20",
    });
  });

  it("no deja borrar un elemento enlazado desde niveles ni una edición con elementos", async () => {
    const element = await elementRow("ci_vault_two");
    const organizationId = randomUUID();
    const templateId = randomUUID();
    const levelId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.organizations (id, name, status)
      values (${organizationId}::uuid, ${`CI biblioteca de elementos ${organizationId}`}, 'active')
    `);
    await db.execute(sql`
      insert into zaltyko.skill_templates (id, organization_id, client_request_id, discipline, name)
      values (${templateId}::uuid, ${organizationId}::uuid, ${randomUUID()}::uuid, 'artistic_female', 'Plantilla de prueba')
    `);
    await db.execute(sql`
      insert into zaltyko.skill_levels (id, organization_id, template_id, position, name)
      values (${levelId}::uuid, ${organizationId}::uuid, ${templateId}::uuid, 1, 'Nivel 1')
    `);
    await db.execute(sql`
      insert into zaltyko.skill_elements (organization_id, template_id, level_id, position, apparatus, name, catalog_element_id)
      values (${organizationId}::uuid, ${templateId}::uuid, ${levelId}::uuid, 1, 'vault', 'Salto de la academia', ${element.id}::uuid)
    `);

    const linked = await failureOf(db.execute(sql`delete from zaltyko.catalog_elements where id = ${element.id}::uuid`));
    expect(linked?.code).toBe("23503");
    const edition = await failureOf(
      db.execute(sql`delete from zaltyko.catalog_element_editions where code = 'fig-wag-2025-2028'`)
    );
    expect(edition?.code).toBe("23503");
    expect((await elementRow("ci_vault_two")).id).toBe(element.id);
  });

  it("la vuelta atrás comentada deja niveles y guiones como los instalaron sus candidatas", async () => {
    await runOnOwnConnection(rollbackBlock(candidate(NOTES)));
    await runOnOwnConnection(rollbackBlock(candidate(LIBRARY)));
    expect(await linkedShape()).toEqual(baseShape);
    for (const table of NEW_TABLES) expect(await exists(table), table).toBe(false);
  });
});
