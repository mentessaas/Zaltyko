import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  findLinkableCatalogElement,
  getCatalogElement,
  getCatalogLinkView,
  isElementLibraryAvailable,
  isElementLibraryAvailableForPage,
  isElementLibraryStorageInstalled,
  recordElementLibraryView,
  saveElementNote,
  searchCatalogElements,
} from "@/modules/element-library/application/element-library-service";
import {
  ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG,
  ELEMENT_LIBRARY_ENV_FLAG,
  ELEMENT_LIBRARY_UNAVAILABLE_REASON,
} from "@/modules/element-library/domain/element-library";
import { resetUsageStorageCache } from "@/modules/habitual-use/application/storage";
import { recordStaffVisit } from "@/modules/habitual-use/application/usage-events";
import { HABITUAL_USE_FLAGS } from "@/modules/habitual-use/domain/flags";
import { SKILL_LEVELS_ENV_FLAG } from "@/modules/skill-levels/domain/skill-levels";

import { dropElementLibraryCandidates } from "./helpers/element-library-candidate";

/**
 * Servicio de la biblioteca de elementos sobre PostgreSQL desechable de
 * GitHub. Instala las candidatas de objetivos, guiones y niveles si faltan y
 * después las dos de la biblioteca, solo aquí y después de todos los guardas,
 * y retira todas las tablas y columnas que instaló al terminar; nunca en un
 * proyecto enlazado ni con credenciales externas. Cubre: función dormida
 * (banderas, tablas, formas de niveles y guiones), búsqueda solo de lo visible
 * con sus filtros, ficha, nota de la academia (alta, repetición, 409,
 * aislamiento entre academias, borrado), acceso del equipo técnico (familia y
 * rol sin acceso: 403), autoría a nulo al borrar una integrante y la vista de
 * enlaces de niveles y guiones.
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
const HABITUAL_USE = "20261114130000_habitual_use_candidate.sql";

const FLAGS = [
  ELEMENT_LIBRARY_ENV_FLAG,
  ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG,
  SKILL_LEVELS_ENV_FLAG,
  HABITUAL_USE_FLAGS.master,
  HABITUAL_USE_FLAGS.usageMetrics,
] as const;

function setFlag(name: (typeof FLAGS)[number], on: boolean) {
  if (on) process.env[name] = "true";
  else delete process.env[name];
}

/**
 * Las candidatas abren su propia transacción (`begin; … commit;`): se
 * ejecutan en una conexión propia que nunca vuelve al pool de `db`. Solo se
 * llama después de assertDisposableTarget().
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

async function exists(table: string): Promise<boolean> {
  const result = await db.execute(sql`select to_regclass(${`zaltyko.${table}`}::text) is not null as present`);
  return (result.rows[0] as { present: boolean }).present;
}

/**
 * Aplica `statement` dentro de una transacción que se deshace siempre y
 * devuelve lo que ve la comprobación de disponibilidad mientras tanto.
 */
async function availableWith(statement: string): Promise<boolean> {
  const rollback = new Error("rollback");
  let available = true;
  const seen = await db
    .transaction(async (tx) => {
      await tx.execute(sql.raw(statement));
      available = await isElementLibraryAvailable(tx);
      throw rollback;
    })
    .catch((error: unknown) => error);
  expect(seen).toBe(rollback);
  return available;
}

type Actor = { userId: string; memberId: string };

async function authUser(label: string): Promise<string> {
  const userId = randomUUID();
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-library-${label}-${userId}@example.invalid`})`
  );
  return userId;
}

async function member(
  organizationId: string,
  role: "owner" | "admin" | "manager" | "coach",
  scopeMode: "all" | "selected",
  locationIds: string[] = [],
  label: string = role,
  status: "active" | "suspended" = "active"
): Promise<Actor> {
  const userId = await authUser(label);
  const memberId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
    values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, ${role}, ${status}, ${scopeMode})
  `);
  for (const locationId of locationIds) {
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (organization_id, member_id, location_id)
      values (${organizationId}::uuid, ${memberId}::uuid, ${locationId}::uuid)
    `);
  }
  return { userId, memberId };
}

async function academy(label: string, sites: number) {
  const organizationId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI biblioteca ${label}`}, 'active')
  `);
  const locationIds: string[] = [];
  for (let index = 0; index < sites; index += 1) {
    const locationId = randomUUID();
    locationIds.push(locationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
      values (${locationId}::uuid, ${organizationId}::uuid,
        ${`ci-lib-${index}-${organizationId.slice(0, 8)}`}, ${`Sede ${label} ${index + 1}`}, 'Europe/Madrid', true)
    `);
  }
  return { organizationId, locationIds };
}

async function edition(code: string, discipline: string, status: string): Promise<string> {
  const result = await db.execute(sql`
    insert into zaltyko.catalog_element_editions
      (code, discipline, cycle_start, cycle_end, title, document_url, cover_date, status)
    values (${code}, ${discipline}, 2025, 2028, 'Código de prueba', 'https://www.gymnastics.sport/', '2026-10-14', ${status})
    returning id
  `);
  return (result.rows[0] as { id: string }).id;
}

/** Elemento de prueba: nada sale de los archivos de datos del repositorio. */
async function element(
  editionId: string,
  input: {
    key: string;
    discipline?: string;
    apparatus: string;
    group: string;
    letter?: string;
    points?: string;
    name: string;
    description?: string;
    reviewed?: boolean;
    withdrawn?: boolean;
  }
): Promise<string> {
  const reviewed = input.reviewed ?? true;
  const result = await db.execute(sql`
    insert into zaltyko.catalog_elements
      (edition_id, element_key, discipline, apparatus, element_group, value_letter, value_points,
       name, short_name, description, source_page, source_checked_on, drafted_by, drafted_on, batch,
       review_status, reviewed_on, withdrawn_at, withdrawn_reason)
    values (${editionId}::uuid, ${input.key}, ${input.discipline ?? "artistic_female"}, ${input.apparatus}, ${input.group},
      ${input.letter ?? null}, ${input.points ?? null}::numeric,
      ${input.name}, ${input.name.slice(0, 40)}, ${input.description ?? null}, 1, '2026-11-19', 'Claude', '2026-11-19', 1,
      ${reviewed ? "reviewed" : "draft"}, ${reviewed ? "2026-11-19" : null}::date,
      ${input.withdrawn ? new Date().toISOString() : null}::timestamptz, ${input.withdrawn ? "Aviso de prueba" : null})
    returning id
  `);
  return (result.rows[0] as { id: string }).id;
}

describe.skipIf(!disposablePgEnabled)("biblioteca de elementos: servicio en PostgreSQL desechable", () => {
  const previousFlags = Object.fromEntries(FLAGS.map((name) => [name, process.env[name]]));
  const installedHere = { progress: false, plans: false, levels: false };
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let ownerA: Actor;
  let coachA1: Actor;
  let coachA2: Actor;
  let ownerB: Actor;
  let vaultOne: string;
  let vaultTwo: string;
  let vaultDraft: string;
  let vaultWithdrawn: string;
  let barsOne: string;
  let beamOne: string;
  let maleFloor: string;

  const s1 = () => ({ organizationId: a.organizationId, locationId: a.locationIds[0]! });
  const sb = () => ({ organizationId: b.organizationId, locationId: b.locationIds[0]! });
  const search = (actor: Actor, filters: Record<string, unknown> = {}, scope = s1()) =>
    searchCatalogElements({ actor, query: { ...scope, discipline: "artistic_female", ...filters } });
  const card = (actor: Actor, elementId: string, scope = s1()) => getCatalogElement({ actor, elementId, query: scope });
  const save = (
    actor: Actor,
    elementId: string,
    note: string | null,
    expectedRevision: number | null,
    scope = s1()
  ) => saveElementNote({ actor, elementId, command: { ...scope, clientRequestId: randomUUID(), expectedRevision, note } });
  const noteRows = async (elementId: string) => {
    const result = await db.execute(sql`
      select organization_id, note, revision, created_by_member_id, updated_by_member_id
      from zaltyko.academy_element_notes where catalog_element_id = ${elementId}::uuid
      order by organization_id
    `);
    return result.rows as Array<{
      organization_id: string;
      note: string;
      revision: number;
      created_by_member_id: string | null;
      updated_by_member_id: string | null;
    }>;
  };

  beforeAll(async () => {
    assertDisposableTarget();
    for (const name of FLAGS) setFlag(name, false);
    a = await academy("A", 2);
    b = await academy("B", 1);
    ownerA = await member(a.organizationId, "owner", "all");
    coachA1 = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "coach1");
    coachA2 = await member(a.organizationId, "coach", "selected", [a.locationIds[1]!], "coach2");
    ownerB = await member(b.organizationId, "owner", "all", [], "ownerB");

    // Función dormida: sin banderas no consulta nada; con ellas y sin tablas, 503.
    expect(await isElementLibraryAvailable(db)).toBe(false);
    await expect(search(ownerA)).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
      details: { reason: ELEMENT_LIBRARY_UNAVAILABLE_REASON },
    });
    setFlag(ELEMENT_LIBRARY_ENV_FLAG, true);
    setFlag(SKILL_LEVELS_ENV_FLAG, true);
    expect(await isElementLibraryAvailableForPage(db)).toBe(false);
    await expect(search(ownerA)).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });

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
      await runOnOwnConnection(candidate(LEVELS));
      installedHere.levels = true;
    }
    await runOnOwnConnection(candidate(LIBRARY));
    // Sin la candidata de las notas la biblioteca sigue sin existir.
    expect(await isElementLibraryStorageInstalled(db)).toBe(false);
    expect(await isElementLibraryAvailableForPage(db)).toBe(false);
    await runOnOwnConnection(candidate(NOTES));

    const female = await edition("fig-wag-2025-2028", "artistic_female", "published");
    const male = await edition("fig-mag-2025-2028", "artistic_male", "draft");
    vaultOne = await element(female, {
      key: "ci_vault_one",
      apparatus: "vault",
      group: "1",
      points: "2.40",
      name: "Rondada con medio giro de prueba",
      description: "Descripción de prueba redactada para la integración continua.",
    });
    vaultTwo = await element(female, { key: "ci_vault_two", apparatus: "vault", group: "2", points: "3.20", name: "Paloma de prueba" });
    vaultDraft = await element(female, {
      key: "ci_vault_draft",
      apparatus: "vault",
      group: "1",
      points: "2.00",
      name: "Salto en borrador",
      reviewed: false,
    });
    vaultWithdrawn = await element(female, {
      key: "ci_vault_withdrawn",
      apparatus: "vault",
      group: "1",
      points: "2.40",
      name: "Salto retirado",
      withdrawn: true,
    });
    barsOne = await element(female, { key: "ci_bars_one", apparatus: "uneven_bars", group: "1", letter: "A", name: "Báscula de prueba" });
    beamOne = await element(female, { key: "ci_beam_one", apparatus: "beam", group: "2", letter: "D", name: "Mortal atrás de prueba" });
    maleFloor = await element(male, {
      key: "ci_floor_male",
      discipline: "artistic_male",
      apparatus: "floor",
      group: "1",
      letter: "B",
      name: "Elemento de suelo en edición sin publicar",
    });
  }, 120_000);

  afterAll(async () => {
    for (const name of FLAGS) {
      const previous = previousFlags[name];
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
    if (!disposablePgEnabled) return;
    // Las academias de prueba se quedan (su registro de auditoría no admite
    // borrado); las tablas y columnas de la biblioteca se retiran todas.
    await dropElementLibraryCandidates(installedHere);
  });

  it("existe solo con las dos banderas, las tablas exactas y niveles y guiones con enlaces", async () => {
    expect(await isElementLibraryStorageInstalled(db)).toBe(true);
    expect(await isElementLibraryAvailableForPage(db)).toBe(true);

    setFlag(ELEMENT_LIBRARY_ENV_FLAG, false);
    try {
      expect(await isElementLibraryAvailableForPage(db)).toBe(false);
      await expect(search(ownerA)).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
        details: { reason: ELEMENT_LIBRARY_UNAVAILABLE_REASON },
      });
    } finally {
      setFlag(ELEMENT_LIBRARY_ENV_FLAG, true);
    }
    setFlag(SKILL_LEVELS_ENV_FLAG, false);
    try {
      expect(await isElementLibraryAvailableForPage(db)).toBe(false);
      await expect(save(ownerA, vaultOne, "Nota", null)).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    } finally {
      setFlag(SKILL_LEVELS_ENV_FLAG, true);
    }

    // Una columna de más, o niveles o guiones sin la columna de enlace: no disponible.
    expect(await availableWith("alter table zaltyko.academy_element_notes add column video_url text")).toBe(false);
    expect(await availableWith("alter table zaltyko.catalog_elements drop column fig_reference")).toBe(false);
    expect(await availableWith("alter table zaltyko.skill_elements drop column catalog_element_id")).toBe(false);
    expect(await availableWith("alter table zaltyko.session_plan_blocks drop column catalog_element_id")).toBe(false);
    expect(await availableWith("alter table zaltyko.content_notices no force row level security")).toBe(false);
    expect(await availableWith("grant select on zaltyko.catalog_elements to authenticated")).toBe(false);
    expect(await isElementLibraryAvailable(db)).toBe(true);
  });

  it("la búsqueda devuelve solo revisados de una edición publicada y sin retirar, en orden", async () => {
    const result = await search(ownerA);
    expect(result.edition).toMatchObject({
      code: "fig-wag-2025-2028",
      discipline: "artistic_female",
      coverDate: "2026-10-14",
      documentUrl: "https://www.gymnastics.sport/",
    });
    expect(result.edition!.attribution).toContain("edición publicada el 14-10-2026");
    expect(result.edition!.attribution).toContain("Zaltyko no está afiliado a la FIG");
    expect(result.elements.map((entry) => entry.id)).toEqual([vaultOne, vaultTwo, barsOne, beamOne]);
    expect(result.truncated).toBe(false);
    expect(result.elements[0]).toMatchObject({
      elementKey: "ci_vault_one",
      apparatus: "vault",
      group: "1",
      valueLetter: null,
      valuePoints: 2.4,
      hasNote: false,
    });
    const ids = result.elements.map((entry) => entry.id);
    for (const hidden of [vaultDraft, vaultWithdrawn, maleFloor]) expect(ids).not.toContain(hidden);

    // Una edición sin publicar no se ve: la disciplina aún no tiene biblioteca.
    expect(await search(ownerA, { discipline: "artistic_male" })).toEqual({ edition: null, elements: [], truncated: false });
    // Los entrenadores buscan desde su sede.
    expect((await search(coachA1)).elements).toHaveLength(4);
  });

  it("filtra por aparato, grupo, valor y texto sin acentos, y respeta el límite", async () => {
    const ids = async (filters: Record<string, unknown>) => (await search(ownerA, filters)).elements.map((entry) => entry.id);
    expect(await ids({ apparatus: "vault" })).toEqual([vaultOne, vaultTwo]);
    expect(await ids({ apparatus: "vault", group: "2" })).toEqual([vaultTwo]);
    expect(await ids({ group: "2" })).toEqual([vaultTwo, beamOne]);
    expect(await ids({ value: "2,4" })).toEqual([vaultOne]);
    expect(await ids({ value: "d" })).toEqual([beamOne]);
    expect(await ids({ q: "BASCULA" })).toEqual([barsOne]);
    expect(await ids({ q: "retirado" })).toEqual([]);
    const limited = await search(ownerA, { limit: 1 });
    expect(limited.elements.map((entry) => entry.id)).toEqual([vaultOne]);
    expect(limited.truncated).toBe(true);
  });

  it("la ficha muestra solo lo visible, con atribución y la descripción solo con su bandera", async () => {
    const view = await card(coachA1, vaultOne);
    expect(view).toMatchObject({
      id: vaultOne,
      elementKey: "ci_vault_one",
      discipline: "artistic_female",
      apparatus: "vault",
      valuePoints: 2.4,
      description: null,
      note: null,
      readOnly: false,
    });
    expect(view.attribution).toBe(view.edition.attribution);
    setFlag(ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG, true);
    try {
      expect((await card(coachA1, vaultOne)).description).toBe(
        "Descripción de prueba redactada para la integración continua."
      );
    } finally {
      setFlag(ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG, false);
    }
    for (const hidden of [vaultDraft, vaultWithdrawn, maleFloor, randomUUID()]) {
      await expect(card(ownerA, hidden)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    }
  });

  it("la nota se crea, se repite sin escribir y choca (409) con otra revisión", async () => {
    const created = await save(coachA1, vaultOne, "  Brazos pegados en la entrada.  ", null);
    expect(created).toMatchObject({ replayed: false, note: { text: "Brazos pegados en la entrada.", revision: 1 } });
    // La misma petición otra vez: 200 sin escribir.
    expect(await save(coachA1, vaultOne, "Brazos pegados en la entrada.", null)).toMatchObject({
      replayed: true,
      note: { revision: 1 },
    });
    const updated = await save(ownerA, vaultOne, "Brazos pegados y mirada al potro.", 1);
    expect(updated).toMatchObject({ replayed: false, note: { text: "Brazos pegados y mirada al potro.", revision: 2 } });
    // Quien todavía veía la revisión 1, o creía que no había nota: 409 sin pisar nada.
    await expect(save(coachA1, vaultOne, "Otra cosa", 1)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
      details: { currentRevision: 2 },
    });
    await expect(save(coachA1, vaultOne, "Otra cosa", null)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(save(coachA1, vaultOne, null, 1)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect((await noteRows(vaultOne)).map((row) => row.revision)).toEqual([2]);

    expect((await card(coachA1, vaultOne)).note).toMatchObject({ text: "Brazos pegados y mirada al potro.", revision: 2 });
    expect((await search(ownerA, { apparatus: "vault" })).elements.map((entry) => entry.hasNote)).toEqual([true, false]);

    // Sin nota en elementos que la academia no ve.
    await expect(save(ownerA, vaultDraft, "Nota", null)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(save(ownerA, vaultWithdrawn, "Nota", null)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("cada academia tiene su nota: otra academia no la ve ni la pisa", async () => {
    // B no ve la nota de A y crea la suya sobre el mismo elemento.
    expect((await card(ownerB, vaultOne, sb())).note).toBeNull();
    expect((await search(ownerB, {}, sb())).elements.find((entry) => entry.id === vaultOne)?.hasNote).toBe(false);
    expect(await save(ownerB, vaultOne, "Nota de la academia B.", null, sb())).toMatchObject({
      note: { text: "Nota de la academia B.", revision: 1 },
    });
    // Con la revisión de A, B choca con la suya y no toca la de A.
    await expect(save(ownerB, vaultOne, "Intento sobre A", 2, sb())).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const rows = await noteRows(vaultOne);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.organization_id === a.organizationId)).toMatchObject({
      note: "Brazos pegados y mirada al potro.",
      revision: 2,
    });
    expect(rows.find((row) => row.organization_id === b.organizationId)).toMatchObject({
      note: "Nota de la academia B.",
      revision: 1,
    });
    expect((await card(ownerA, vaultOne)).note).toMatchObject({ text: "Brazos pegados y mirada al potro." });
    // La dirección de B no entra en A, ni con su propio miembro.
    await expect(card(ownerB, vaultOne)).rejects.toMatchObject({ status: 403 });
    await expect(save(ownerB, vaultOne, "Intento", 2)).rejects.toMatchObject({ status: 403 });
  });

  it("borrar la nota (vacía o null) la quita, y repetirlo no escribe", async () => {
    expect(await save(ownerA, vaultOne, null, 2)).toEqual({ note: null, replayed: false });
    expect(await save(ownerA, vaultOne, null, 2)).toEqual({ note: null, replayed: true });
    expect((await card(ownerA, vaultOne)).note).toBeNull();
    // Se puede volver a escribir desde cero.
    expect(await save(ownerA, vaultOne, "De nuevo", null)).toMatchObject({ note: { revision: 1 } });
    expect((await noteRows(vaultOne)).map((row) => row.organization_id).sort()).toEqual(
      [a.organizationId, b.organizationId].sort()
    );
  });

  it("familias, integrantes suspendidas y sedes fuera del alcance no entran (403)", async () => {
    // Una familia es una cuenta sin membresía del equipo.
    const family: Actor = { userId: await authUser("family"), memberId: randomUUID() };
    const suspended = await member(a.organizationId, "manager", "all", [], "suspended", "suspended");
    for (const actor of [family, suspended]) {
      await expect(search(actor)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(card(actor, vaultOne)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(save(actor, vaultTwo, "Nota", null)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    // Entrenadora de la sede 2 pidiendo la sede 1.
    await expect(search(coachA2)).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    await expect(save(coachA2, vaultTwo, "Nota", null)).rejects.toMatchObject({ status: 403 });
    // Desde su sede, sí.
    const s2 = { organizationId: a.organizationId, locationId: a.locationIds[1]! };
    expect((await search(coachA2, {}, s2)).elements).toHaveLength(4);
    expect(await noteRows(vaultTwo)).toEqual([]);
  });

  it("borrar a una integrante deja la nota sin autoría", async () => {
    const leaver = await member(a.organizationId, "manager", "all", [], "leaver");
    await save(leaver, barsOne, "Nota de quien se va.", null);
    expect(await noteRows(barsOne)).toEqual([
      expect.objectContaining({ created_by_member_id: leaver.memberId, updated_by_member_id: leaver.memberId }),
    ]);
    await db.execute(sql`
      delete from zaltyko.organization_members
      where organization_id = ${a.organizationId}::uuid and id = ${leaver.memberId}::uuid
    `);
    expect(await noteRows(barsOne)).toEqual([
      expect.objectContaining({ note: "Nota de quien se va.", revision: 1, created_by_member_id: null, updated_by_member_id: null }),
    ]);
    expect((await card(ownerA, barsOne)).note).toMatchObject({ text: "Nota de quien se va.", revision: 1 });
  });

  it("en solo lectura del plan la ficha se lee, pero la nota no se guarda", async () => {
    const c = await academy("C", 1);
    const ownerC = await member(c.organizationId, "owner", "all", [], "ownerC");
    const sc = { organizationId: c.organizationId, locationId: c.locationIds[0]! };
    // Más gimnastas de las que admite el plan gratuito (30): la academia queda en solo lectura.
    await db.execute(sql`
      with new_people as (
        insert into zaltyko.people (organization_id, given_name, family_name)
        select ${c.organizationId}::uuid, 'Capacidad sintética', series.n::text
        from generate_series(1, 31) as series(n)
        returning id
      )
      insert into zaltyko.athletes (organization_id, person_id)
      select ${c.organizationId}::uuid, new_people.id from new_people
    `);
    expect(await card(ownerC, vaultTwo, sc)).toMatchObject({ id: vaultTwo, readOnly: true, note: null });
    expect((await search(ownerC, {}, sc)).elements).toHaveLength(4);
    await expect(save(ownerC, vaultTwo, "Nota", null, sc)).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });
    expect(await noteRows(vaultTwo)).toEqual([]);
  });

  it("con la medición encendida y sin la candidata del evento, la búsqueda funciona y la ficha no cuenta nada", async () => {
    const usageTablePresent = async () =>
      (
        (await db.execute(sql`select to_regclass('public.usage_events') is not null as present`)).rows[0] as {
          present: boolean;
        }
      ).present;
    const usageRows = async () =>
      (
        await db.execute(sql`
          select event_name, actor_role, occurrences from public.usage_events
          where organization_id = ${a.organizationId}::uuid
          order by event_name, actor_role
        `)
      ).rows;
    let installedUsage = false;
    if (!(await usageTablePresent())) {
      await runOnOwnConnection(candidate(HABITUAL_USE));
      installedUsage = true;
    }
    resetUsageStorageCache();
    setFlag(HABITUAL_USE_FLAGS.master, true);
    setFlag(HABITUAL_USE_FLAGS.usageMetrics, true);
    try {
      // La candidata del evento (20261119121500) no está: la tabla no admite el nombre.
      const check = await db.execute(sql`
        select pg_get_constraintdef(oid) as definition from pg_constraint
        where conrelid = to_regclass('public.usage_events') and conname = 'usage_events_event_name_check'
      `);
      expect((check.rows[0] as { definition: string }).definition).not.toContain("element_library_view");
      const before = await usageRows();

      // La búsqueda responde aunque el evento no se pueda guardar.
      expect((await search(ownerA)).elements.map((entry) => entry.id)).toEqual([vaultOne, vaultTwo, barsOne, beamOne]);
      expect(await recordElementLibraryView({ organizationId: a.organizationId, role: "owner" })).toBe(false);
      // La ficha no registra ninguna consulta.
      expect((await card(ownerA, vaultTwo)).id).toBe(vaultTwo);
      expect(await usageRows()).toEqual(before);

      // La medición sí está viva: una visita del equipo se cuenta.
      expect(await recordStaffVisit({ organizationId: a.organizationId, role: "owner" })).toBe(true);
    } finally {
      setFlag(HABITUAL_USE_FLAGS.master, false);
      setFlag(HABITUAL_USE_FLAGS.usageMetrics, false);
      resetUsageStorageCache();
      if (installedUsage) {
        // Vuelta atrás documentada en la candidata del uso habitual.
        await db.execute(sql`drop index if exists zaltyko.sessions_starts_at_idx`);
        await db.execute(sql`drop index if exists zaltyko.sessions_ends_at_idx`);
        await db.execute(sql`drop table if exists public.usage_events`);
      } else {
        await db.execute(sql`delete from public.usage_events where organization_id = ${a.organizationId}::uuid`);
      }
    }
  });

  it("vista de enlaces y elementos enlazables para niveles y guiones", async () => {
    const views = await getCatalogLinkView(db, [vaultOne, vaultWithdrawn, vaultDraft, maleFloor, randomUUID(), "no-es-un-id"]);
    expect(views.size).toBe(4);
    expect(views.get(vaultOne)).toEqual({
      name: "Rondada con medio giro de prueba",
      shortName: "Rondada con medio giro de prueba",
      apparatus: "vault",
      discipline: "artistic_female",
      status: "current",
      replacementId: null,
    });
    expect(views.get(vaultWithdrawn)).toMatchObject({ status: "withdrawn", replacementId: null });
    expect(views.get(vaultDraft)).toMatchObject({ status: "withdrawn" });
    expect(views.get(maleFloor)).toMatchObject({ status: "withdrawn", discipline: "artistic_male" });
    expect((await getCatalogLinkView(db, [])).size).toBe(0);

    // Una edición retirada se ve como «Edición anterior» (se deshace al terminar).
    const rollback = new Error("rollback");
    let retired: string | undefined;
    const seen = await db
      .transaction(async (tx) => {
        await tx.execute(sql`update zaltyko.catalog_element_editions set status = 'retired' where code = 'fig-mag-2025-2028'`);
        retired = (await getCatalogLinkView(tx, [maleFloor])).get(maleFloor)?.status;
        throw rollback;
      })
      .catch((error: unknown) => error);
    expect(seen).toBe(rollback);
    expect(retired).toBe("previous_edition");

    const female = { discipline: "artistic_female", apparatus: "vault" };
    expect(await findLinkableCatalogElement(db, vaultOne, female)).toEqual({ id: vaultOne });
    expect(await findLinkableCatalogElement(db, vaultOne, { discipline: "artistic_female", apparatus: "beam" })).toBeNull();
    expect(await findLinkableCatalogElement(db, vaultOne, { discipline: "artistic_male", apparatus: "vault" })).toBeNull();
    expect(await findLinkableCatalogElement(db, vaultWithdrawn, female)).toBeNull();
    expect(await findLinkableCatalogElement(db, vaultDraft, female)).toBeNull();
    expect(await findLinkableCatalogElement(db, maleFloor, { discipline: "artistic_male", apparatus: "floor" })).toBeNull();
    expect(await findLinkableCatalogElement(db, "no-es-un-id", female)).toBeNull();
  });
});
