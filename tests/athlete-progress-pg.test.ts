import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  changeAthleteObjectiveStatus,
  createAthleteObjective,
  createAthleteObservation,
  createSessionObservation,
  getAthleteProgress,
  updateAthleteObservation,
} from "@/modules/athlete-progress/application/athlete-progress-service";
import { isAthleteProgressStorageAvailable } from "@/modules/athlete-progress/application/athlete-progress-storage";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";

/**
 * P2 #17 · Objetivos y observaciones sobre PostgreSQL desechable de GitHub.
 * Instala el candidato SQL solo aquí, después de todos los guardas, y borra
 * sus tablas al terminar; nunca en un proyecto enlazado ni con credenciales
 * externas. Cubre: funcionalidad dormida, RLS/REVOKE, aislamiento entre
 * academias, entrenador sin asignación, gimnasta archivada, historial de
 * estados y bloqueo en solo lectura del plan.
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

const candidate = () =>
  readFileSync(
    resolve(process.cwd(), "docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql"),
    "utf8"
  );

async function expectPgCode(promise: Promise<unknown>, code: string) {
  const error = (await promise.then(
    () => null,
    (failure) => failure
  )) as { code?: string; cause?: { code?: string } } | null;
  expect(error).not.toBeNull();
  expect(error?.cause?.code ?? error?.code).toBe(code);
}

type Actor = { userId: string; memberId: string };

async function member(
  organizationId: string,
  role: "owner" | "admin" | "manager" | "coach",
  scopeMode: "all" | "selected",
  locationIds: string[] = [],
  label = role
): Promise<Actor> {
  const userId = randomUUID();
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-progress-${label}-${userId}@example.invalid`})`
  );
  const memberId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
    values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, ${role}, 'active', ${scopeMode})
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
    values (${organizationId}::uuid, ${`CI progreso ${label}`}, 'active')
  `);
  const locationIds: string[] = [];
  for (let index = 0; index < sites; index += 1) {
    const locationId = randomUUID();
    locationIds.push(locationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
      values (${locationId}::uuid, ${organizationId}::uuid,
        ${`ci-prog-${index}-${organizationId.slice(0, 8)}`}, ${`Sede ${label} ${index + 1}`}, 'Europe/Madrid', true)
    `);
  }
  return { organizationId, locationIds };
}

async function athlete(organizationId: string, givenName: string, active = true) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (${id}::uuid, ${organizationId}::uuid, ${givenName}, 'Progreso')
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id, is_active)
    values (${id}::uuid, ${organizationId}::uuid, ${id}::uuid, ${active})
  `);
  return id;
}

async function group(organizationId: string, locationId: string, name: string) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${name}, 20, 'active')
  `);
  return id;
}

async function joinGroup(
  organizationId: string,
  groupId: string,
  athleteId: string,
  status: "active" | "ended" = "active"
) {
  await db.execute(sql`
    insert into zaltyko.group_memberships (organization_id, group_id, athlete_id, status, starts_on, ends_on)
    values (${organizationId}::uuid, ${groupId}::uuid, ${athleteId}::uuid, ${status}, '2026-09-01',
      ${status === "ended" ? "2026-10-01" : null})
  `);
}

async function count(table: string, organizationId: string) {
  const result = await db.execute(
    sql`select count(*)::int as count from ${sql.identifier("zaltyko")}.${sql.identifier(table)} where organization_id = ${organizationId}::uuid`
  );
  return Number((result.rows[0] as { count: number }).count);
}

describe.skipIf(!disposablePgEnabled)("objetivos y observaciones en PostgreSQL desechable", () => {
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let ownerA: Actor;
  let managerA1: Actor;
  let coachA1: Actor;
  let otherCoachA1: Actor;
  let coachA2: Actor;
  let ownerB: Actor;
  // Ana: grupo activo en S1. Bea: solo S2. Carla: grupo terminado en S1.
  // Dani: grupos en S1 y S2. Eva: archivada con grupo en S1. Zoe: academia B.
  let ana: string;
  let bea: string;
  let carla: string;
  let dani: string;
  let eva: string;
  let zoe: string;
  let classS1: string;
  let otherClassS1: string;
  let sessionS1: string;
  let sessionS2: string;
  let enrollmentAna: string;
  let enrollmentOtherClass: string;

  const s1 = () => ({ organizationId: a.organizationId, locationId: a.locationIds[0]! });
  const s2 = () => ({ organizationId: a.organizationId, locationId: a.locationIds[1]! });

  function objective(actor: Actor, athleteId: string, scope: { organizationId: string; locationId: string }, overrides: Record<string, unknown> = {}) {
    return createAthleteObjective({
      actor,
      athleteId,
      command: { ...scope, clientRequestId: randomUUID(), title: "Rueda sin manos", discipline: "gaf", apparatus: "beam", targetDate: "2027-03-01", ...overrides },
    });
  }

  function observation(actor: Actor, athleteId: string, scope: { organizationId: string; locationId: string }, overrides: Record<string, unknown> = {}) {
    return createAthleteObservation({
      actor,
      athleteId,
      command: { ...scope, clientRequestId: randomUUID(), body: "Buena entrada en barra", ...overrides },
    });
  }

  function read(actor: Actor, athleteId: string, scope: { organizationId: string; locationId: string }, objectiveStatus: string | null = null) {
    return getAthleteProgress({ actor, athleteId, query: { ...scope, objectiveStatus } });
  }

  beforeAll(async () => {
    assertDisposableTarget();
    a = await academy("A", 2);
    b = await academy("B", 1);
    ownerA = await member(a.organizationId, "owner", "all");
    managerA1 = await member(a.organizationId, "manager", "selected", [a.locationIds[0]!]);
    coachA1 = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "coach1");
    otherCoachA1 = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "coach1b");
    coachA2 = await member(a.organizationId, "coach", "selected", [a.locationIds[1]!], "coach2");
    ownerB = await member(b.organizationId, "owner", "all");

    ana = await athlete(a.organizationId, "Ana");
    bea = await athlete(a.organizationId, "Bea");
    carla = await athlete(a.organizationId, "Carla");
    dani = await athlete(a.organizationId, "Dani");
    eva = await athlete(a.organizationId, "Eva", false);
    zoe = await athlete(b.organizationId, "Zoe");
    const groupS1 = await group(a.organizationId, a.locationIds[0]!, "Base 3 GAF");
    const groupS2 = await group(a.organizationId, a.locationIds[1]!, "Base 2 GAF");
    await joinGroup(a.organizationId, groupS1, ana);
    await joinGroup(a.organizationId, groupS2, bea);
    await joinGroup(a.organizationId, groupS1, carla, "ended");
    await joinGroup(a.organizationId, groupS1, dani);
    await joinGroup(a.organizationId, groupS2, dani);
    await joinGroup(a.organizationId, groupS1, eva);
    await joinGroup(b.organizationId, await group(b.organizationId, b.locationIds[0]!, "Base B"), zoe);

    classS1 = randomUUID();
    otherClassS1 = randomUUID();
    const classS2 = randomUUID();
    await db.execute(sql`
      insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from)
      values (${classS1}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, 'CI Base 3', 12, 'active', '2026-09-01'),
             (${otherClassS1}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, 'CI Iniciación', 12, 'active', '2026-09-01'),
             (${classS2}::uuid, ${a.organizationId}::uuid, ${a.locationIds[1]}::uuid, 'CI Base 2', 12, 'active', '2026-09-01')
    `);
    enrollmentAna = randomUUID();
    enrollmentOtherClass = randomUUID();
    await db.execute(sql`
      insert into zaltyko.enrollments (id, organization_id, location_id, athlete_id, class_template_id, status, starts_on, source)
      values (${enrollmentAna}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, ${ana}::uuid, ${classS1}::uuid, 'active', '2026-09-01', 'owner'),
             (${enrollmentOtherClass}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, ${dani}::uuid, ${otherClassS1}::uuid, 'active', '2026-09-01', 'owner')
    `);
    sessionS1 = randomUUID();
    sessionS2 = randomUUID();
    await db.execute(sql`
      insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at)
      values (${sessionS1}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, ${classS1}::uuid, 'completed',
                '2026-10-05T16:30:00Z', '2026-10-05T18:00:00Z'),
             (${sessionS2}::uuid, ${a.organizationId}::uuid, ${a.locationIds[1]}::uuid, ${classS2}::uuid, 'completed',
                '2026-10-05T16:30:00Z', '2026-10-05T18:00:00Z')
    `);

    // Funcionalidad dormida: sin el candidato, todo responde 503 sin escribir.
    expect(await isAthleteProgressStorageAvailable(db)).toBe(false);
    await expect(read(ownerA, ana, s1())).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    await expect(objective(ownerA, ana, s1())).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    // El preflight rechaza una relación parcial antes de tocar nada.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`create table zaltyko.athlete_observations (id uuid)`);
        await tx.execute(sql.raw(candidate()));
      })
    ).rejects.toThrow(/athlete_observations absent/);
    await db.execute(sql.raw(candidate()));
  }, 60_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    await db.execute(sql`drop table if exists zaltyko.athlete_observations`);
    await db.execute(sql`drop table if exists zaltyko.athlete_objective_status_history`);
    await db.execute(sql`drop table if exists zaltyko.athlete_objectives`);
  });

  it("fuerza RLS, niega el acceso directo de anon/authenticated y rechaza reinstalar", async () => {
    expect(await isAthleteProgressStorageAvailable(db)).toBe(true);
    const inventory = await db.execute(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c
      where c.oid in ('zaltyko.athlete_objectives'::regclass,
                      'zaltyko.athlete_objective_status_history'::regclass,
                      'zaltyko.athlete_observations'::regclass)
    `);
    expect(inventory.rows).toHaveLength(3);
    for (const row of inventory.rows) {
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, anon_access: false, authenticated_access: false });
    }
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["athlete_objectives", "athlete_objective_status_history", "athlete_observations"]) {
        await expectPgCode(
          db.transaction(async (tx) => {
            await tx.execute(sql.raw(`set local role ${role}`));
            await tx.execute(sql`select id from ${sql.identifier("zaltyko")}.${sql.identifier(table)} limit 1`);
          }),
          "42501"
        );
      }
    }
    await expect(db.execute(sql.raw(candidate()))).rejects.toThrow(/athlete_objectives absent/);
  });

  it("guarda el historial de estados, repite de forma idempotente y detecta versiones viejas", async () => {
    const clientRequestId = randomUUID();
    const command = { ...s1(), clientRequestId, title: "Mortal atrás agrupado", discipline: "gaf", apparatus: "floor", targetDate: null };
    const created = await createAthleteObjective({ actor: ownerA, athleteId: ana, command });
    expect(created).toMatchObject({ revision: 1, replayed: false });
    expect(await createAthleteObjective({ actor: ownerA, athleteId: ana, command })).toEqual({ ...created, replayed: true });
    await expect(
      createAthleteObjective({ actor: ownerA, athleteId: ana, command: { ...command, title: "Otro objetivo" } })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(
      createAthleteObjective({ actor: ownerA, athleteId: ana, command: { ...command, clientRequestId: randomUUID(), apparatus: "rings" } })
    ).rejects.toThrow();

    const change = (expectedRevision: number, status: string, actor = ownerA) =>
      changeAthleteObjectiveStatus({ actor, athleteId: ana, objectiveId: created.id, command: { ...s1(), expectedRevision, status } });
    expect(await change(1, "achieved")).toMatchObject({ revision: 2 });
    await expect(change(1, "discarded")).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    await expect(change(2, "achieved")).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(await change(2, "in_progress", managerA1)).toMatchObject({ revision: 3 });

    const view = await read(ownerA, ana, s1());
    const stored = view.objectives.find((item) => item.id === created.id)!;
    expect(stored).toMatchObject({ status: "in_progress", revision: 3, discipline: "gaf", apparatus: "floor" });
    expect(stored.history.map(({ revision, fromStatus, toStatus }) => ({ revision, fromStatus, toStatus }))).toEqual([
      { revision: 1, fromStatus: null, toStatus: "in_progress" },
      { revision: 2, fromStatus: "in_progress", toStatus: "achieved" },
      { revision: 3, fromStatus: "achieved", toStatus: "in_progress" },
    ]);
    expect((await read(ownerA, ana, s1(), "achieved")).objectives.map((item) => item.id)).not.toContain(created.id);

    const audit = await db.execute(sql`
      select action, after::text as after from zaltyko.audit_log
      where organization_id = ${a.organizationId}::uuid and target_id = ${created.id}::uuid
      order by created_at, action
    `);
    expect(audit.rows.map((row) => (row as { action: string }).action)).toEqual([
      "athlete_objective.created",
      "athlete_objective.status_changed",
      "athlete_objective.status_changed",
    ]);
  });

  it("aísla las academias: otra academia no lee ni escribe y una sede ajena no existe", async () => {
    await observation(ownerA, ana, s1(), { body: "Nota privada de A" });
    const before = { objectives: await count("athlete_objectives", a.organizationId), observations: await count("athlete_observations", a.organizationId) };

    // Miembro de B con la academia de A: no es miembro.
    await expect(read(ownerB, ana, s1())).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(observation(ownerB, ana, s1())).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Miembro de B con su propia academia y una gimnasta de A: no existe.
    const scopeB = { organizationId: b.organizationId, locationId: b.locationIds[0]! };
    await expect(read(ownerB, ana, scopeB)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(objective(ownerB, ana, scopeB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Dirección de A con una sede de B: la sede no existe en A.
    await expect(read(ownerA, ana, { organizationId: a.organizationId, locationId: b.locationIds[0]! })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // B sí gestiona a su gimnasta, sin ver nada de A.
    await observation(ownerB, zoe, scopeB, { body: "Nota de B" });
    const viewB = await read(ownerB, zoe, scopeB);
    expect(viewB.observations.map((item) => item.body)).toEqual(["Nota de B"]);
    expect(JSON.stringify(viewB)).not.toContain("Nota privada de A");

    expect(await count("athlete_objectives", a.organizationId)).toBe(before.objectives);
    expect(await count("athlete_observations", a.organizationId)).toBe(before.observations);
  });

  it("el entrenador solo llega a gimnastas con grupo o inscripción abierta en su sede asignada", async () => {
    // Ana está en S1: el entrenador de S1 lee y escribe.
    expect((await read(coachA1, ana, s1())).canWrite).toBe(true);
    await observation(coachA1, ana, s1(), { body: "Del entrenador de S1" });
    // Bea solo está en S2: con S1 no está vinculada y con S2 la sede no es suya.
    await expect(read(coachA1, bea, s1())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(read(coachA1, bea, s2())).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    await expect(observation(coachA1, bea, s2())).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });
    // Entrenador sin asignación en la sede de Ana.
    await expect(read(coachA2, ana, s1())).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });
    await expect(read(coachA2, ana, s2())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(objective(coachA2, ana, s2())).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Carla ya no está en el grupo de S1: el entrenador no la ve; la dirección sí, por historial.
    await expect(read(coachA1, carla, s1())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await read(ownerA, carla, s1())).athlete.name).toBe("Carla Progreso");
  });

  it("cada registro conserva su sede: quien solo tiene una sede no ve los de otra", async () => {
    await observation(ownerA, dani, s2(), { body: "Observada en S2" });
    await observation(ownerA, dani, s1(), { body: "Observada en S1" });
    const coachView = await read(coachA1, dani, s1());
    expect(coachView.observations.map((item) => item.body)).toEqual(["Observada en S1"]);
    const managerView = await read(managerA1, dani, s1());
    expect(managerView.observations.map((item) => item.body)).toEqual(["Observada en S1"]);
    const ownerView = await read(ownerA, dani, s1());
    expect(ownerView.observations.map((item) => item.body).sort()).toEqual(["Observada en S1", "Observada en S2"]);
  });

  it("el entrenador edita solo lo suyo; la coordinación puede editar lo de otros", async () => {
    const ownerObjective = await objective(ownerA, ana, s1(), { title: "Paloma en paralelas", discipline: "gaf", apparatus: "uneven_bars" });
    await expect(
      changeAthleteObjectiveStatus({ actor: coachA1, athleteId: ana, objectiveId: ownerObjective.id, command: { ...s1(), expectedRevision: 1, status: "achieved" } })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    const coachObjective = await objective(coachA1, ana, s1(), { title: "Vertical 3 segundos", discipline: null, apparatus: null });
    expect(
      await changeAthleteObjectiveStatus({ actor: coachA1, athleteId: ana, objectiveId: coachObjective.id, command: { ...s1(), expectedRevision: 1, status: "achieved" } })
    ).toMatchObject({ revision: 2 });

    const note = await observation(coachA1, ana, s1(), { body: "Original", objectiveId: coachObjective.id, visibility: "family" });
    const edit = (actor: Actor, expectedRevision: number, body: string) =>
      updateAthleteObservation({ actor, athleteId: ana, observationId: note.id, command: { ...s1(), expectedRevision, body, visibility: "team" } });
    await expect(edit(otherCoachA1, 1, "Cambiada por otro")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await edit(coachA1, 1, "Corregida")).toMatchObject({ revision: 2 });
    await expect(edit(managerA1, 1, "Vieja")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await edit(managerA1, 2, "Revisada por coordinación")).toMatchObject({ revision: 3 });

    const view = await read(otherCoachA1, ana, s1());
    const stored = view.observations.find((item) => item.id === note.id)!;
    expect(stored).toMatchObject({ body: "Revisada por coordinación", visibility: "team", objectiveId: coachObjective.id, canEdit: false });
    // Un objetivo de otra gimnasta no se puede enlazar.
    await expect(observation(ownerA, dani, s1(), { objectiveId: coachObjective.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Las auditorías no guardan el texto de la observación.
    const audit = await db.execute(sql`
      select count(*)::int as leaks from zaltyko.audit_log
      where organization_id = ${a.organizationId}::uuid and target_type = 'athlete_observation'
        and (coalesce(before::text, '') || coalesce(after::text, '') || metadata::text) like '%Corregida%'
    `);
    expect(audit.rows[0]).toMatchObject({ leaks: 0 });
  });

  it("una gimnasta archivada no existe para el entrenador y es de solo lectura para la dirección", async () => {
    await expect(read(coachA1, eva, s1())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(observation(coachA1, eva, s1())).rejects.toMatchObject({ code: "NOT_FOUND" });
    const view = await read(ownerA, eva, s1());
    expect(view).toMatchObject({ athlete: { archived: true }, canWrite: false });
    await expect(objective(ownerA, eva, s1())).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", status: 409 });
    await expect(observation(ownerA, eva, s1())).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("el acceso rápido de Pasar lista toma la gimnasta de la inscripción de esa sesión", async () => {
    const clientRequestId = randomUUID();
    const command = { ...s1(), enrollmentId: enrollmentAna, clientRequestId, body: "Muy concentrada" };
    const created = await createSessionObservation({ actor: coachA1, sessionId: sessionS1, command });
    expect(created).toMatchObject({ athleteId: ana, replayed: false });
    expect(await createSessionObservation({ actor: coachA1, sessionId: sessionS1, command })).toMatchObject({ id: created.id, replayed: true });
    const stored = (await read(coachA1, ana, s1())).observations.find((item) => item.id === created.id)!;
    expect(stored).toMatchObject({ sessionId: sessionS1, observedOn: "2026-10-05", visibility: "team" });

    // Inscripción de otra clase, sesión de otra sede o entrenador de otra sede.
    await expect(
      createSessionObservation({ actor: coachA1, sessionId: sessionS1, command: { ...command, clientRequestId: randomUUID(), enrollmentId: enrollmentOtherClass } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createSessionObservation({ actor: coachA1, sessionId: sessionS2, command: { ...command, clientRequestId: randomUUID() } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createSessionObservation({ actor: coachA2, sessionId: sessionS1, command: { ...command, clientRequestId: randomUUID() } })
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });
    await expect(
      createSessionObservation({ actor: ownerB, sessionId: sessionS1, command: { ...command, organizationId: b.organizationId, locationId: b.locationIds[0]!, clientRequestId: randomUUID() } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("en solo lectura del plan se puede leer y repetir, pero no escribir", async () => {
    const clientRequestId = randomUUID();
    const command = { ...s1(), clientRequestId, title: "Antes del bloqueo", discipline: null, apparatus: null, targetDate: null };
    const created = await createAthleteObjective({ actor: ownerA, athleteId: ana, command });
    const note = await observation(ownerA, ana, s1(), { body: "Antes del bloqueo" });

    await db.execute(sql`
      with new_people as (
        insert into zaltyko.people (organization_id, given_name, family_name)
        select ${a.organizationId}::uuid, 'Capacidad sintética', series.n::text
        from generate_series(1, 30) as series(n)
        returning id
      )
      insert into zaltyko.athletes (organization_id, person_id)
      select ${a.organizationId}::uuid, new_people.id from new_people
    `);
    const usage = await db.transaction((tx) => getOrganizationUsage(tx, a.organizationId));
    expect(usage.readOnly).toBe(true);
    const before = { objectives: await count("athlete_objectives", a.organizationId), observations: await count("athlete_observations", a.organizationId) };

    expect((await read(coachA1, ana, s1())).objectives.length).toBeGreaterThan(0);
    expect(await createAthleteObjective({ actor: ownerA, athleteId: ana, command })).toEqual({ ...created, replayed: true });
    await expect(objective(ownerA, ana, s1())).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });
    await expect(observation(coachA1, ana, s1())).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
    await expect(
      changeAthleteObjectiveStatus({ actor: ownerA, athleteId: ana, objectiveId: created.id, command: { ...s1(), expectedRevision: 1, status: "discarded" } })
    ).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
    await expect(
      updateAthleteObservation({ actor: ownerA, athleteId: ana, observationId: note.id, command: { ...s1(), expectedRevision: 1, body: "Cambio", visibility: "team" } })
    ).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
    await expect(
      createSessionObservation({ actor: coachA1, sessionId: sessionS1, command: { ...s1(), enrollmentId: enrollmentAna, clientRequestId: randomUUID(), body: "Bloqueada" } })
    ).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });

    expect(await count("athlete_objectives", a.organizationId)).toBe(before.objectives);
    expect(await count("athlete_observations", a.organizationId)).toBe(before.observations);
  }, 60_000);
});
