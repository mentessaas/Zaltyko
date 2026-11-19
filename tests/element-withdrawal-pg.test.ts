import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { submitContentNotice } from "@/modules/element-library/application/notices";
import {
  isContentWithdrawn,
  listCatalogElementsForReview,
  withdrawCatalogElement,
} from "@/modules/element-library/application/withdrawals";
import { publicContentNoticeSchema } from "@/modules/element-library/domain/content-notices";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Retirada de contenido (ADR-0029 §8.3) sobre PostgreSQL desechable de GitHub.
 * Instala las candidatas de objetivos, guiones y niveles si faltan y después
 * las dos de la biblioteca, solo aquí y después de todos los guardas, y lo
 * retira todo al terminar; nunca en un proyecto enlazado ni con credenciales
 * externas. Cubre: «Retirar» oculta el elemento de lo que ven las academias
 * (consulta directa de visibilidad: revisado, edición publicada y sin
 * retirar), el nivel que lo enlaza conserva su fila y lo ve retirado, una
 * segunda retirada da 409, el aviso de referencia tiene que existir, la lista
 * de revisión por estado y `isContentWithdrawn` para las plantillas.
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

/** Las candidatas abren su propia transacción: conexión propia que nunca vuelve al pool. */
async function runOnOwnConnection(text: string): Promise<void> {
  const client = new Client({ connectionString: process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

async function exists(table: string): Promise<boolean> {
  const result = await db.execute(sql`select to_regclass(${`zaltyko.${table}`}::text) is not null as present`);
  return (result.rows[0] as { present: boolean }).present;
}

/** Elementos que ven las academias (ADR-0029 §1.6), sin pasar por la búsqueda. */
async function visibleElementIds(): Promise<string[]> {
  const result = await db.execute(sql`
    select e.id
    from zaltyko.catalog_elements as e
    join zaltyko.catalog_element_editions as edition on edition.id = e.edition_id
    where e.review_status = 'reviewed' and edition.status = 'published' and e.withdrawn_at is null
    order by e.element_key
  `);
  return result.rows.map((row) => (row as { id: string }).id);
}

async function elementState(id: string) {
  const result = await db.execute(sql`
    select withdrawn_at::text as withdrawn_at, withdrawn_reason, review_status
    from zaltyko.catalog_elements where id = ${id}::uuid
  `);
  expect(result.rows).toHaveLength(1);
  return result.rows[0] as { withdrawn_at: string | null; withdrawn_reason: string | null; review_status: string };
}

/** Fila completa del elemento de nivel de la academia, para comprobar que no cambia. */
async function skillElementSnapshot(id: string): Promise<unknown> {
  const result = await db.execute(sql`select to_jsonb(s) as row from zaltyko.skill_elements s where id = ${id}::uuid`);
  expect(result.rows).toHaveLength(1);
  return (result.rows[0] as { row: unknown }).row;
}

describe.skipIf(!disposablePgEnabled)("retirada de contenido en PostgreSQL desechable", () => {
  const installedHere = { progress: false, plans: false, levels: false };
  /** Academia de prueba; se borra al terminar con sus plantillas, niveles y elementos. */
  let organizationId: string | null = null;
  let reviewedId = "";
  let draftId = "";
  let skillElementId = "";

  beforeAll(async () => {
    assertDisposableTarget();
    if (!(await exists("athlete_objectives"))) {
      await runOnOwnConnection(candidate(PROGRESS));
      installedHere.progress = true;
    }
    if (!(await exists("session_plans"))) {
      await runOnOwnConnection(candidate(PLANS));
      installedHere.plans = true;
    }
    if (!(await exists("skill_templates"))) {
      await runOnOwnConnection(candidate(LEVELS));
      installedHere.levels = true;
    }
    await runOnOwnConnection(candidate(LIBRARY));
    await runOnOwnConnection(candidate(NOTES));

    // Edición publicada con un elemento revisado y un borrador; nada sale de
    // los archivos del repositorio.
    const edition = await db.execute(sql`
      insert into zaltyko.catalog_element_editions
        (code, discipline, cycle_start, cycle_end, title, document_url, cover_date, status)
      values ('fig-wag-2025-2028', 'artistic_female', 2025, 2028, 'Código de prueba de gimnasia artística femenina',
        'https://www.gymnastics.sport/', '2026-10-14', 'published')
      returning id
    `);
    const editionId = (edition.rows[0] as { id: string }).id;
    const element = async (key: string, reviewed: boolean) => {
      const inserted = await db.execute(sql`
        insert into zaltyko.catalog_elements
          (edition_id, element_key, discipline, apparatus, element_group, value_points,
           name, short_name, source_page, source_checked_on, drafted_by, drafted_on, batch, review_status, reviewed_on)
        values (${editionId}::uuid, ${key}, 'artistic_female', 'vault', '1', 2.40,
          'Salto de prueba para la retirada', 'Prueba', 10, '2026-11-19', 'Claude', '2026-11-19', 1,
          ${reviewed ? "reviewed" : "draft"}, ${reviewed ? "2026-11-19" : null}::date)
        returning id
      `);
      return (inserted.rows[0] as { id: string }).id;
    };
    reviewedId = await element("ci_withdraw_reviewed", true);
    draftId = await element("ci_withdraw_draft", false);

    organizationId = randomUUID();
    const templateId = randomUUID();
    const levelId = randomUUID();
    skillElementId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.organizations (id, name, status)
      values (${organizationId}::uuid, 'CI retirada de elementos', 'active')
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
      insert into zaltyko.skill_elements (id, organization_id, template_id, level_id, position, apparatus, name, catalog_element_id)
      values (${skillElementId}::uuid, ${organizationId}::uuid, ${templateId}::uuid, ${levelId}::uuid, 1, 'vault',
        'Salto de la academia', ${reviewedId}::uuid)
    `);
  }, 120_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    if (organizationId) {
      await db.execute(sql`delete from zaltyko.organizations where id = ${organizationId}::uuid`);
    }
    await db.execute(sql`drop table if exists zaltyko.academy_element_notes`);
    for (const table of ["skill_elements", "session_plan_blocks"]) {
      await db.execute(sql.raw(`alter table if exists zaltyko.${table} drop column if exists catalog_element_id`));
    }
    for (const table of ["content_withdrawals", "content_notices", "catalog_elements", "catalog_element_editions"]) {
      await db.execute(sql.raw(`drop table if exists zaltyko.${table}`));
    }
    if (installedHere.levels) {
      for (const table of [
        "athlete_level_passes",
        "athlete_skill_progress",
        "skill_elements",
        "skill_levels",
        "skill_templates",
      ]) {
        await db.execute(sql.raw(`drop table if exists zaltyko.${table}`));
      }
    }
    if (installedHere.plans) {
      for (const table of ["session_plan_objectives", "session_plan_blocks", "session_plans", "class_plan_templates"]) {
        await db.execute(sql.raw(`drop table if exists zaltyko.${table}`));
      }
    }
    if (installedHere.progress) {
      for (const table of ["athlete_observations", "athlete_objective_status_history", "athlete_objectives"]) {
        await db.execute(sql.raw(`drop table if exists zaltyko.${table}`));
      }
    }
  });

  it("la lista de revisión separa borradores y revisados", async () => {
    const drafts = await listCatalogElementsForReview({ state: "draft", cursor: null });
    expect(drafts.items.map((item) => item.id)).toEqual([draftId]);
    const reviewed = await listCatalogElementsForReview({ state: "reviewed", cursor: null });
    expect(reviewed.items.map((item) => item.id)).toEqual([reviewedId]);
    expect(reviewed.items[0]).toMatchObject({ state: "reviewed", valuePoints: 2.4, withdrawnAt: null });
    expect(await visibleElementIds()).toEqual([reviewedId]);
  });

  it("no retira con un aviso que no existe ni un elemento que no existe", async () => {
    const unknownNotice = await withdrawCatalogElement(reviewedId, {
      reason: "Aviso de la federación sobre el texto",
      noticeId: randomUUID(),
    }).then(
      () => null,
      (error: unknown) => error
    );
    expect((unknownNotice as OperationalError).status).toBe(404);
    const unknownElement = await withdrawCatalogElement(randomUUID(), { reason: "Aviso de la federación sobre el texto" }).then(
      () => null,
      (error: unknown) => error
    );
    expect(unknownElement).toBeInstanceOf(OperationalError);
    expect((unknownElement as OperationalError).status).toBe(404);
    expect((await elementState(reviewedId)).withdrawn_at).toBeNull();
  });

  it("retirar oculta el elemento al momento y el nivel que lo enlaza sigue igual, viéndolo retirado", async () => {
    await submitContentNotice(
      publicContentNoticeSchema.parse({
        contentKind: "element",
        contentUrl: "/owner/biblioteca",
        reason: "La descripción reproduce un texto del que tenemos los derechos.",
        senderName: "Federación de prueba",
        senderEmail: "avisos@example.invalid",
        goodFaith: true,
      })
    );
    const noticeId = (
      (await db.execute(sql`select id from zaltyko.content_notices order by received_at desc limit 1`)).rows[0] as {
        id: string;
      }
    ).id;
    const before = await skillElementSnapshot(skillElementId);

    const result = await withdrawCatalogElement(reviewedId, {
      reason: "Aviso de la federación sobre el texto",
      noticeId,
    });
    expect(result).toMatchObject({ id: reviewedId, elementKey: "ci_withdraw_reviewed", editionCode: "fig-wag-2025-2028" });
    expect(await visibleElementIds()).toEqual([]);
    expect(await elementState(reviewedId)).toMatchObject({
      withdrawn_reason: "Aviso de la federación sobre el texto",
      review_status: "reviewed",
    });
    expect((await elementState(reviewedId)).withdrawn_at).not.toBeNull();

    // La academia conserva su fila tal cual; el enlace muestra el elemento como retirado.
    expect(await skillElementSnapshot(skillElementId)).toEqual(before);
    const link = await db.execute(sql`
      select e.withdrawn_at is not null as withdrawn
      from zaltyko.skill_elements s
      join zaltyko.catalog_elements e on e.id = s.catalog_element_id
      where s.id = ${skillElementId}::uuid
    `);
    expect(link.rows).toEqual([{ withdrawn: true }]);

    const withdrawn = await listCatalogElementsForReview({ state: "withdrawn", cursor: null });
    expect(withdrawn.items.map((item) => item.id)).toEqual([reviewedId]);
    expect((await listCatalogElementsForReview({ state: "reviewed", cursor: null })).items).toEqual([]);
  });

  it("una segunda retirada responde 409 y conserva la primera fecha y motivo", async () => {
    const first = await elementState(reviewedId);
    const again = await withdrawCatalogElement(reviewedId, { reason: "Otro motivo distinto de retirada" }).then(
      () => null,
      (error: unknown) => error
    );
    expect((again as OperationalError).status).toBe(409);
    expect(await elementState(reviewedId)).toEqual(first);
  });

  it("isContentWithdrawn solo es true para la plantilla retirada", async () => {
    expect(await isContentWithdrawn(db, "federation_template", "rfeg_ci_nivel_1")).toBe(false);
    await db.execute(sql`
      insert into zaltyko.content_withdrawals (kind, key, reason)
      values ('federation_template', 'rfeg_ci_nivel_1', 'Petición de prueba')
    `);
    expect(await isContentWithdrawn(db, "federation_template", "rfeg_ci_nivel_1")).toBe(true);
    expect(await isContentWithdrawn(db, "federation_template", "rfeg_ci_nivel_2")).toBe(false);
    expect(await isContentWithdrawn(db, "federation_template", "clave con espacios")).toBe(false);
    // Dentro de una transacción, con su cliente.
    expect(await db.transaction((tx) => isContentWithdrawn(tx, "federation_template", "rfeg_ci_nivel_1"))).toBe(true);
  });
});
