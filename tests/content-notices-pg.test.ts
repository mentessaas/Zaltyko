import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  contentNoticeSubmissionHash,
  eraseExpiredNoticeSenders,
  submitContentNotice,
  updateContentNotice,
} from "@/modules/element-library/application/notices";
import { publicContentNoticeSchema } from "@/modules/element-library/domain/content-notices";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Avisos sobre contenido (ADR-0029 §8.1 y §8.2) sobre PostgreSQL desechable de
 * GitHub. Instala las candidatas de objetivos, guiones y niveles si faltan y
 * después las dos de la biblioteca, solo aquí y después de todos los guardas,
 * y lo retira todo al terminar; nunca en un proyecto enlazado ni con
 * credenciales externas. Cubre: 503 sin tablas, reenvío idéntico sin
 * duplicar, cierre con `closed_at` y el borrado del remitente a los 730 días
 * (solo avisos cerrados, idempotente).
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

const notice = (overrides: Record<string, unknown> = {}) =>
  publicContentNoticeSchema.parse({
    contentKind: "element",
    contentUrl: "/owner/biblioteca",
    reason: "La descripción de este elemento reproduce un texto protegido.",
    senderName: "Ana Pérez",
    senderEmail: "Ana@Example.INVALID",
    goodFaith: true,
    ...overrides,
  });

type NoticeRow = {
  id: string;
  sender_name: string | null;
  sender_email: string | null;
  sender_erased_at: string | null;
  status: string;
  response: string | null;
  closed_at: string | null;
};

async function noticeRow(id: string): Promise<NoticeRow> {
  const result = await db.execute(sql`
    select id, sender_name, sender_email, sender_erased_at::text as sender_erased_at, status, response,
      closed_at::text as closed_at
    from zaltyko.content_notices where id = ${id}::uuid
  `);
  expect(result.rows).toHaveLength(1);
  return result.rows[0] as NoticeRow;
}

/** Aviso escrito directamente, con la fecha de cierre que pide cada caso. */
async function insertNotice(input: { status: string; closedDaysAgo: number | null; erased?: boolean }): Promise<string> {
  const id = randomUUID();
  const hash = createHash("sha256").update(id).digest("hex");
  const erased = input.erased === true;
  await db.execute(sql`
    insert into zaltyko.content_notices
      (id, received_at, sender_name, sender_email, content_url, content_kind, reason, good_faith_confirmed,
       status, closed_at, sender_erased_at, submission_hash)
    values (${id}::uuid, now() - interval '1000 days',
      ${erased ? null : "Persona de prueba"}, ${erased ? null : "prueba@example.invalid"},
      '/owner/biblioteca', 'other', 'Motivo de prueba suficientemente largo', true,
      ${input.status},
      ${input.closedDaysAgo === null ? null : sql`now() - make_interval(days => ${input.closedDaysAgo}::int)`},
      ${erased ? sql`now() - interval '10 days'` : null},
      ${hash})
  `);
  return id;
}

describe.skipIf(!disposablePgEnabled)("avisos sobre contenido en PostgreSQL desechable", () => {
  const installedHere = { progress: false, plans: false, levels: false };
  let withoutTables: unknown = null;

  beforeAll(async () => {
    assertDisposableTarget();
    // Antes de instalar nada: sin las tablas el formulario responde 503.
    withoutTables = await submitContentNotice(notice()).then(
      () => null,
      (error: unknown) => error
    );
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
  }, 120_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
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

  it("sin las tablas de la biblioteca responde 503 y no escribe nada", () => {
    expect(withoutTables).toBeInstanceOf(OperationalError);
    expect((withoutTables as OperationalError).status).toBe(503);
  });

  it("guarda el aviso normalizado y un reenvío idéntico no crea otra fila", async () => {
    const input = notice();
    expect(await submitContentNotice(input)).toEqual({ replayed: false });
    expect(await submitContentNotice(notice())).toEqual({ replayed: true });
    const hash = contentNoticeSubmissionHash(input);
    const result = await db.execute(sql`
      select sender_name, sender_email, content_url, content_kind, content_key, good_faith_confirmed,
        status, response, closed_at, sender_erased_at
      from zaltyko.content_notices where submission_hash = ${hash}
    `);
    expect(result.rows).toEqual([
      {
        sender_name: "Ana Pérez",
        sender_email: "ana@example.invalid",
        content_url: "/owner/biblioteca",
        content_kind: "element",
        content_key: null,
        good_faith_confirmed: true,
        status: "received",
        response: null,
        closed_at: null,
        sender_erased_at: null,
      },
    ]);
    // Otro motivo es otro aviso.
    expect(await submitContentNotice(notice({ reason: "Otro motivo distinto para el mismo contenido." }))).toEqual({
      replayed: false,
    });
  });

  it("cerrar pone closed_at, volver a abrir lo quita y la respuesta se guarda como texto", async () => {
    const id = await insertNotice({ status: "received", closedDaysAgo: null });
    const reviewing = await updateContentNotice(id, { status: "reviewing" });
    expect(reviewing).toMatchObject({ status: "reviewing", closedAt: null });

    const closed = await updateContentNotice(id, { status: "closed", response: "Retirado.\nGracias por avisar." });
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();
    expect(closed.response).toBe("Retirado.\nGracias por avisar.");

    // Solo cambiar la respuesta conserva la fecha de cierre.
    const answered = await updateContentNotice(id, { response: "Retirado el elemento." });
    expect(answered.closedAt).toBe(closed.closedAt);

    const reopened = await updateContentNotice(id, { status: "reviewing" });
    expect(reopened).toMatchObject({ status: "reviewing", closedAt: null, response: "Retirado el elemento." });
    expect((await noticeRow(id)).closed_at).toBeNull();

    const missing = await updateContentNotice(randomUUID(), { status: "closed" }).then(
      () => null,
      (error: unknown) => error
    );
    expect((missing as OperationalError).status).toBe(404);
  });

  it("borra solo el remitente de avisos cerrados hace más de 730 días y repetirlo no cambia nada", async () => {
    const expired = await insertNotice({ status: "closed", closedDaysAgo: 731 });
    const recent = await insertNotice({ status: "closed", closedDaysAgo: 729 });
    const open = await insertNotice({ status: "reviewing", closedDaysAgo: null });
    const alreadyErased = await insertNotice({ status: "closed", closedDaysAgo: 900, erased: true });
    const before = {
      recent: await noticeRow(recent),
      open: await noticeRow(open),
      alreadyErased: await noticeRow(alreadyErased),
    };

    const first = await eraseExpiredNoticeSenders();
    expect(first).toEqual({ enabled: true, erased: 1, batches: 1 });
    const erasedRow = await noticeRow(expired);
    expect(erasedRow).toMatchObject({ sender_name: null, sender_email: null, status: "closed" });
    expect(erasedRow.sender_erased_at).not.toBeNull();
    expect(await noticeRow(recent)).toEqual(before.recent);
    expect(await noticeRow(open)).toEqual(before.open);
    expect(await noticeRow(alreadyErased)).toEqual(before.alreadyErased);

    const second = await eraseExpiredNoticeSenders();
    expect(second).toEqual({ enabled: true, erased: 0, batches: 0 });
    expect(await noticeRow(expired)).toEqual(erasedRow);
  });
});
