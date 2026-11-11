import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Solo para la prueba de ciclo con Pasar lista, que llama a las rutas reales:
// la identidad sale de una cabecera de la propia prueba y el límite de
// peticiones no interviene. Los servicios y la base de datos son los reales.
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async (request: Request) => {
    const id = request.headers.get("x-ci-user");
    return id ? { id } : null;
  },
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: async () => ({ success: true, limit: 1000, remaining: 999, reset: Math.floor(Date.now() / 1000) + 60 }),
}));

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
  expect(raised?.message).toMatch(/^Coach assignment candidate requires .*; inspect existing schema before promotion$/);
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

/**
 * Inicio a las 16:30 UTC dentro de `days` días. Las sesiones futuras de las
 * pruebas quedan dentro del horizonte que recorre la propagación (hoy + 120
 * días), sea cual sea la fecha del CI.
 */
function inDays(days: number): string {
  const value = new Date(Date.now() + days * 86_400_000);
  value.setUTCHours(16, 30, 0, 0);
  return value.toISOString();
}

/** Espera a que `expected` conexiones estén bloqueadas esperando un cerrojo. */
async function waitForLockWaiters(expected: number) {
  const deadline = Date.now() + 15_000;
  let waiting = 0;
  while (Date.now() < deadline) {
    const result = await db.execute(sql`
      select count(*)::int as waiting
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and wait_event_type = 'Lock'
    `);
    waiting = Number((result.rows[0] as { waiting?: number } | undefined)?.waiting ?? 0);
    if (waiting >= expected) return waiting;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Only ${waiting} of ${expected} operations reached the lock`);
}

async function hasMarker(sessionId: string) {
  const result = await db.execute(sql`
    select count(*)::int as count from zaltyko.session_staff_overrides where session_id = ${sessionId}::uuid
  `);
  return Number((result.rows[0] as { count: number }).count) > 0;
}

/** Abre una transacción que retiene un cerrojo hasta que se llame a release(). */
function holdLock(work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markHeld!: () => void;
  const held = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const done = db.transaction(async (tx) => {
    await work(tx);
    markHeld();
    await released;
  });
  return { held, release, done };
}

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
    futureS1a = await session(a.organizationId, a.locationIds[0]!, classS1, inDays(10));
    futureS1b = await session(a.organizationId, a.locationIds[0]!, classS1, inDays(17));
    cancelledS1 = await session(a.organizationId, a.locationIds[0]!, classS1, inDays(24), "cancelled");
    futureS2 = await session(a.organizationId, a.locationIds[1]!, classS2, inDays(11));
    futureB = await session(b.organizationId, b.locationIds[0]!, classB, inDays(10));

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
    // Deja la base compartida como estaba, en una sola transacción: si un paso
    // falla, se deshace todo y el error se ve (no queda session_staff sin FK
    // ni sin GRANT). El candidato retira el GRANT y pasa la FK a CASCADE.
    await db.transaction(async (tx) => {
      await tx.execute(sql`drop table if exists zaltyko.session_staff_overrides`);
      await tx.execute(sql`drop table if exists zaltyko.class_template_staff`);
      await tx.execute(sql`grant select on table zaltyko.session_staff to authenticated`);
      await tx.execute(sql`alter table zaltyko.session_staff drop constraint if exists session_staff_profile_fk`);
      await tx.execute(sql`
        alter table zaltyko.session_staff add constraint session_staff_profile_fk
          foreign key (organization_id, staff_profile_id) references zaltyko.staff_profiles (organization_id, id) on delete restrict
      `);
    });
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
    // session_staff pasa a tener datos: el candidato retira el acceso directo.
    const sessionStaff = await db.execute(sql`
      select has_table_privilege('authenticated', 'zaltyko.session_staff', 'SELECT') as authenticated_select,
             has_table_privilege('anon', 'zaltyko.session_staff', 'SELECT') as anon_select
    `);
    expect(sessionStaff.rows[0]).toEqual({ authenticated_select: false, anon_select: false });
    const profileFk = await db.execute(sql`
      select confdeltype::text as action from pg_constraint
      where conname = 'session_staff_profile_fk' and conrelid = 'zaltyko.session_staff'::regclass
    `);
    expect(profileFk.rows).toEqual([{ action: "c" }]);
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
    // La coordinación de S1 no gestiona S2, y una clase de S2 responde igual
    // que una inexistente (sin oráculo de existencia).
    await expect(setClass(managerS1, classS2, [carla], [], s2())).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(
      getClassCoaches({ actor: managerS1, classTemplateId: classS2, query: { organizationId: a.organizationId } })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(
      getClassCoaches({ actor: managerS1, classTemplateId: randomUUID(), query: { organizationId: a.organizationId } })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
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
    expect(audit[0]!.after).toEqual({ staffProfileIds: [ana], updatedSessionCount: 2, clearedSubstitutionCount: 0 });
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
    // Ve que hay sustitución, pero no el motivo; la dirección sí.
    const substitutedAsCoach = await getSessionCoaches({ actor: coachAna, sessionId: futureS1a, query: s1() });
    expect(substitutedAsCoach.assignedToViewer).toBe(false);
    expect(substitutedAsCoach.substitution).toMatchObject({ reason: null });
    expect((await getSessionCoaches({ actor: ownerA, sessionId: futureS1a, query: s1() })).substitution).toMatchObject({
      reason: "absence",
    });
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

  it("una fila previa con otro rol pasa a 'coach' al asignarla, sin duplicarse", async () => {
    await db.execute(sql`
      insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id, assignment_role)
      values (${a.organizationId}::uuid, ${futureS2}::uuid, ${carla}::uuid, 'assistant')
    `);
    // Una fila que no es de entrenadora no cuenta como asignada.
    expect((await getSessionCoaches({ actor: ownerA, sessionId: futureS2, query: s2() })).coaches).toEqual([]);
    const result = await setSession(ownerA, futureS2, [carla], [], null, s2());
    expect(result.coaches.map((coach) => coach.name)).toEqual(["Carla Pons"]);
    const rows = await db.execute(sql`
      select assignment_role from zaltyko.session_staff
      where session_id = ${futureS2}::uuid and staff_profile_id = ${carla}::uuid
    `);
    expect(rows.rows).toEqual([{ assignment_role: "coach" }]);
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

  describe("concurrencia y borrados (academia C)", () => {
    let c: Awaited<ReturnType<typeof academy>>;
    let ownerC: Actor;
    let managerC: Actor;
    let xavi: string;
    let yago: string;
    let zara: string;
    let classK: string;
    let sessionK1: string;
    let sessionK2: string;
    const sc = () => ({ organizationId: c.organizationId, locationId: c.locationIds[0]! });

    beforeAll(async () => {
      c = await academy("C", 1);
      ownerC = await member(c.organizationId, "owner", "all");
      managerC = await member(c.organizationId, "manager", "all", [], "manager-c");
      xavi = await staffProfile(c.organizationId, "Xavi", "Abad", (await member(c.organizationId, "coach", "all", [], "xavi")).memberId);
      yago = await staffProfile(c.organizationId, "Yago", "Benet", (await member(c.organizationId, "coach", "all", [], "yago")).memberId);
      zara = await staffProfile(c.organizationId, "Zara", "Cano", (await member(c.organizationId, "coach", "all", [], "zara")).memberId);
      classK = await classTemplate(c.organizationId, c.locationIds[0]!, "CI Competición");
      sessionK1 = await session(c.organizationId, c.locationIds[0]!, classK, inDays(30));
      sessionK2 = await session(c.organizationId, c.locationIds[0]!, classK, inDays(37));
      await setClass(ownerC, classK, [xavi], [], sc());
    }, 60_000);

    it("una sustitución que se confirma mientras el cambio de titulares espera el bloqueo no se pisa", async () => {
      // Otro escritor sustituye K1 y retiene la fila de la sesión.
      const holder = holdLock(async (tx) => {
        await tx.execute(sql`select id from zaltyko.sessions where id = ${sessionK1}::uuid for update`);
        await tx.execute(sql`delete from zaltyko.session_staff where session_id = ${sessionK1}::uuid and assignment_role = 'coach'`);
        await tx.execute(sql`
          insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id, assignment_role)
          values (${c.organizationId}::uuid, ${sessionK1}::uuid, ${yago}::uuid, 'coach')
        `);
        await tx.execute(sql`
          insert into zaltyko.session_staff_overrides (organization_id, session_id, reason, changed_by_member_id)
          values (${c.organizationId}::uuid, ${sessionK1}::uuid, 'absence', ${ownerC.memberId}::uuid)
        `);
      });
      await holder.held;
      const change = setClass(ownerC, classK, [zara], [xavi], sc()).then(
        (value) => value,
        (caught: unknown) => caught
      );
      try {
        // El cambio de titulares está bloqueado en la fila de K1.
        expect(await waitForLockWaiters(1)).toBe(1);
      } finally {
        holder.release();
      }
      await holder.done;
      const result = await change;
      expect(result).toMatchObject({ updatedSessionCount: 1, clearedSubstitutionCount: 0, replayed: false });
      // K1 conserva la sustitución confirmada; solo K2 pasa a las nuevas titulares.
      expect(await sessionStaffIds(sessionK1)).toEqual([yago]);
      expect(await hasMarker(sessionK1)).toBe(true);
      expect(await sessionStaffIds(sessionK2)).toEqual([zara]);
      expect(await hasMarker(sessionK2)).toBe(false);
    }, 60_000);

    it("sustitución y cambio de titulares de la misma clase se serializan en la plantilla, y la marca se quita si ya coincide", async () => {
      // Un tercero retiene el cerrojo de la plantilla (como una generación de sesiones).
      const holder = holdLock(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${c.organizationId}:sessions:${classK}`}, 0))`
        );
      });
      await holder.held;
      const substitution = setSession(ownerC, sessionK2, [xavi], [zara], "reinforcement", sc()).then(
        (value) => value,
        (caught: unknown) => caught
      );
      let titularChange: Promise<unknown> | undefined;
      try {
        // La sustitución llega primero a la plantilla.
        expect(await waitForLockWaiters(1)).toBe(1);
        titularChange = setClass(managerC, classK, [xavi], [zara], sc()).then(
          (value) => value,
          (caught: unknown) => caught
        );
        // El cambio de titulares espera detrás (en la academia o en la plantilla).
        expect(await waitForLockWaiters(2)).toBe(2);
      } finally {
        holder.release();
      }
      await holder.done;
      expect(await substitution).toMatchObject({ replayed: false, substitution: { reason: "reinforcement" } });
      // Las nuevas titulares coinciden con K2: deja de estar en sustitución.
      expect(await titularChange).toMatchObject({ updatedSessionCount: 0, clearedSubstitutionCount: 1 });
      expect(await sessionStaffIds(sessionK2)).toEqual([xavi]);
      expect(await hasMarker(sessionK2)).toBe(false);
      // K1 sigue sustituida (Yago no es titular).
      expect(await sessionStaffIds(sessionK1)).toEqual([yago]);
      expect(await hasMarker(sessionK1)).toBe(true);
    }, 60_000);

    it("el mismo clientRequestId por las dos rutas no interbloquea: la segunda recibe 409", async () => {
      const clientRequestId = randomUUID();
      const results = await Promise.allSettled([
        setClass(ownerC, classK, [xavi, yago], [xavi], sc(), clientRequestId),
        setSession(ownerC, sessionK2, [yago], [xavi], "other", sc(), clientRequestId),
      ]);
      const rejected = results.filter((item) => item.status === "rejected") as PromiseRejectedResult[];
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    }, 60_000);

    it("borrar el miembro que asignó o sustituyó, o una ficha titular sin sesiones, no queda bloqueado", async () => {
      const classK2 = await classTemplate(c.organizationId, c.locationIds[0]!, "CI Sin sesiones");
      const walo = await staffProfile(c.organizationId, "Walo", "Duran", (await member(c.organizationId, "coach", "all", [], "walo")).memberId);
      await setClass(managerC, classK2, [walo], [], sc());
      const current = await sessionStaffIds(sessionK1);
      await setSession(managerC, sessionK1, [zara], current, "absence", sc());

      // Lo mismo que hace la cascada al borrar su usuario de Auth.
      await db.execute(sql`delete from zaltyko.organization_members where id = ${managerC.memberId}::uuid`);
      const assigned = await db.execute(sql`
        select assigned_by_member_id from zaltyko.class_template_staff where class_template_id = ${classK2}::uuid
      `);
      expect(assigned.rows).toEqual([{ assigned_by_member_id: null }]);
      const view = await getSessionCoaches({ actor: ownerC, sessionId: sessionK1, query: sc() });
      expect(view.substitution).toMatchObject({ reason: "absence", changedByName: "Equipo" });

      // La ficha titular de una clase sin sesiones se borra y su asignación con ella.
      await db.execute(sql`delete from zaltyko.staff_profiles where id = ${walo}::uuid`);
      expect(await getClassTitularsByClass(db, { organizationId: c.organizationId, classTemplateIds: [classK2] })).toEqual({});

      // También la de una titular con sesiones heredadas: session_staff_profile_fk
      // pasa a CASCADE con el candidato.
      const classK3 = await classTemplate(c.organizationId, c.locationIds[0]!, "CI Con sesiones");
      const sessionK3 = await session(c.organizationId, c.locationIds[0]!, classK3, inDays(12));
      const vera = await staffProfile(c.organizationId, "Vera", "Gómez", (await member(c.organizationId, "coach", "all", [], "vera")).memberId);
      expect((await setClass(ownerC, classK3, [vera], [], sc())).updatedSessionCount).toBe(1);
      expect(await sessionStaffIds(sessionK3)).toEqual([vera]);
      await db.execute(sql`delete from zaltyko.staff_profiles where id = ${vera}::uuid`);
      expect(await sessionStaffIds(sessionK3)).toEqual([]);
      expect(await getClassTitularsByClass(db, { organizationId: c.organizationId, classTemplateIds: [classK3] })).toEqual({});
    }, 60_000);
  });

  describe("Pasar lista y sustitución a la vez (academia D)", () => {
    let d: Awaited<ReturnType<typeof academy>>;
    let ownerD: Actor;
    let coachD: Actor;
    let lia: string;
    let mar: string;
    let sessionD: string;
    let enrollmentD: string;
    let classD: string;
    const sd = () => ({ organizationId: d.organizationId, locationId: d.locationIds[0]! });

    beforeAll(async () => {
      d = await academy("D", 1);
      ownerD = await member(d.organizationId, "owner", "all");
      coachD = await member(d.organizationId, "coach", "selected", [d.locationIds[0]!], "lia");
      lia = await staffProfile(d.organizationId, "Lía", "Ferrer", coachD.memberId);
      mar = await staffProfile(d.organizationId, "Mar", "Iglesias", (await member(d.organizationId, "coach", "all", [], "mar")).memberId);
      classD = await classTemplate(d.organizationId, d.locationIds[0]!, "CI Pasar lista");
      sessionD = await session(d.organizationId, d.locationIds[0]!, classD, inDays(5));
      const athleteId = randomUUID();
      await db.execute(sql`
        insert into zaltyko.people (id, organization_id, given_name, family_name)
        values (${athleteId}::uuid, ${d.organizationId}::uuid, 'Nora', 'Pasa Lista')
      `);
      await db.execute(sql`
        insert into zaltyko.athletes (id, organization_id, person_id, is_active)
        values (${athleteId}::uuid, ${d.organizationId}::uuid, ${athleteId}::uuid, true)
      `);
      enrollmentD = randomUUID();
      await db.execute(sql`
        insert into zaltyko.enrollments (id, organization_id, location_id, athlete_id, class_template_id, status, starts_on, source)
        values (${enrollmentD}::uuid, ${d.organizationId}::uuid, ${d.locationIds[0]}::uuid, ${athleteId}::uuid, ${classD}::uuid,
          'active', '2026-09-01', 'owner')
      `);
      await setClass(ownerD, classD, [lia], [], sd());
    }, 60_000);

    function attendanceRequest(idempotencyKey: string) {
      return new Request(`https://zaltyko.test/api/v1/owner/sessions/${sessionD}/attendance`, {
        method: "POST",
        headers: {
          origin: "https://zaltyko.test",
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-ci-user": coachD.userId,
        },
        body: JSON.stringify({ ...sd(), enrollmentId: enrollmentD, status: "present" }),
      });
    }

    function substitutionRequest(clientRequestId: string) {
      return new Request(`https://zaltyko.test/api/v1/owner/sessions/${sessionD}/coaches`, {
        method: "PUT",
        headers: { origin: "https://zaltyko.test", "content-type": "application/json", "x-ci-user": ownerD.userId },
        body: JSON.stringify({
          ...sd(),
          clientRequestId,
          staffProfileIds: [mar],
          expectedStaffProfileIds: [lia],
          reason: "absence",
        }),
      });
    }

    it("con esperas cruzadas sesión ↔ academia no hay 500, como mucho un 409 reintentable, y al reintentar se aplican las dos", async () => {
      const { POST: recordAttendanceRoute } = await import("@/app/api/v1/owner/sessions/[sessionId]/attendance/route");
      const { PUT: substituteRoute } = await import("@/app/api/v1/owner/sessions/[sessionId]/coaches/route");
      const params = { params: Promise.resolve({ sessionId: sessionD }) };
      const attendanceKey = `ci-cycle-${randomUUID()}`;
      const clientRequestId = randomUUID();

      // Determinista: un tercero retiene el cerrojo de la plantilla. La
      // sustitución toma la fila de la academia y espera en la plantilla; Pasar
      // lista bloquea la sesión y espera a la academia, que ya tiene la
      // sustitución. Al liberar la plantilla, la sustitución pide la sesión y el
      // ciclo sesión ↔ academia es seguro: PostgreSQL aborta a una de las dos
      // (cualquiera puede ser la víctima).
      const holder = holdLock(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${d.organizationId}:sessions:${classD}`}, 0))`
        );
      });
      await holder.held;
      const substitution = substituteRoute(substitutionRequest(clientRequestId), params);
      let attendance: Promise<Response> | undefined;
      try {
        // La sustitución ya tiene la academia y espera en la plantilla.
        expect(await waitForLockWaiters(1)).toBe(1);
        attendance = recordAttendanceRoute(attendanceRequest(attendanceKey), params);
        // Pasar lista tiene la sesión y espera a la academia: dos esperas
        // cruzadas a la vez, observadas en pg_stat_activity.
        expect(await waitForLockWaiters(2)).toBe(2);
      } finally {
        holder.release();
      }
      await holder.done;
      // Si cualquiera de las dos rutas lanzara (500), estas promesas fallarían.
      const [first, second] = await Promise.all([substitution, attendance!]);
      const statuses = [first.status, second.status];
      // Si PostgreSQL llega a detectar el interbloqueo, aborta una de las dos
      // (cualquiera puede ser la víctima) y esa responde 409 reintentable. En
      // el CI no siempre se produce: el orden en que se despiertan las esperas
      // no está garantizado. La prueba es correcta en cualquier orden: nunca
      // 500, como mucho un 409 y, tras reintentar, las dos aplicadas.
      expect(statuses.filter((status) => status === 409).length).toBeLessThanOrEqual(1);
      for (const response of [first, second]) {
        expect([200, 201, 409]).toContain(response.status);
        if (response.status === 409) {
          expect(await response.json()).toMatchObject({
            type: "https://zaltyko.com/problems/version-conflict",
            errors: { retryable: true },
          });
        }
      }

      // Reintento de la abortada con la misma clave.
      if (first.status === 409) expect((await substituteRoute(substitutionRequest(clientRequestId), params)).status).toBe(200);
      if (second.status === 409) expect((await recordAttendanceRoute(attendanceRequest(attendanceKey), params)).status).toBe(201);

      // Las dos quedan aplicadas.
      const recorded = await db.execute(sql`
        select status::text as status from zaltyko.attendance_records
        where session_id = ${sessionD}::uuid and enrollment_id = ${enrollmentD}::uuid
      `);
      expect(recorded.rows).toEqual([{ status: "present" }]);
      expect(await sessionStaffIds(sessionD)).toEqual([mar]);
      expect(await hasMarker(sessionD)).toBe(true);
    }, 60_000);

    it("la propagación llega al último día del horizonte con un día de margen por zona horaria", async () => {
      const at = (milliseconds: number) => new Date(Date.now() + milliseconds).toISOString();
      const day = 86_400_000;
      // Tarde del último día en una sede al oeste de UTC: ya es el día 121 en UTC.
      const edge = await session(d.organizationId, d.locationIds[0]!, classD, at(120 * day + 20 * 3_600_000));
      // Más allá del horizonte y del margen: nunca se genera, no se bloquea.
      const beyond = await session(d.organizationId, d.locationIds[0]!, classD, at(123 * day));
      const result = await setClass(ownerD, classD, [mar], [lia], sd());
      expect(await sessionStaffIds(edge)).toEqual([mar]);
      expect(await sessionStaffIds(beyond)).toEqual([]);
      // sessionD estaba sustituida con Mar: coincide con las nuevas titulares y deja de estarlo.
      expect(result).toMatchObject({ updatedSessionCount: 1, clearedSubstitutionCount: 1 });
      expect(await hasMarker(sessionD)).toBe(false);
    }, 60_000);
  });
});
