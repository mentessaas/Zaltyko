import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  getClassCoaches,
  getClassTitularsByClass,
  getSessionCoachSummaries,
  getSessionCoaches,
  isCoachAssignmentStorageAvailable,
  setClassCoaches,
  setSessionCoaches,
} from "@/modules/coach-assignment/application/coach-assignment-service";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";
import { materializeSessions } from "@/modules/scheduling/application/session-service";

/**
 * O1 · Titular por clase y sustitución por sesión sobre PostgreSQL desechable
 * de GitHub. Instala el candidato SQL solo aquí, después de todos los guardas,
 * y borra sus tablas al terminar; nunca en un proyecto enlazado ni con
 * credenciales externas. Cubre: funcionalidad dormida (503), RLS/REVOKE,
 * elegibilidad (rol entrenador y acceso a la sede), entrenador sin permiso de
 * asignar, propagación y herencia, sustitución solo en su sesión, aislamiento
 * entre academias, Hoy y bloqueo en solo lectura del plan.
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
    resolve(process.cwd(), "docs/deployment/candidates/20261111180000_coach_assignment_candidate.sql"),
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

async function expectCandidateRefused(promise: Promise<unknown>) {
  const error = (await promise.then(
    () => null,
    (failure) => failure
  )) as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  expect(error).not.toBeNull();
  const raised = error?.cause ?? error;
  expect(raised?.code).toBe("P0001");
  expect(raised?.message).toMatch(/^Coach assignment candidate requires .* absent; inspect existing schema before promotion$/);
}

type Actor = { userId: string; memberId: string };
type Role = "owner" | "admin" | "manager" | "coach";

async function member(
  organizationId: string,
  role: Role,
  scopeMode: "all" | "selected",
  locationIds: string[] = [],
  label: string = role,
  status: "active" | "suspended" = "active"
): Promise<Actor> {
  const userId = randomUUID();
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-coaches-${label}-${userId}@example.invalid`})`
  );
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

/** Ficha de equipo (people + staff_profiles), vinculada o no a un miembro. */
async function staffProfile(organizationId: string, givenName: string, familyName: string, memberId: string | null) {
  const personId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (${personId}::uuid, ${organizationId}::uuid, ${givenName}, ${familyName})
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.staff_profiles (id, organization_id, person_id, member_id, is_active)
    values (${id}::uuid, ${organizationId}::uuid, ${personId}::uuid, ${memberId}::uuid, true)
  `);
  return id;
}

async function academy(label: string, sites: number) {
  const organizationId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI titulares ${label}`}, 'active')
  `);
  const locationIds: string[] = [];
  for (let index = 0; index < sites; index += 1) {
    const locationId = randomUUID();
    locationIds.push(locationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
      values (${locationId}::uuid, ${organizationId}::uuid,
        ${`ci-coach-${index}-${organizationId.slice(0, 8)}`}, ${`Sede ${label} ${index + 1}`}, 'Europe/Madrid', true)
    `);
  }
  return { organizationId, locationIds };
}

async function classTemplate(organizationId: string, locationId: string, name: string) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${name}, 12, 'active', '2026-09-01')
  `);
  return id;
}

async function session(
  organizationId: string,
  locationId: string,
  classTemplateId: string,
  startsAt: string,
  status: "scheduled" | "completed" | "cancelled" = "scheduled"
) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${classTemplateId}::uuid, ${status},
      ${startsAt}::timestamptz, ${startsAt}::timestamptz + interval '90 minutes')
  `);
  return id;
}

async function sessionStaffIds(sessionId: string): Promise<string[]> {
  const result = await db.execute(sql`
    select staff_profile_id::text as id from zaltyko.session_staff
    where session_id = ${sessionId}::uuid and assignment_role = 'coach' order by staff_profile_id
  `);
  return (result.rows as Array<{ id: string }>).map((row) => row.id);
}

async function count(table: string, organizationId: string) {
  const result = await db.execute(
    sql`select count(*)::int as count from ${sql.identifier("zaltyko")}.${sql.identifier(table)} where organization_id = ${organizationId}::uuid`
  );
  return Number((result.rows[0] as { count: number }).count);
}

async function auditActions(organizationId: string, targetId: string) {
  const result = await db.execute(sql`
    select action, actor_user_id::text as actor, after, metadata from zaltyko.audit_log
    where organization_id = ${organizationId}::uuid and target_id = ${targetId}::uuid
      and action in ('class_template.coaches_set', 'session.coaches_set')
    order by created_at, id
  `);
  return result.rows as Array<{ action: string; actor: string; after: Record<string, unknown>; metadata: Record<string, unknown> }>;
}

const sorted = (...ids: string[]) => [...ids].sort();

describe.skipIf(!disposablePgEnabled)("titulares por clase y sustituciones en PostgreSQL desechable", () => {
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let ownerA: Actor;
  let managerS1: Actor;
  let coachAna: Actor;
  let coachDani: Actor;
  let ownerB: Actor;
  // Fichas de equipo de A: Ana y Bea (entrenadoras de S1), Carla (entrenadora
  // de todas las sedes), Dani (entrenador solo de S2), Eva (coordinadora, no
  // entrenadora), Fran (ficha sin acceso), Gema (entrenadora suspendida).
  // Zoe es entrenadora de la academia B.
  let ana: string;
  let bea: string;
  let carla: string;
  let dani: string;
  let eva: string;
  let fran: string;
  let gema: string;
  let zoe: string;
  let classS1: string;
  let classS2: string;
  let classB: string;
  let pastS1: string;
  let futureS1a: string;
  let futureS1b: string;
  let cancelledS1: string;
  let futureS2: string;
  let futureB: string;

  const s1 = () => ({ organizationId: a.organizationId, locationId: a.locationIds[0]! });
  const s2 = () => ({ organizationId: a.organizationId, locationId: a.locationIds[1]! });
  const scopeB = () => ({ organizationId: b.organizationId, locationId: b.locationIds[0]! });

  function setClass(actor: Actor, classTemplateId: string, staffProfileIds: string[], expected: string[], scope = s1(), clientRequestId = randomUUID()) {
    return setClassCoaches({
      actor,
      classTemplateId,
      command: { ...scope, clientRequestId, staffProfileIds, expectedStaffProfileIds: expected },
    });
  }

  function setSession(
    actor: Actor,
    sessionId: string,
    staffProfileIds: string[],
    expected: string[],
    reason: "absence" | "reinforcement" | "one_off_change" | "other" | null = null,
    scope = s1(),
    clientRequestId = randomUUID()
  ) {
    return setSessionCoaches({
      actor,
      sessionId,
      command: { ...scope, clientRequestId, staffProfileIds, expectedStaffProfileIds: expected, reason },
    });
  }

  beforeAll(async () => {
    assertDisposableTarget();
    a = await academy("A", 2);
    b = await academy("B", 1);
    ownerA = await member(a.organizationId, "owner", "all");
    managerS1 = await member(a.organizationId, "manager", "selected", [a.locationIds[0]!], "manager-s1");
    coachAna = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "ana");
    const coachBea = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "bea");
    const coachCarla = await member(a.organizationId, "coach", "all", [], "carla");
    coachDani = await member(a.organizationId, "coach", "selected", [a.locationIds[1]!], "dani");
    const managerEva = await member(a.organizationId, "manager", "all", [], "eva");
    const coachGema = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "gema", "suspended");
    ownerB = await member(b.organizationId, "owner", "all");
    const coachZoe = await member(b.organizationId, "coach", "all", [], "zoe");

    ana = await staffProfile(a.organizationId, "Ana", "Ruiz", coachAna.memberId);
    bea = await staffProfile(a.organizationId, "Bea", "Gil", coachBea.memberId);
    carla = await staffProfile(a.organizationId, "Carla", "Pons", coachCarla.memberId);
    dani = await staffProfile(a.organizationId, "Dani", "Vidal", coachDani.memberId);
    eva = await staffProfile(a.organizationId, "Eva", "Mora", managerEva.memberId);
    fran = await staffProfile(a.organizationId, "Fran", "Ortiz", null);
    gema = await staffProfile(a.organizationId, "Gema", "Sáez", coachGema.memberId);
    zoe = await staffProfile(b.organizationId, "Zoe", "Lara", coachZoe.memberId);

    classS1 = await classTemplate(a.organizationId, a.locationIds[0]!, "CI Base 3 GAF");
    classS2 = await classTemplate(a.organizationId, a.locationIds[1]!, "CI Iniciación");
    classB = await classTemplate(b.organizationId, b.locationIds[0]!, "CI Base B");
    pastS1 = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-10-05T16:30:00Z", "completed");
    futureS1a = await session(a.organizationId, a.locationIds[0]!, classS1, "2030-01-10T16:30:00Z");
    futureS1b = await session(a.organizationId, a.locationIds[0]!, classS1, "2030-01-17T16:30:00Z");
    cancelledS1 = await session(a.organizationId, a.locationIds[0]!, classS1, "2030-01-24T16:30:00Z", "cancelled");
    futureS2 = await session(a.organizationId, a.locationIds[1]!, classS2, "2030-01-11T16:30:00Z");
    futureB = await session(b.organizationId, b.locationIds[0]!, classB, "2030-01-10T16:30:00Z");

    // Funcionalidad dormida: sin el candidato, todo responde 503 sin escribir,
    // la generación de sesiones sigue igual y Hoy no recibe datos.
    expect(await isCoachAssignmentStorageAvailable(db)).toBe(false);
    await expect(getClassCoaches({ actor: ownerA, classTemplateId: classS1, query: s1() })).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
    });
    await expect(setClass(ownerA, classS1, [ana], [])).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    await expect(setSession(ownerA, futureS1a, [ana], [])).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE" });
    await expect(getSessionCoaches({ actor: coachAna, sessionId: futureS1a, query: s1() })).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
    });
    expect(
      await getSessionCoachSummaries(db, { organizationId: a.organizationId, viewerMemberId: coachAna.memberId, sessionIds: [futureS1a] })
    ).toBeNull();
    expect(await count("session_staff", a.organizationId)).toBe(0);
    // El preflight rechaza una relación parcial antes de tocar nada.
    await expectCandidateRefused(
      db.transaction(async (tx) => {
        await tx.execute(sql`create table zaltyko.session_staff_overrides (id uuid)`);
        await tx.execute(sql.raw(candidate()));
      })
    );
    expect(await isCoachAssignmentStorageAvailable(db)).toBe(false);
    await db.execute(sql.raw(candidate()));
  }, 60_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    await db.execute(sql`drop table if exists zaltyko.session_staff_overrides`);
    await db.execute(sql`drop table if exists zaltyko.class_template_staff`);
  });

  it("fuerza RLS, niega el acceso directo de anon/authenticated y rechaza reinstalar", async () => {
    expect(await isCoachAssignmentStorageAvailable(db)).toBe(true);
    const inventory = await db.execute(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c
      where c.oid in ('zaltyko.class_template_staff'::regclass, 'zaltyko.session_staff_overrides'::regclass)
    `);
    expect(inventory.rows).toHaveLength(2);
    for (const row of inventory.rows) {
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, anon_access: false, authenticated_access: false });
    }
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["class_template_staff", "session_staff_overrides"]) {
        await expectPgCode(
          db.transaction(async (tx) => {
            await tx.execute(sql.raw(`set local role ${role}`));
            await tx.execute(sql`select id from ${sql.identifier("zaltyko")}.${sql.identifier(table)} limit 1`);
          }),
          "42501"
        );
      }
    }
    await expectCandidateRefused(db.execute(sql.raw(candidate())));
  });

  it("solo ofrece y admite entrenadoras activas con acceso a la sede de la clase", async () => {
    const view = await getClassCoaches({ actor: ownerA, classTemplateId: classS1, query: { organizationId: a.organizationId } });
    expect(view).toMatchObject({ classTemplateId: classS1, locationId: a.locationIds[0], titulars: [], canWrite: true });
    expect(view.eligible.map((coach) => coach.name)).toEqual(["Ana Ruiz", "Bea Gil", "Carla Pons"]);
    expect((await getClassCoaches({ actor: ownerA, classTemplateId: classS2, query: s2() })).eligible.map((coach) => coach.name)).toEqual([
      "Carla Pons",
      "Dani Vidal",
    ]);

    // Sin rol entrenador, sin acceso, sin acceso a esa sede, suspendida u otra academia.
    for (const outsider of [eva, fran, dani, gema, zoe]) {
      await expect(setClass(ownerA, classS1, [ana, outsider], [])).rejects.toMatchObject({
        code: "INVALID_RELATION",
        status: 422,
      });
    }
    await expect(setSession(ownerA, futureS1a, [dani], [])).rejects.toMatchObject({ code: "INVALID_RELATION" });
    expect(await count("class_template_staff", a.organizationId)).toBe(0);
    expect(await count("session_staff", a.organizationId)).toBe(0);
    expect(await count("session_staff_overrides", a.organizationId)).toBe(0);
  });

  it("un entrenador no puede asignar ni sustituir, ni siquiera en su sede", async () => {
    await expect(getClassCoaches({ actor: coachAna, classTemplateId: classS1, query: s1() })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(setClass(coachAna, classS1, [ana], [])).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(setSession(coachAna, futureS1a, [ana], [])).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    // La coordinación de S1 no gestiona S2.
    await expect(setClass(managerS1, classS2, [carla], [], s2())).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });
    expect(await count("class_template_staff", a.organizationId)).toBe(0);
    expect(await count("session_staff", a.organizationId)).toBe(0);
  });

  it("guarda titulares, los propaga a las sesiones futuras programadas y lo audita", async () => {
    const clientRequestId = randomUUID();
    const first = await setClass(ownerA, classS1, [ana], [], s1(), clientRequestId);
    expect(first).toMatchObject({ replayed: false, updatedSessionCount: 2 });
    expect(first.titulars.map((coach) => coach.name)).toEqual(["Ana Ruiz"]);
    expect(await sessionStaffIds(futureS1a)).toEqual([ana]);
    expect(await sessionStaffIds(futureS1b)).toEqual([ana]);
    // Pasadas y canceladas no cambian.
    expect(await sessionStaffIds(pastS1)).toEqual([]);
    expect(await sessionStaffIds(cancelledS1)).toEqual([]);

    // Reintento de la misma petición: misma respuesta, sin otra auditoría.
    const replay = await setClass(ownerA, classS1, [ana], [], s1(), clientRequestId);
    expect(replay).toMatchObject({ replayed: true, updatedSessionCount: 0 });
    await expect(setClass(ownerA, classS1, [bea], [], s1(), clientRequestId)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    // La pantalla tenía una lista vieja.
    await expect(setClass(ownerA, classS1, [bea], [])).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    const audit = await auditActions(a.organizationId, classS1);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "class_template.coaches_set", actor: ownerA.userId });
    expect(audit[0]!.after).toEqual({ staffProfileIds: [ana], updatedSessionCount: 2 });
    expect(JSON.stringify(audit[0])).not.toContain("Ana Ruiz");
    const stored = await db.execute(sql`
      select assigned_by_member_id::text as by from zaltyko.class_template_staff where class_template_id = ${classS1}::uuid
    `);
    expect(stored.rows).toEqual([{ by: ownerA.memberId }]);
  });

  it("la sustitución afecta solo a esa sesión y la clase conserva sus titulares", async () => {
    const changed = await setSession(managerS1, futureS1a, [bea], [ana], "absence");
    expect(changed.coaches.map((coach) => coach.name)).toEqual(["Bea Gil"]);
    expect(changed.titulars.map((coach) => coach.name)).toEqual(["Ana Ruiz"]);
    expect(changed.substitution).toMatchObject({ reason: "absence", changedByName: "Coordinador/a" });
    expect(await sessionStaffIds(futureS1a)).toEqual([bea]);
    expect(await sessionStaffIds(futureS1b)).toEqual([ana]);
    expect((await getClassCoaches({ actor: ownerA, classTemplateId: classS1, query: s1() })).titulars.map((coach) => coach.name)).toEqual([
      "Ana Ruiz",
    ]);
    const audit = await auditActions(a.organizationId, futureS1a);
    expect(audit.at(-1)).toMatchObject({ action: "session.coaches_set", actor: managerS1.userId });
    expect(audit.at(-1)!.after).toEqual({ staffProfileIds: [bea], substitution: true, reason: "absence" });

    // Nuevas titulares: la sesión sustituida no cambia; la otra, sí.
    const updated = await setClass(ownerA, classS1, [ana, carla], [ana]);
    expect(updated.updatedSessionCount).toBe(1);
    expect(await sessionStaffIds(futureS1a)).toEqual([bea]);
    expect(await sessionStaffIds(futureS1b)).toEqual(sorted(ana, carla));

    // La entrenadora de la sede lee quién está; no ve candidatas ni puede cambiarlo.
    const asCoach = await getSessionCoaches({ actor: coachAna, sessionId: futureS1b, query: s1() });
    expect(asCoach).toMatchObject({ assignedToViewer: true, canWrite: false, eligible: null, substitution: null });
    expect((await getSessionCoaches({ actor: coachAna, sessionId: futureS1a, query: s1() })).assignedToViewer).toBe(false);
    // Fuera de su sede la sesión no existe para ella.
    await expect(getSessionCoaches({ actor: coachDani, sessionId: futureS1a, query: s1() })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    // Quitar la sustitución: vuelve a las titulares y se borra la marca.
    const restored = await setSession(ownerA, futureS1a, [ana, carla], [bea], "absence");
    expect(restored.substitution).toBeNull();
    expect(await sessionStaffIds(futureS1a)).toEqual(sorted(ana, carla));
    expect(await count("session_staff_overrides", a.organizationId)).toBe(0);
    // Una sesión cancelada no se sustituye.
    await expect(setSession(ownerA, cancelledS1, [ana], [])).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("las sesiones que se generan heredan las titulares", async () => {
    await db.execute(sql`
      insert into zaltyko.class_template_weekdays (organization_id, class_template_id, iso_weekday, starts_at_local, ends_at_local)
      values (${a.organizationId}::uuid, ${classS1}::uuid, 1, '17:30', '19:00'),
             (${a.organizationId}::uuid, ${classS2}::uuid, 1, '17:30', '19:00')
    `);
    const generated = await materializeSessions({
      organizationId: a.organizationId,
      classTemplateId: classS1,
      startDate: "2030-02-04",
      endDate: "2030-02-17",
      idempotencyKey: `ci-coach-inherit-${randomUUID()}`,
      actor: ownerA,
    });
    expect(generated).toHaveLength(2);
    for (const item of generated) expect(await sessionStaffIds(item.id)).toEqual(sorted(ana, carla));

    // Una clase sin titulares genera sesiones sin nadie asignado.
    const withoutTitulars = await materializeSessions({
      organizationId: a.organizationId,
      classTemplateId: classS2,
      startDate: "2030-02-04",
      endDate: "2030-02-10",
      idempotencyKey: `ci-coach-inherit-${randomUUID()}`,
      actor: ownerA,
    });
    expect(withoutTitulars).toHaveLength(1);
    expect(await sessionStaffIds(withoutTitulars[0]!.id)).toEqual([]);
    expect(await getClassTitularsByClass(db, { organizationId: a.organizationId, classTemplateIds: [classS1, classS2] })).toEqual({
      [classS1]: [
        { staffProfileId: ana, name: "Ana Ruiz" },
        { staffProfileId: carla, name: "Carla Pons" },
      ],
    });
  });

  it("Hoy recibe quién entrena y marca las sesiones de quien mira", async () => {
    await setSession(ownerA, futureS1b, [bea], sorted(ana, carla), "reinforcement");
    const summaries = await getSessionCoachSummaries(db, {
      organizationId: a.organizationId,
      viewerMemberId: coachAna.memberId,
      sessionIds: [futureS1a, futureS1b, futureS2],
    });
    expect(summaries?.get(futureS1a)).toEqual({ coachNames: ["Carla Pons", "Ana Ruiz"].sort(), substitution: false, assignedToViewer: true });
    expect(summaries?.get(futureS1b)).toEqual({ coachNames: ["Bea Gil"], substitution: true, assignedToViewer: false });
    expect(summaries?.get(futureS2)).toEqual({ coachNames: [], substitution: false, assignedToViewer: false });
  });

  it("aísla las academias: B no lee ni escribe en A y no puede asignar fichas de A", async () => {
    const before = {
      titulars: await count("class_template_staff", a.organizationId),
      staff: await count("session_staff", a.organizationId),
      overrides: await count("session_staff_overrides", a.organizationId),
    };
    // Miembro de B con la academia de A: no es miembro.
    await expect(getClassCoaches({ actor: ownerB, classTemplateId: classS1, query: s1() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setClass(ownerB, classS1, [], [ana, carla])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setSession(ownerB, futureS1a, [], [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Miembro de B con su academia y una clase o sesión de A: no existe.
    await expect(getClassCoaches({ actor: ownerB, classTemplateId: classS1, query: scopeB() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setSession(ownerB, futureS1a, [zoe], [], null, scopeB())).rejects.toMatchObject({ code: "NOT_FOUND" });
    // B no asigna fichas de A en su clase ni A fichas de B.
    await expect(setClass(ownerB, classB, [ana], [], scopeB())).rejects.toMatchObject({ code: "INVALID_RELATION" });
    await expect(setClass(ownerA, classS1, [ana, carla, zoe], sorted(ana, carla))).rejects.toMatchObject({ code: "INVALID_RELATION" });
    // Dirección de A con una sede de B: la clase no está en esa sede.
    await expect(
      getClassCoaches({ actor: ownerA, classTemplateId: classS1, query: { organizationId: a.organizationId, locationId: b.locationIds[0]! } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Hoy de B con sesiones de A no devuelve nada de A.
    const leaked = await getSessionCoachSummaries(db, {
      organizationId: b.organizationId,
      viewerMemberId: ownerB.memberId,
      sessionIds: [futureS1a, futureS1b],
    });
    expect(leaked?.size).toBe(0);
    expect(await getClassTitularsByClass(db, { organizationId: b.organizationId, classTemplateIds: [classS1] })).toEqual({});

    // B gestiona su propia clase sin ver nada de A.
    const own = await setClass(ownerB, classB, [zoe], [], scopeB());
    expect(own.titulars.map((coach) => coach.name)).toEqual(["Zoe Lara"]);
    expect(own.eligible.map((coach) => coach.name)).toEqual(["Zoe Lara"]);
    expect(await sessionStaffIds(futureB)).toEqual([zoe]);

    expect(await count("class_template_staff", a.organizationId)).toBe(before.titulars);
    expect(await count("session_staff", a.organizationId)).toBe(before.staff);
    expect(await count("session_staff_overrides", a.organizationId)).toBe(before.overrides);
  });

  it("en solo lectura del plan se puede leer y repetir, pero no asignar ni sustituir", async () => {
    const clientRequestId = randomUUID();
    const current = sorted(ana, carla);
    const beforeBlock = await setClass(ownerA, classS2, [dani], [], s2(), clientRequestId);
    expect(beforeBlock.replayed).toBe(false);

    await db.execute(sql`
      with new_people as (
        insert into zaltyko.people (organization_id, given_name, family_name)
        select ${a.organizationId}::uuid, 'Capacidad sintética', series.n::text
        from generate_series(1, 31) as series(n)
        returning id
      )
      insert into zaltyko.athletes (organization_id, person_id)
      select ${a.organizationId}::uuid, new_people.id from new_people
    `);
    const usage = await db.transaction((tx) => getOrganizationUsage(tx, a.organizationId));
    expect(usage.readOnly).toBe(true);
    const before = {
      titulars: await count("class_template_staff", a.organizationId),
      staff: await count("session_staff", a.organizationId),
      overrides: await count("session_staff_overrides", a.organizationId),
    };

    expect((await getClassCoaches({ actor: ownerA, classTemplateId: classS1, query: s1() })).titulars).toHaveLength(2);
    expect((await getSessionCoaches({ actor: coachAna, sessionId: futureS1a, query: s1() })).coaches).toHaveLength(2);
    expect(await setClass(ownerA, classS2, [dani], [], s2(), clientRequestId)).toMatchObject({ replayed: true });
    await expect(setClass(ownerA, classS1, [ana], current)).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
    await expect(setSession(ownerA, futureS1a, [ana], current, "absence")).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
    await expect(setSession(managerS1, futureS1a, [bea], current)).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });

    expect(await count("class_template_staff", a.organizationId)).toBe(before.titulars);
    expect(await count("session_staff", a.organizationId)).toBe(before.staff);
    expect(await count("session_staff_overrides", a.organizationId)).toBe(before.overrides);
  }, 60_000);
});
