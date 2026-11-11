import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  changeAthleteObjectiveStatus,
  createAthleteObjective,
} from "@/modules/athlete-progress/application/athlete-progress-service";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";
import {
  getClassPlanTemplate,
  getSessionPlan,
  isSessionPlanStorageAvailable,
  markSessionPlanBlock,
  saveClassPlanTemplate,
  saveSessionPlan,
} from "@/modules/session-plans/application/session-plan-service";

/**
 * P2 #17 (segunda parte) · Planificación sobre sesiones en PostgreSQL
 * desechable de GitHub. Instala los candidatos de objetivos y de planificación
 * solo aquí, después de todos los guardas, y borra sus tablas al terminar;
 * nunca en un proyecto enlazado ni con credenciales externas. Cubre:
 * funcionalidad dormida, dependencia del candidato de objetivos, RLS/REVOKE,
 * aislamiento entre academias, entrenador sin la sede, copia de la plantilla
 * sin efectos en otras sesiones, marca de bloque idempotente, vínculos solo
 * con objetivos de gimnastas de la sesión y bloqueo en solo lectura del plan.
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

const candidateFile = (name: string) =>
  readFileSync(resolve(process.cwd(), `docs/deployment/candidates/${name}`), "utf8");
const progressCandidate = () => candidateFile("20261111120000_athlete_progress_candidate.sql");
const plansCandidate = () => candidateFile("20261111200000_session_plans_candidate.sql");

async function failure(promise: Promise<unknown>) {
  return (await promise.then(
    () => null,
    (error) => error
  )) as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
}

async function expectPgCode(promise: Promise<unknown>, code: string) {
  const error = await failure(promise);
  expect(error).not.toBeNull();
  expect(error?.cause?.code ?? error?.code).toBe(code);
}

async function expectCandidateRefused(promise: Promise<unknown>, message: RegExp) {
  // Drizzle envuelve el error; el raise del preflight está en cause (P0001).
  const error = await failure(promise);
  expect(error).not.toBeNull();
  const raised = error?.cause ?? error;
  expect(raised?.code).toBe("P0001");
  expect(raised?.message).toMatch(message);
}

type Actor = { userId: string; memberId: string };
type Scope = { organizationId: string; locationId: string };

async function member(
  organizationId: string,
  role: "owner" | "admin" | "manager" | "coach",
  scopeMode: "all" | "selected",
  locationIds: string[] = [],
  label: string = role
): Promise<Actor> {
  const userId = randomUUID();
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-plan-${label}-${userId}@example.invalid`})`
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
    values (${organizationId}::uuid, ${`CI plan ${label}`}, 'active')
  `);
  const locationIds: string[] = [];
  for (let index = 0; index < sites; index += 1) {
    const locationId = randomUUID();
    locationIds.push(locationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
      values (${locationId}::uuid, ${organizationId}::uuid,
        ${`ci-plan-${index}-${organizationId.slice(0, 8)}`}, ${`Sede ${label} ${index + 1}`}, 'Europe/Madrid', true)
    `);
  }
  return { organizationId, locationIds };
}

async function athlete(organizationId: string, givenName: string) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (${id}::uuid, ${organizationId}::uuid, ${givenName}, 'Plan')
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id, is_active)
    values (${id}::uuid, ${organizationId}::uuid, ${id}::uuid, true)
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

async function joinGroup(organizationId: string, groupId: string, athleteId: string) {
  await db.execute(sql`
    insert into zaltyko.group_memberships (organization_id, group_id, athlete_id, status, starts_on)
    values (${organizationId}::uuid, ${groupId}::uuid, ${athleteId}::uuid, 'active', '2026-09-01')
  `);
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
  status: "scheduled" | "completed" | "cancelled" = "completed"
) {
  const id = randomUUID();
  const ends = new Date(new Date(startsAt).getTime() + 90 * 60_000).toISOString();
  await db.execute(sql`
    insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${classTemplateId}::uuid, ${status},
      ${startsAt}::timestamptz, ${ends}::timestamptz)
  `);
  return id;
}

async function count(table: string, organizationId: string) {
  const result = await db.execute(
    sql`select count(*)::int as count from ${sql.identifier("zaltyko")}.${sql.identifier(table)} where organization_id = ${organizationId}::uuid`
  );
  return Number((result.rows[0] as { count: number }).count);
}

/**
 * Espera a que `count` conexiones estén bloqueadas detrás de `holderPid`,
 * directa o indirectamente (en cola detrás de otra que espera).
 */
async function waitForLockWaiters(holderPid: number, count: number) {
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const result = await db.execute(sql`with direct as (
        select pid from pg_stat_activity where ${holderPid}::int = any(pg_blocking_pids(pid))
      ), queued as (
        select pid from pg_stat_activity
        where pg_blocking_pids(pid) && (select coalesce(array_agg(pid), '{}'::int[]) from direct)
      )
      select count(distinct pid)::int as waiting from (select pid from direct union select pid from queued) waiters`);
    if (Number((result.rows[0] as { waiting: number }).waiting) >= count) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("The session plan writers did not queue behind the held lock");
}

/**
 * Retiene el mismo cerrojo consultivo que lockCommand toma para el guion de
 * una sesión, hasta que se llama a release().
 */
async function holdPlanLock(organizationId: string, sessionId: string) {
  let locked!: (pid: number) => void;
  let release!: () => void;
  const lockedSignal = new Promise<number>((resolveLocked) => {
    locked = resolveLocked;
  });
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const holder = db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:command:session-plan:${sessionId}`}, 0))`
    );
    const pid = await tx.execute(sql`select pg_backend_pid()::int as pid`);
    locked(Number((pid.rows[0] as { pid: number }).pid));
    await gate;
  });
  return { pid: await lockedSignal, release, holder };
}

const TABLES = ["session_plans", "session_plan_blocks", "session_plan_objectives", "class_plan_templates"];

describe.skipIf(!disposablePgEnabled)("planificación sobre sesiones en PostgreSQL desechable", () => {
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let ownerA: Actor;
  let managerA1: Actor;
  let coachA1: Actor;
  let coachA2: Actor;
  let ownerB: Actor;
  // Ana: inscrita en la clase de S1. Dani: grupo de esa clase en S1 y grupo en
  // S2. Bea: solo S2. Zoe: academia B.
  let ana: string;
  let dani: string;
  let bea: string;
  let zoe: string;
  let classS1: string;
  let classB: string;
  let pastS1: string;
  let pastS1Second: string;
  let pastS1Third: string;
  let futureS1: string;
  let cancelledS1: string;
  let sessionS2: string;
  let sessionB: string;
  let objectiveAna: string;
  let objectiveDaniS2: string;
  let objectiveBea: string;
  let objectiveZoe: string;

  const s1 = (): Scope => ({ organizationId: a.organizationId, locationId: a.locationIds[0]! });
  const s2 = (): Scope => ({ organizationId: a.organizationId, locationId: a.locationIds[1]! });
  const sB = (): Scope => ({ organizationId: b.organizationId, locationId: b.locationIds[0]! });

  function create(actor: Actor, sessionId: string, scope: Scope, overrides: Record<string, unknown> = {}) {
    return saveSessionPlan({
      actor,
      sessionId,
      command: {
        ...scope,
        clientRequestId: randomUUID(),
        expectedRevision: null,
        focus: "Rondada",
        blocks: [
          { kind: "warmup", content: "Movilidad", durationMinutes: 10 },
          { kind: "technique", discipline: "gaf", apparatus: "floor", content: "Rondada flic", durationMinutes: 30 },
        ],
        ...overrides,
      },
    });
  }

  function read(actor: Actor, sessionId: string, scope: Scope) {
    return getSessionPlan({ actor, sessionId, query: scope });
  }

  beforeAll(async () => {
    assertDisposableTarget();
    a = await academy("A", 2);
    b = await academy("B", 1);
    ownerA = await member(a.organizationId, "owner", "all");
    managerA1 = await member(a.organizationId, "manager", "selected", [a.locationIds[0]!]);
    coachA1 = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "coach1");
    coachA2 = await member(a.organizationId, "coach", "selected", [a.locationIds[1]!], "coach2");
    ownerB = await member(b.organizationId, "owner", "all");

    ana = await athlete(a.organizationId, "Ana");
    dani = await athlete(a.organizationId, "Dani");
    bea = await athlete(a.organizationId, "Bea");
    zoe = await athlete(b.organizationId, "Zoe");
    classS1 = await classTemplate(a.organizationId, a.locationIds[0]!, "CI Base 3");
    const classS2 = await classTemplate(a.organizationId, a.locationIds[1]!, "CI Base 2");
    classB = await classTemplate(b.organizationId, b.locationIds[0]!, "CI Base B");

    const groupS1 = await group(a.organizationId, a.locationIds[0]!, "Base 3 GAF");
    const groupS2 = await group(a.organizationId, a.locationIds[1]!, "Base 2 GAF");
    const groupB = await group(b.organizationId, b.locationIds[0]!, "Base B");
    await joinGroup(a.organizationId, groupS1, dani);
    await joinGroup(a.organizationId, groupS2, dani);
    await joinGroup(a.organizationId, groupS2, bea);
    await joinGroup(b.organizationId, groupB, zoe);
    await db.execute(sql`
      insert into zaltyko.class_template_groups (organization_id, class_template_id, group_id)
      values (${a.organizationId}::uuid, ${classS1}::uuid, ${groupS1}::uuid),
             (${a.organizationId}::uuid, ${classS2}::uuid, ${groupS2}::uuid),
             (${b.organizationId}::uuid, ${classB}::uuid, ${groupB}::uuid)
    `);
    await db.execute(sql`
      insert into zaltyko.enrollments (id, organization_id, location_id, athlete_id, class_template_id, status, starts_on, source)
      values (${randomUUID()}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, ${ana}::uuid, ${classS1}::uuid,
        'active', '2026-09-01', 'owner')
    `);

    pastS1 = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-10-05T16:30:00Z");
    pastS1Second = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-10-12T16:30:00Z");
    pastS1Third = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-10-19T16:30:00Z");
    futureS1 = await session(a.organizationId, a.locationIds[0]!, classS1, "2030-01-10T16:30:00Z", "scheduled");
    cancelledS1 = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-10-26T16:30:00Z", "cancelled");
    sessionS2 = await session(a.organizationId, a.locationIds[1]!, classS2, "2026-10-05T16:30:00Z");
    sessionB = await session(b.organizationId, b.locationIds[0]!, classB, "2026-10-05T16:30:00Z");

    // Funcionalidad dormida: sin candidatos, todo responde 503 sin escribir.
    expect(await isSessionPlanStorageAvailable(db)).toBe(false);
    await expect(read(ownerA, pastS1, s1())).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
      details: { reason: "session_plans_unavailable" },
    });
    await expect(create(ownerA, pastS1, s1())).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    // Sin el candidato de objetivos, el de planificación se niega a instalarse.
    await expectCandidateRefused(
      db.execute(sql.raw(plansCandidate())),
      /^Session plans candidate requires zaltyko\.athlete_objectives/
    );
    await db.execute(sql.raw(progressCandidate()));
    // Y rechaza una relación parcial antes de tocar nada.
    await expectCandidateRefused(
      db.transaction(async (tx) => {
        await tx.execute(sql`create table zaltyko.class_plan_templates (id uuid)`);
        await tx.execute(sql.raw(plansCandidate()));
      }),
      /^Session plans candidate requires .* absent; inspect existing schema before promotion$/
    );
    expect(await isSessionPlanStorageAvailable(db)).toBe(false);
    await db.execute(sql.raw(plansCandidate()));

    const objective = async (athleteId: string, scope: Scope, actor = ownerA) =>
      (
        await createAthleteObjective({
          actor,
          athleteId,
          command: { ...scope, clientRequestId: randomUUID(), title: `Objetivo ${athleteId.slice(0, 4)}` },
        })
      ).id;
    objectiveAna = await objective(ana, s1());
    objectiveDaniS2 = await objective(dani, s2());
    objectiveBea = await objective(bea, s2());
    objectiveZoe = await objective(zoe, sB(), ownerB);
  }, 90_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    for (const table of ["session_plan_objectives", "session_plan_blocks", "session_plans", "class_plan_templates"]) {
      await db.execute(sql.raw(`drop table if exists zaltyko.${table}`));
    }
    await db.execute(sql`drop table if exists zaltyko.athlete_observations`);
    await db.execute(sql`drop table if exists zaltyko.athlete_objective_status_history`);
    await db.execute(sql`drop table if exists zaltyko.athlete_objectives`);
  });

  it("fuerza RLS, niega el acceso directo de anon/authenticated y rechaza reinstalar", async () => {
    expect(await isSessionPlanStorageAvailable(db)).toBe(true);
    const inventory = await db.execute(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c
      where c.oid in ('zaltyko.session_plans'::regclass, 'zaltyko.session_plan_blocks'::regclass,
                      'zaltyko.session_plan_objectives'::regclass, 'zaltyko.class_plan_templates'::regclass)
    `);
    expect(inventory.rows).toHaveLength(4);
    for (const row of inventory.rows) {
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, anon_access: false, authenticated_access: false });
    }
    for (const role of ["anon", "authenticated"]) {
      for (const table of TABLES) {
        await expectPgCode(
          db.transaction(async (tx) => {
            await tx.execute(sql.raw(`set local role ${role}`));
            await tx.execute(sql.raw(`select 1 from zaltyko.${table} limit 1`));
          }),
          "42501"
        );
      }
    }
    await expectCandidateRefused(db.execute(sql.raw(plansCandidate())), /absent; inspect existing schema before promotion$/);

    // Sin la unicidad de posición diferida la sección queda «no disponible».
    const rollback = new Error("rollback");
    const seen = await db
      .transaction(async (tx) => {
        await tx.execute(sql`alter table zaltyko.session_plan_blocks drop constraint session_plan_blocks_position_uq`);
        await tx.execute(sql`
          alter table zaltyko.session_plan_blocks
            add constraint session_plan_blocks_position_uq unique (organization_id, plan_id, position)
        `);
        expect(await isSessionPlanStorageAvailable(tx)).toBe(false);
        throw rollback;
      })
      .catch((error: unknown) => error);
    expect(seen).toBe(rollback);
    expect(await isSessionPlanStorageAvailable(db)).toBe(true);
  });

  it("el entrenador de la sede crea y lee el plan sin estar asignado a la sesión", async () => {
    const staff = await db.execute(
      sql`select count(*)::int as count from zaltyko.session_staff where session_id = ${pastS1}::uuid`
    );
    expect(Number((staff.rows[0] as { count: number }).count)).toBe(0);

    const created = await create(coachA1, pastS1, s1(), { objectiveIds: [objectiveAna] });
    expect(created).toMatchObject({ revision: 1, replayed: false });
    const view = await read(coachA1, pastS1, s1());
    expect(view.plan).toMatchObject({ id: created.id, revision: 1, focus: "Rondada" });
    expect(view.plan!.blocks.map((block) => [block.position, block.kind, block.done])).toEqual([
      [1, "warmup", false],
      [2, "technique", false],
    ]);
    expect(view.plan!.objectives).toEqual([
      expect.objectContaining({ objectiveId: objectiveAna, athleteId: ana, athleteName: "Ana Plan" }),
    ]);
    expect(view.canManageTemplate).toBe(false);
    expect(view.session).toMatchObject({ started: true, canMarkBlocks: true, cancelled: false });
    // Opciones: objetivos en curso de las gimnastas de la sesión que ve. El de
    // Dani se creó en S2 (fuera de su alcance) y el de Bea es de otra clase.
    expect(view.objectiveOptions.map((option) => option.objectiveId)).toEqual([objectiveAna]);
    // La dirección con todas las sedes también ve el de Dani.
    expect((await read(ownerA, pastS1, s1())).objectiveOptions.map((option) => option.objectiveId).sort()).toEqual(
      [objectiveAna, objectiveDaniS2].sort()
    );
  });

  it("aísla academias y sedes: otra academia y el entrenador sin la sede no leen ni escriben", async () => {
    // Otra academia con su propio alcance: la sesión no existe allí.
    await expect(read(ownerB, pastS1, sB())).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(create(ownerB, pastS1, sB())).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Otra academia pidiendo el alcance de A: no es miembro.
    await expect(read(ownerB, pastS1, s1())).rejects.toMatchObject({ status: 403 });
    // Entrenador de S2: S1 no está en su alcance; con su sede, la sesión no existe.
    await expect(read(coachA2, pastS1, s1())).rejects.toMatchObject({ status: 403 });
    await expect(read(coachA2, pastS1, s2())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      markSessionPlanBlock({ actor: coachA2, sessionId: pastS1, blockId: randomUUID(), command: { ...s2(), done: true } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // La plantilla de una clase de otra academia tampoco existe.
    await expect(
      getClassPlanTemplate({ actor: ownerA, classTemplateId: classB, query: s1() })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await count("session_plans", b.organizationId)).toBe(0);
    // Y la base rechaza un plan que mezcle academias aunque el servidor fallara.
    await expectPgCode(
      db.execute(sql`
        insert into zaltyko.session_plans (organization_id, location_id, session_id, client_request_id,
          last_request_id, created_by_member_id, updated_by_member_id)
        values (${b.organizationId}::uuid, ${b.locationIds[0]}::uuid, ${pastS1}::uuid, ${randomUUID()}::uuid,
          ${randomUUID()}::uuid, ${ownerB.memberId}::uuid, ${ownerB.memberId}::uuid)
      `),
      "23503"
    );
  });

  it("solo vincula objetivos de gimnastas de esa sesión, de esa academia y de sedes visibles", async () => {
    // Bea no participa en la sesión; Zoe es de otra academia; un id inventado no existe.
    for (const objectiveIds of [[objectiveBea], [objectiveZoe], [randomUUID()], [objectiveAna, objectiveBea]]) {
      await expect(create(ownerA, pastS1Second, s1(), { objectiveIds })).rejects.toMatchObject({
        code: "INVALID_RELATION",
        status: 422,
      });
    }
    // Dani participa (grupo de la clase), pero su objetivo se creó en S2:
    // la coordinadora de S1 no lo ve; la dirección con todas las sedes, sí.
    await expect(create(managerA1, pastS1Second, s1(), { objectiveIds: [objectiveDaniS2] })).rejects.toMatchObject({
      code: "INVALID_RELATION",
    });
    expect(await count("session_plans", a.organizationId)).toBe(1);
    const created = await create(ownerA, pastS1Second, s1(), { objectiveIds: [objectiveDaniS2, objectiveAna] });
    const linked = await db.execute(
      sql`select objective_id from zaltyko.session_plan_objectives where plan_id = ${created.id}::uuid order by objective_id`
    );
    expect(linked.rows.map((row) => (row as { objective_id: string }).objective_id)).toEqual(
      [objectiveAna, objectiveDaniS2].sort()
    );
    // La coordinadora de S1 lee el plan sin ver el objetivo de la sede que no tiene.
    const managerView = await read(managerA1, pastS1Second, s1());
    expect(managerView.plan!.objectives.map((objective) => objective.objectiveId)).toEqual([objectiveAna]);
    // La FK compuesta impide vincular un objetivo de otra academia directamente.
    await expectPgCode(
      db.execute(sql`
        insert into zaltyko.session_plan_objectives (organization_id, plan_id, athlete_id, objective_id)
        values (${a.organizationId}::uuid, ${created.id}::uuid, ${zoe}::uuid, ${objectiveZoe}::uuid)
      `),
      "23503"
    );
  });

  it("el alta es idempotente y las ediciones exigen la última revisión", async () => {
    const clientRequestId = randomUUID();
    const command = { ...s1(), clientRequestId, expectedRevision: null, focus: "Barra", blocks: [] };
    const first = await saveSessionPlan({ actor: ownerA, sessionId: pastS1Third, command });
    expect(await saveSessionPlan({ actor: ownerA, sessionId: pastS1Third, command })).toEqual({ ...first, replayed: true });
    await expect(create(ownerA, pastS1Third, s1())).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    const updated = await saveSessionPlan({
      actor: coachA1,
      sessionId: pastS1Third,
      command: { ...s1(), clientRequestId: randomUUID(), expectedRevision: 1, focus: "Barra y salto", blocks: [] },
    });
    expect(updated).toEqual({ id: first.id, revision: 2, replayed: false });
    await expect(
      saveSessionPlan({
        actor: ownerA,
        sessionId: pastS1Third,
        command: { ...s1(), clientRequestId: randomUUID(), expectedRevision: 1, focus: "Tarde", blocks: [] },
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    // Una sesión cancelada no admite plan.
    await expect(create(ownerA, cancelledS1, s1())).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("marca un bloque de forma idempotente, solo desde que empieza la sesión, y editar conserva la marca", async () => {
    const view = await read(coachA1, pastS1, s1());
    const [warmup, technique] = view.plan!.blocks;
    const mark = (blockId: string, done: boolean, actor = coachA1) =>
      markSessionPlanBlock({ actor, sessionId: pastS1, blockId, command: { ...s1(), done } });

    expect(await mark(warmup!.id, true)).toEqual({ id: warmup!.id, done: true, replayed: false });
    const doneAt = await db.execute(sql`select done_at from zaltyko.session_plan_blocks where id = ${warmup!.id}::uuid`);
    expect(await mark(warmup!.id, true, ownerA)).toEqual({ id: warmup!.id, done: true, replayed: true });
    const doneAtAgain = await db.execute(sql`select done_at, done_by_member_id from zaltyko.session_plan_blocks where id = ${warmup!.id}::uuid`);
    expect((doneAtAgain.rows[0] as { done_at: unknown }).done_at).toEqual((doneAt.rows[0] as { done_at: unknown }).done_at);
    expect((doneAtAgain.rows[0] as { done_by_member_id: string }).done_by_member_id).toBe(coachA1.memberId);
    expect(await mark(technique!.id, false)).toEqual({ id: technique!.id, done: false, replayed: true });

    // Un bloque de otro plan no se alcanza desde esta sesión.
    const other = await read(ownerA, pastS1Second, s1());
    await expect(mark(other.plan!.blocks[0]!.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Editar: el bloque conservado mantiene su marca aunque cambie de posición.
    const edited = await saveSessionPlan({
      actor: coachA1,
      sessionId: pastS1,
      command: {
        ...s1(),
        clientRequestId: randomUUID(),
        expectedRevision: view.plan!.revision,
        focus: "Rondada",
        blocks: [
          { id: technique!.id, kind: "technique", discipline: "gaf", apparatus: "floor", content: "Rondada flic", durationMinutes: 30 },
          { id: warmup!.id, kind: "warmup", content: "Movilidad", durationMinutes: 10 },
          { kind: "cooldown", content: "Estiramientos" },
        ],
        objectiveIds: [objectiveAna],
      },
    });
    expect(edited.revision).toBe(view.plan!.revision + 1);
    const after = await read(coachA1, pastS1, s1());
    expect(after.plan!.blocks.map((block) => [block.id === warmup!.id, block.position, block.done])).toEqual([
      [false, 1, false],
      [true, 2, true],
      [false, 3, false],
    ]);
    // Marcar no cambia la revisión del plan.
    await mark(technique!.id, true);
    expect((await read(coachA1, pastS1, s1())).plan!.revision).toBe(edited.revision);
    await expect(
      saveSessionPlan({
        actor: coachA1,
        sessionId: pastS1,
        command: { ...s1(), clientRequestId: randomUUID(), expectedRevision: edited.revision, blocks: [{ id: randomUUID(), kind: "other", content: "x" }] },
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION" });

    // Sesión futura: se planifica, pero no se marca.
    await create(coachA1, futureS1, s1());
    const future = await read(coachA1, futureS1, s1());
    expect(future.session).toMatchObject({ started: false, canMarkBlocks: false });
    await expect(
      markSessionPlanBlock({ actor: coachA1, sessionId: futureS1, blockId: future.plan!.blocks[0]!.id, command: { ...s1(), done: true } })
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", status: 409 });
  });

  it("la plantilla es de la dirección y se copia: cambiarla no toca planes ya creados", async () => {
    const templateBlocks = [
      { kind: "warmup", content: "Carrera y movilidad", durationMinutes: 15 },
      { kind: "technique", discipline: "gr", apparatus: "hoop", content: "Lanzamientos", durationMinutes: 25 },
    ];
    await expect(
      saveClassPlanTemplate({ actor: coachA1, classTemplateId: classS1, command: { ...s1(), expectedRevision: null, blocks: templateBlocks } })
    ).rejects.toMatchObject({ status: 403 });
    await expect(getClassPlanTemplate({ actor: coachA1, classTemplateId: classS1, query: s1() })).rejects.toMatchObject({
      status: 403,
    });
    const template = await saveClassPlanTemplate({
      actor: managerA1,
      classTemplateId: classS1,
      command: { ...s1(), expectedRevision: null, focus: "Aro", blocks: templateBlocks },
    });
    expect(template).toMatchObject({ revision: 1, replayed: false });

    // Dos sesiones sin plan de la misma clase.
    const first = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-11-02T16:30:00Z");
    const second = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-11-09T16:30:00Z");
    const fromTemplate = (sessionId: string) =>
      saveSessionPlan({
        actor: coachA1,
        sessionId,
        command: { ...s1(), clientRequestId: randomUUID(), expectedRevision: null, source: "template" },
      });
    expect((await read(coachA1, first, s1())).template).toEqual({ exists: true, revision: 1 });
    await fromTemplate(first);
    const firstView = await read(coachA1, first, s1());
    expect(firstView.plan).toMatchObject({ focus: "Aro", fromTemplateRevision: 1 });
    expect(firstView.plan!.blocks.map((block) => block.content)).toEqual(["Carrera y movilidad", "Lanzamientos"]);

    // Cambiar la plantilla no toca el plan ya creado ni los de otras sesiones.
    const before = await read(coachA1, pastS1, s1());
    await saveClassPlanTemplate({
      actor: ownerA,
      classTemplateId: classS1,
      command: { ...s1(), expectedRevision: 1, focus: "Mazas", blocks: [{ kind: "technique", discipline: "gr", apparatus: "clubs", content: "Molinos" }] },
    });
    expect((await read(coachA1, first, s1())).plan).toEqual(firstView.plan);
    expect((await read(coachA1, pastS1, s1())).plan).toEqual(before.plan);
    await fromTemplate(second);
    expect((await read(coachA1, second, s1())).plan).toMatchObject({ focus: "Mazas", fromTemplateRevision: 2 });

    // Editar un plan copiado no toca la plantilla.
    await saveSessionPlan({
      actor: coachA1,
      sessionId: first,
      command: { ...s1(), clientRequestId: randomUUID(), expectedRevision: 1, focus: "Solo hoy", blocks: [] },
    });
    const stored = await getClassPlanTemplate({ actor: ownerA, classTemplateId: classS1, query: s1() });
    expect(stored.template).toMatchObject({ revision: 2, focus: "Mazas" });
    expect(stored.template!.blocks).toEqual([
      { kind: "technique", discipline: "gr", apparatus: "clubs", content: "Molinos", durationMinutes: null },
    ]);
    await expect(
      saveClassPlanTemplate({ actor: ownerA, classTemplateId: classS1, command: { ...s1(), expectedRevision: 1, blocks: [] } })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    // Una clase sin plantilla no se puede usar como origen.
    const otherClass = await classTemplate(a.organizationId, a.locationIds[0]!, "CI Iniciación");
    const otherSession = await session(a.organizationId, a.locationIds[0]!, otherClass, "2026-11-03T16:30:00Z");
    expect((await read(coachA1, otherSession, s1())).template).toEqual({ exists: false, revision: null });
    await expect(fromTemplate(otherSession)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await read(coachA1, otherSession, s1())).plan).toBeNull();
    // Y una sesión de otra sede no existe en esta.
    await expect(fromTemplate(sessionS2)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("conserva los vínculos que quien guarda no ve y solo valida los nuevos", async () => {
    // pastS1Second tiene vínculos a Ana (S1) y a Dani (creado en S2).
    const view = await read(managerA1, pastS1Second, s1());
    expect(view.plan!.objectives.map((objective) => objective.objectiveId)).toEqual([objectiveAna]);
    await saveSessionPlan({
      actor: managerA1,
      sessionId: pastS1Second,
      command: { ...s1(), clientRequestId: randomUUID(), expectedRevision: view.plan!.revision, focus: "Sin Ana", blocks: [], objectiveIds: [] },
    });
    const links = await db.execute(
      sql`select objective_id from zaltyko.session_plan_objectives where plan_id = ${view.plan!.id}::uuid`
    );
    // La coordinadora de S1 quitó el de Ana, que ve, pero no puede quitar el de S2.
    expect(links.rows.map((row) => (row as { objective_id: string }).objective_id)).toEqual([objectiveDaniS2]);
    expect((await read(ownerA, pastS1Second, s1())).plan!.objectives.map((objective) => objective.objectiveId)).toEqual([
      objectiveDaniS2,
    ]);

    // Un vínculo ya hecho se conserva aunque la gimnasta deje de participar o
    // el objetivo deje de estar en curso; uno nuevo exige ambas cosas.
    const lia = await athlete(a.organizationId, "Lía");
    const enrollmentLia = randomUUID();
    await db.execute(sql`
      insert into zaltyko.enrollments (id, organization_id, location_id, athlete_id, class_template_id, status, starts_on, source)
      values (${enrollmentLia}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, ${lia}::uuid, ${classS1}::uuid,
        'active', '2026-09-01', 'owner')
    `);
    const objectiveFor = async (athleteId: string, title: string) =>
      (await createAthleteObjective({ actor: ownerA, athleteId, command: { ...s1(), clientRequestId: randomUUID(), title } })).id;
    const liaFirst = await objectiveFor(lia, "Rondada");
    const liaSecond = await objectiveFor(lia, "Flic-flac");
    const anaAchieved = await objectiveFor(ana, "Vertical");
    await changeAthleteObjectiveStatus({
      actor: ownerA,
      athleteId: ana,
      objectiveId: anaAchieved,
      command: { ...s1(), expectedRevision: 1, status: "achieved" },
    });
    // Nuevo vínculo a un objetivo que no está en curso: rechazado.
    const liaSession = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-10-29T16:30:00Z");
    await expect(create(coachA1, liaSession, s1(), { objectiveIds: [anaAchieved] })).rejects.toMatchObject({
      code: "INVALID_RELATION",
      status: 422,
    });
    const created = await create(coachA1, liaSession, s1(), { objectiveIds: [liaFirst] });

    // Lía deja la clase antes de esa sesión y su objetivo se consigue.
    await db.execute(sql`update zaltyko.enrollments set ends_on = '2026-10-01' where id = ${enrollmentLia}::uuid`);
    await changeAthleteObjectiveStatus({
      actor: ownerA,
      athleteId: lia,
      objectiveId: liaFirst,
      command: { ...s1(), expectedRevision: 1, status: "achieved" },
    });
    const kept = await saveSessionPlan({
      actor: coachA1,
      sessionId: liaSession,
      command: { ...s1(), clientRequestId: randomUUID(), expectedRevision: 1, focus: "Rondada", blocks: [], objectiveIds: [liaFirst] },
    });
    expect(kept.revision).toBe(2);
    const keptView = await read(coachA1, liaSession, s1());
    expect(keptView.plan!.objectives).toEqual([
      expect.objectContaining({ objectiveId: liaFirst, status: "achieved", athleteName: "Gimnasta fuera de la sesión" }),
    ]);
    // Pero no se puede añadir otro objetivo suyo: ya no participa.
    await expect(
      saveSessionPlan({
        actor: coachA1,
        sessionId: liaSession,
        command: { ...s1(), clientRequestId: randomUUID(), expectedRevision: 2, blocks: [], objectiveIds: [liaFirst, liaSecond] },
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION" });
    expect(created.id).toBe(keptView.plan!.id);
  });

  it("idempotencia: el mismo clientRequestId en otra sesión es 409 y repetir una edición guardada es un reintento", async () => {
    const one = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-10-30T16:30:00Z");
    const two = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-10-31T16:30:00Z");
    const clientRequestId = randomUUID();
    const first = await create(ownerA, one, s1(), { clientRequestId });
    await expect(create(ownerA, two, s1(), { clientRequestId })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect((await read(ownerA, two, s1())).plan).toBeNull();
    // Mismo reintento de alta con otro contenido: conflicto, no reintento.
    await expect(create(ownerA, one, s1(), { clientRequestId, focus: "Otro foco" })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });

    const view = await read(ownerA, one, s1());
    const edit = {
      ...s1(),
      clientRequestId: randomUUID(),
      expectedRevision: first.revision,
      focus: "Rondada y flic",
      blocks: view.plan!.blocks.map((block) => ({
        id: block.id,
        kind: block.kind,
        discipline: block.discipline,
        apparatus: block.apparatus,
        content: block.content,
        durationMinutes: block.durationMinutes,
      })),
    };
    const saved = await saveSessionPlan({ actor: ownerA, sessionId: one, command: edit });
    expect(saved).toEqual({ id: first.id, revision: 2, replayed: false });
    expect(await saveSessionPlan({ actor: ownerA, sessionId: one, command: edit })).toEqual({ ...saved, replayed: true });
    await expect(
      saveSessionPlan({ actor: ownerA, sessionId: one, command: { ...edit, focus: "Distinto" } })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    // Otra petición con la revisión antigua sigue siendo un conflicto de revisión.
    await expect(
      saveSessionPlan({ actor: ownerA, sessionId: one, command: { ...edit, clientRequestId: randomUUID() } })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("carrera determinista: marcar un bloque y editar el guion a la vez no pierden la marca ni dan 404", async () => {
    const raced = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-11-01T16:30:00Z");
    await create(coachA1, raced, s1());
    const initial = await read(coachA1, raced, s1());
    const [warmup, technique] = initial.plan!.blocks;
    const editCommand = (expectedRevision: number) => ({
      ...s1(),
      clientRequestId: randomUUID(),
      expectedRevision,
      focus: "Reordenado",
      blocks: [
        { id: technique!.id, kind: "technique", discipline: "gaf", apparatus: "floor", content: "Rondada flic", durationMinutes: 30 },
        { id: warmup!.id, kind: "warmup", content: "Movilidad", durationMinutes: 10 },
      ],
    });

    // 1) La marca llega primero y la edición después, las dos en cola detrás
    //    del mismo cerrojo del guion.
    const firstLock = await holdPlanLock(a.organizationId, raced);
    const mark = markSessionPlanBlock({ actor: coachA1, sessionId: raced, blockId: warmup!.id, command: { ...s1(), done: true } });
    await waitForLockWaiters(firstLock.pid, 1);
    const edit = saveSessionPlan({ actor: ownerA, sessionId: raced, command: editCommand(initial.plan!.revision) });
    await waitForLockWaiters(firstLock.pid, 2);
    firstLock.release();
    await firstLock.holder;
    expect(await mark).toEqual({ id: warmup!.id, done: true, replayed: false });
    expect(await edit).toMatchObject({ revision: initial.plan!.revision + 1, replayed: false });
    const afterFirst = await read(coachA1, raced, s1());
    expect(afterFirst.plan!.blocks.map((block) => [block.id, block.position, block.done])).toEqual([
      [technique!.id, 1, false],
      [warmup!.id, 2, true],
    ]);

    // 2) La edición llega primero y la marca después: la marca espera, encuentra
    //    el mismo bloque (mismo id, otra posición) y se aplica.
    const secondLock = await holdPlanLock(a.organizationId, raced);
    const reorder = saveSessionPlan({
      actor: ownerA,
      sessionId: raced,
      command: { ...editCommand(afterFirst.plan!.revision), blocks: [...editCommand(0).blocks].reverse() },
    });
    await waitForLockWaiters(secondLock.pid, 1);
    const markTechnique = markSessionPlanBlock({
      actor: coachA1,
      sessionId: raced,
      blockId: technique!.id,
      command: { ...s1(), done: true },
    });
    await waitForLockWaiters(secondLock.pid, 2);
    secondLock.release();
    await secondLock.holder;
    await reorder;
    expect(await markTechnique).toEqual({ id: technique!.id, done: true, replayed: false });
    const final = await read(coachA1, raced, s1());
    expect(final.plan!.blocks.map((block) => [block.id, block.position, block.done])).toEqual([
      [warmup!.id, 1, true],
      [technique!.id, 2, true],
    ]);
    expect(final.plan!.revision).toBe(afterFirst.plan!.revision + 1);
  }, 60_000);

  it("en solo lectura del plan se lee y se repite, pero no se escribe", async () => {
    const clientRequestId = randomUUID();
    const late = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-11-16T16:30:00Z");
    const command = { ...s1(), clientRequestId, expectedRevision: null, focus: "Antes del bloqueo", blocks: [{ kind: "other", content: "x" }] };
    const created = await saveSessionPlan({ actor: coachA1, sessionId: late, command });
    const view = await read(coachA1, late, s1());

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
    const before = Object.fromEntries(await Promise.all(TABLES.map(async (table) => [table, await count(table, a.organizationId)])));

    expect((await read(coachA1, late, s1())).plan!.id).toBe(created.id);
    expect(await saveSessionPlan({ actor: coachA1, sessionId: late, command })).toEqual({ ...created, replayed: true });
    const blockId = view.plan!.blocks[0]!.id;
    // Pedir el estado que ya tiene es una repetición y no escribe.
    expect(
      await markSessionPlanBlock({ actor: coachA1, sessionId: late, blockId, command: { ...s1(), done: false } })
    ).toEqual({ id: blockId, done: false, replayed: true });
    await expect(
      markSessionPlanBlock({ actor: coachA1, sessionId: late, blockId, command: { ...s1(), done: true } })
    ).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });
    await expect(
      saveSessionPlan({ actor: coachA1, sessionId: late, command: { ...command, clientRequestId: randomUUID(), expectedRevision: 1 } })
    ).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
    await expect(create(ownerA, pastS1Third, s1(), { expectedRevision: null })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const fresh = await session(a.organizationId, a.locationIds[0]!, classS1, "2026-11-23T16:30:00Z");
    await expect(create(ownerA, fresh, s1())).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
    await expect(
      saveClassPlanTemplate({ actor: ownerA, classTemplateId: classS1, command: { ...s1(), expectedRevision: 2, blocks: [] } })
    ).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });

    const afterCounts = Object.fromEntries(await Promise.all(TABLES.map(async (table) => [table, await count(table, a.organizationId)])));
    expect(afterCounts).toEqual(before);
  }, 60_000);
});
