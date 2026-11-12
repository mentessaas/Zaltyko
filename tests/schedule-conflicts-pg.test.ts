import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Permite simular que la detección falla con un error de SQL dentro de la
// transacción de O1, para probar que el guardado no depende de ella.
const detection = vi.hoisted(() => ({ fail: false }));
// Sonda del statement_timeout dentro del savepoint de avisos de O1 y después.
const probe = vi.hoisted(() => ({ on: false, inside: null as string | null, after: null as string | null }));
vi.mock("@/modules/shared/infrastructure/transactional-records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>();
  return {
    ...actual,
    appendAuditEntry: async (...args: Parameters<typeof actual.appendAuditEntry>) => {
      if (probe.on) {
        const { sql: rawSql } = await import("drizzle-orm");
        const result = await args[0].execute(rawSql`select current_setting('statement_timeout') as value`);
        probe.after = String((result.rows[0] as { value: string }).value);
      }
      return actual.appendAuditEntry(...args);
    },
  };
});
vi.mock("@/modules/schedule-conflicts/application/schedule-conflicts-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/schedule-conflicts/application/schedule-conflicts-service")>();
  return {
    ...actual,
    findScheduleConflicts: async (...args: Parameters<typeof actual.findScheduleConflicts>) => {
      if (probe.on) {
        const { sql: rawSql } = await import("drizzle-orm");
        const result = await args[0].execute(rawSql`select current_setting('statement_timeout') as value`);
        probe.inside = String((result.rows[0] as { value: string }).value);
      }
      if (detection.fail) {
        const { sql: rawSql } = await import("drizzle-orm");
        await args[0].execute(rawSql`select 1 / 0`);
      }
      return actual.findScheduleConflicts(...args);
    },
  };
});

import { db } from "@/db";
import { setSessionCoaches } from "@/modules/coach-assignment/application/coach-assignment-service";
import {
  findScheduleConflicts,
  getUpcomingScheduleConflicts,
  loadUpcomingScheduleConflicts,
} from "@/modules/schedule-conflicts/application/schedule-conflicts-service";

/**
 * O2 · Avisos de choque de entrenadora y pista sobre PostgreSQL desechable de
 * GitHub. La detección solo lee tablas ya aplicadas (sessions, session_staff,
 * spaces); las asignaciones se insertan directamente. Solo la prueba de «no
 * bloquea» instala el candidato de O1, para guardar una sustitución real, y lo
 * retira al terminar dejando la base como estaba.
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

type Actor = { userId: string; memberId: string };

/** Hoy a las `hour`:`minute` UTC dentro de `days` días (en el horizonte). */
function at(days: number, hour: number, minute = 0): string {
  const value = new Date(Date.now() + days * 86_400_000);
  value.setUTCHours(hour, minute, 0, 0);
  return value.toISOString();
}

async function academy(label: string, sites: number) {
  const organizationId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI choques ${label}`}, 'active')
  `);
  const locationIds: string[] = [];
  for (let index = 0; index < sites; index += 1) {
    const locationId = randomUUID();
    locationIds.push(locationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
      values (${locationId}::uuid, ${organizationId}::uuid, ${`ci-clash-${index}-${organizationId.slice(0, 8)}`},
        ${`Sede ${label} ${index + 1}`}, 'Europe/Madrid', true)
    `);
  }
  return { organizationId, locationIds };
}

async function member(
  organizationId: string,
  role: "owner" | "manager" | "coach",
  scopeMode: "all" | "selected",
  locationIds: string[] = [],
  label: string = role
): Promise<Actor> {
  const userId = randomUUID();
  await db.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-clash-${label}-${userId}@example.invalid`})`);
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

async function classTemplate(organizationId: string, locationId: string, name: string) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${name}, 12, 'active', '2026-09-01')
  `);
  return id;
}

async function space(organizationId: string, locationId: string, name: string) {
  const facilityId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.facilities (id, organization_id, location_id, name)
    values (${facilityId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, 'Pabellón')
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.spaces (id, organization_id, location_id, facility_id, name)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${facilityId}::uuid, ${name})
  `);
  return id;
}

async function session(
  organizationId: string,
  locationId: string,
  classTemplateId: string,
  startsAt: string,
  endsAt: string,
  options: { status?: "scheduled" | "cancelled"; spaceId?: string | null } = {}
) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, space_id, status, starts_at, ends_at)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${classTemplateId}::uuid, ${options.spaceId ?? null}::uuid,
      ${options.status ?? "scheduled"}, ${startsAt}::timestamptz, ${endsAt}::timestamptz)
  `);
  return id;
}

async function assign(organizationId: string, sessionId: string, staffProfileId: string) {
  await db.execute(sql`
    insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id, assignment_role)
    values (${organizationId}::uuid, ${sessionId}::uuid, ${staffProfileId}::uuid, 'coach')
  `);
}

const pairKey = (conflict: { kind: string; first: { sessionId: string }; second: { sessionId: string } }) =>
  `${conflict.kind}:${[conflict.first.sessionId, conflict.second.sessionId].sort().join("|")}`;
const key = (kind: string, a: string, b: string) => `${kind}:${[a, b].sort().join("|")}`;

describe.skipIf(!disposablePgEnabled)("avisos de choque en PostgreSQL desechable", () => {
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let coachS1: Actor;
  let ana: string;
  let bea: string;
  // Sesiones de A (S1 = sede 1, S2 = sede 2), todas mañana salvo que se diga.
  let s1Early: string; // 16:00–17:30 S1, Ana, pista P
  let s1Overlap: string; // 17:00–18:30 S1, Ana (solape en la misma sede), pista P (solape de pista)
  let s1Touch: string; // 18:30–19:30 S1, Ana (se toca con s1Overlap: no choca), pista P (se toca: no choca)
  let s2Travel: string; // 19:45–21:00 S2, Ana (15 min tras s1Touch en otra sede: desplazamiento)
  let s2Overlap: string; // 16:30–17:00 S2, Bea; y Bea también en s1Early (solape en otra sede)
  let s1Cancelled: string; // 16:15–17:15 S1 cancelada, Ana y pista P: no cuenta
  let sBOverlap: string; // academia B, misma hora que s1Early, con la ficha de Ana de A (no debe cruzarse)

  beforeAll(async () => {
    assertDisposableTarget();
    a = await academy("A", 2);
    b = await academy("B", 1);
    coachS1 = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "ana");
    ana = await staffProfile(a.organizationId, "Ana", "Ruiz", coachS1.memberId);
    bea = await staffProfile(a.organizationId, "Bea", "Gil", (await member(a.organizationId, "coach", "all", [], "bea")).memberId);
    const pista = await space(a.organizationId, a.locationIds[0]!, "Practicable");
    const k1 = await classTemplate(a.organizationId, a.locationIds[0]!, "CI Base 3");
    const k2 = await classTemplate(a.organizationId, a.locationIds[0]!, "CI Iniciación");
    const k3 = await classTemplate(a.organizationId, a.locationIds[1]!, "CI Competición");

    s1Early = await session(a.organizationId, a.locationIds[0]!, k1, at(1, 16), at(1, 17, 30), { spaceId: pista });
    s1Overlap = await session(a.organizationId, a.locationIds[0]!, k2, at(1, 17), at(1, 18, 30), { spaceId: pista });
    s1Touch = await session(a.organizationId, a.locationIds[0]!, k1, at(1, 18, 30), at(1, 19, 30), { spaceId: pista });
    s2Travel = await session(a.organizationId, a.locationIds[1]!, k3, at(1, 19, 45), at(1, 21));
    s2Overlap = await session(a.organizationId, a.locationIds[1]!, k3, at(1, 16, 30), at(1, 17));
    s1Cancelled = await session(a.organizationId, a.locationIds[0]!, k2, at(1, 16, 15), at(1, 17, 15), {
      status: "cancelled",
      spaceId: pista,
    });
    for (const id of [s1Early, s1Overlap, s1Touch, s2Travel, s1Cancelled]) await assign(a.organizationId, id, ana);
    await assign(a.organizationId, s1Early, bea);
    await assign(a.organizationId, s2Overlap, bea);

    // Academia B: misma franja y su propia entrenadora con dos sesiones solapadas.
    const kb = await classTemplate(b.organizationId, b.locationIds[0]!, "CI Base B");
    const zoe = await staffProfile(b.organizationId, "Zoe", "Lara", (await member(b.organizationId, "coach", "all", [], "zoe")).memberId);
    sBOverlap = await session(b.organizationId, b.locationIds[0]!, kb, at(1, 16), at(1, 17, 30));
    const sB2 = await session(b.organizationId, b.locationIds[0]!, kb, at(1, 17), at(1, 18));
    await assign(b.organizationId, sBOverlap, zoe);
    await assign(b.organizationId, sB2, zoe);
  }, 60_000);

  it("detecta choques de entrenadora en la misma sede y en otra, y de pista, sin contar canceladas ni contactos", async () => {
    // El detector de pista está apagado en las páginas; aquí se pide explícitamente.
    const { conflicts, truncated } = await findScheduleConflicts(db, {
      organizationId: a.organizationId,
      include: { coach: true, space: true },
    });
    expect(truncated).toBe(false);
    const keys = conflicts.map(pairKey).sort();
    expect(keys).toEqual(
      [
        key("coach_overlap", s1Early, s1Overlap), // Ana, misma sede
        key("coach_travel", s1Touch, s2Travel), // Ana, otra sede, 15 min
        key("coach_overlap", s1Early, s2Overlap), // Bea, otra sede, solape
        key("space_overlap", s1Early, s1Overlap), // Practicable
      ].sort()
    );
    // Ni la cancelada ni los contactos exactos (s1Overlap–s1Touch).
    expect(JSON.stringify(conflicts)).not.toContain(s1Cancelled);
    expect(keys).not.toContain(key("coach_overlap", s1Overlap, s1Touch));
    expect(keys).not.toContain(key("space_overlap", s1Overlap, s1Touch));
    const travel = conflicts.find((conflict) => conflict.kind === "coach_travel")!;
    expect(travel).toMatchObject({ subjectId: ana, subjectName: "Ana Ruiz" });
    expect(travel.first.sessionId).toBe(s1Touch);
    expect(conflicts.find((conflict) => conflict.kind === "space_overlap")!.subjectName).toBe("Practicable");
  });

  it("aísla las academias: los choques de B no aparecen en A ni al revés", async () => {
    const inA = await findScheduleConflicts(db, { organizationId: a.organizationId, include: { coach: true, space: true } });
    const inB = await findScheduleConflicts(db, { organizationId: b.organizationId, include: { coach: true, space: true } });
    expect(JSON.stringify(inA)).not.toContain(sBOverlap);
    expect(inB.conflicts).toHaveLength(1);
    expect(inB.conflicts[0]).toMatchObject({ kind: "coach_overlap", subjectName: "Zoe Lara" });
    expect(JSON.stringify(inB)).not.toContain(s1Early);
    // Filtrar B con fichas de A no devuelve nada.
    expect((await findScheduleConflicts(db, { organizationId: b.organizationId, staffProfileIds: [ana] })).conflicts).toEqual([]);
  });

  it("la entrenadora solo ve sus choques y solo en sus sedes; la dirección ve los de sus sedes", async () => {
    const coachView = await getUpcomingScheduleConflicts({
      organizationId: a.organizationId,
      locationIds: [a.locationIds[0]!],
      viewer: { memberId: coachS1.memberId, role: "coach" },
    });
    // Ana (sede 1): su solape en la sede 1. No el desplazamiento a la sede 2,
    // ni los choques de Bea, ni la pista.
    expect(coachView?.conflicts.map(pairKey)).toEqual([key("coach_overlap", s1Early, s1Overlap)]);
    // Aunque la página pidiera sedes de otra academia, no se amplía nada.
    const foreign = await getUpcomingScheduleConflicts({
      organizationId: a.organizationId,
      locationIds: [b.locationIds[0]!],
      viewer: { memberId: coachS1.memberId, role: "coach" },
    });
    expect(foreign).toEqual({ conflicts: [], truncated: false });

    const managerSite2 = await getUpcomingScheduleConflicts({
      organizationId: a.organizationId,
      locationIds: [a.locationIds[1]!],
      viewer: { memberId: randomUUID(), role: "manager" },
    });
    // Solo la sede 2: los choques entre sedes necesitan las dos sedes visibles.
    expect(managerSite2?.conflicts).toEqual([]);
    const ownerAll = await getUpcomingScheduleConflicts({
      organizationId: a.organizationId,
      locationIds: a.locationIds,
      viewer: { memberId: randomUUID(), role: "owner" },
    });
    // En las páginas, los avisos de pista están apagados (SPACE_CONFLICT_WARNINGS_ENABLED).
    expect(ownerAll?.conflicts.map(pairKey).sort()).toEqual(
      [key("coach_overlap", s1Early, s1Overlap), key("coach_travel", s1Touch, s2Travel), key("coach_overlap", s1Early, s2Overlap)].sort()
    );
    // Por defecto, el detector tampoco calcula pistas.
    expect((await findScheduleConflicts(db, { organizationId: a.organizationId })).conflicts.some((c) => c.kind === "space_overlap")).toBe(false);
  });

  it("más de 50 clases seguidas en la misma sede no tapan un choque real al final", async () => {
    const e = await academy("E", 1);
    const lola = await staffProfile(e.organizationId, "Lola", "Martín", (await member(e.organizationId, "coach", "all", [], "lola")).memberId);
    const morning = await classTemplate(e.organizationId, e.locationIds[0]!, "CI Seguidas");
    const extra = await classTemplate(e.organizationId, e.locationIds[0]!, "CI Extra");
    // 60 sesiones de una hora, una detrás de otra (se tocan: no chocan).
    await db.execute(sql`
      with base as (select date_trunc('hour', now()) + interval '2 days' as starts_at)
      insert into zaltyko.sessions (organization_id, location_id, class_template_id, status, starts_at, ends_at)
      select ${e.organizationId}::uuid, ${e.locationIds[0]}::uuid, ${morning}::uuid, 'scheduled',
        base.starts_at + make_interval(hours => n), base.starts_at + make_interval(hours => n + 1)
      from base, generate_series(0, 59) as n
    `);
    await db.execute(sql`
      insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id, assignment_role)
      select organization_id, id, ${lola}::uuid, 'coach' from zaltyko.sessions where class_template_id = ${morning}::uuid
    `);
    const last = (
      await db.execute(sql`
        select id::text as id, starts_at from zaltyko.sessions
        where class_template_id = ${morning}::uuid order by starts_at desc limit 1
      `)
    ).rows[0] as { id: string; starts_at: Date };
    const clash = randomUUID();
    await db.execute(sql`
      insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at)
      values (${clash}::uuid, ${e.organizationId}::uuid, ${e.locationIds[0]}::uuid, ${extra}::uuid, 'scheduled',
        ${new Date(last.starts_at).toISOString()}::timestamptz + interval '30 minutes',
        ${new Date(last.starts_at).toISOString()}::timestamptz + interval '90 minutes')
    `);
    await assign(e.organizationId, clash, lola);

    const result = await findScheduleConflicts(db, { organizationId: e.organizationId });
    expect(result.truncated).toBe(false);
    expect(result.conflicts.map(pairKey)).toEqual([key("coach_overlap", last.id, clash)]);
  }, 60_000);

  it("las páginas miran 14 días: un choque a 20 días no aparece, aunque el detector lo vea", async () => {
    const h = await academy("H", 1);
    const nia = await staffProfile(h.organizationId, "Nía", "Vega", (await member(h.organizationId, "coach", "all", [], "nia")).memberId);
    const kh1 = await classTemplate(h.organizationId, h.locationIds[0]!, "CI Lejana 1");
    const kh2 = await classTemplate(h.organizationId, h.locationIds[0]!, "CI Lejana 2");
    const far1 = await session(h.organizationId, h.locationIds[0]!, kh1, at(20, 17), at(20, 18, 30));
    const far2 = await session(h.organizationId, h.locationIds[0]!, kh2, at(20, 18), at(20, 19));
    await assign(h.organizationId, far1, nia);
    await assign(h.organizationId, far2, nia);
    // Control: el detector con el horizonte completo sí lo ve.
    expect((await findScheduleConflicts(db, { organizationId: h.organizationId })).conflicts.map(pairKey)).toEqual([
      key("coach_overlap", far1, far2),
    ]);
    const page = await getUpcomingScheduleConflicts({
      organizationId: h.organizationId,
      locationIds: h.locationIds,
      viewer: { memberId: randomUUID(), role: "owner" },
    });
    expect(page).toEqual({ conflicts: [], truncated: false });
  });

  it("no lee sesiones empezadas hace más de un día, aunque sigan abiertas", async () => {
    const i = await academy("I", 1);
    const oli = await staffProfile(i.organizationId, "Oli", "Ramos", (await member(i.organizationId, "coach", "all", [], "oli")).memberId);
    const ki = await classTemplate(i.organizationId, i.locationIds[0]!, "CI Campus");
    const kj = await classTemplate(i.organizationId, i.locationIds[0]!, "CI Hoy");
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
    const hour = 3_600_000;
    // Empezó hace 2 días y termina dentro de 3 horas: fuera de la ventana.
    const old = await session(i.organizationId, i.locationIds[0]!, ki, iso(-48 * hour), iso(3 * hour));
    // Empezó hace 12 horas y termina dentro de 3 horas: dentro (control).
    const recent = await session(i.organizationId, i.locationIds[0]!, ki, iso(-12 * hour), iso(3 * hour));
    const current = await session(i.organizationId, i.locationIds[0]!, kj, iso(1 * hour), iso(2 * hour));
    for (const id of [old, recent, current]) await assign(i.organizationId, id, oli);
    const keys = (await findScheduleConflicts(db, { organizationId: i.organizationId })).conflicts.map(pairKey);
    expect(keys).toEqual([key("coach_overlap", recent, current)]);
    expect(keys.join()).not.toContain(old);
  });

  it("una carga abandonada entre consultas no lanza la siguiente", async () => {
    // El guardián da presupuesto hasta después de la consulta de alcance y lo
    // agota justo antes de la consulta de choques (5.ª comprobación).
    let checks = 0;
    const guard = {
      signal: new AbortController().signal,
      remainingMs: () => {
        checks += 1;
        return checks <= 4 ? 1000 : 0;
      },
    };
    const outcome = await loadUpcomingScheduleConflicts(
      { organizationId: a.organizationId, locationIds: a.locationIds, viewer: { memberId: randomUUID(), role: "owner" } },
      guard
    ).then(
      () => "completed",
      (error: Error) => error.name
    );
    expect(outcome).toBe("LoadAbandoned");
    // Ninguna comprobación más después del abandono: la consulta de choques no se lanzó.
    expect(checks).toBe(5);
    // Con el presupuesto ya agotado desde el principio no pide ni conexión.
    let early = 0;
    const exhausted = { signal: new AbortController().signal, remainingMs: () => ((early += 1), 0) };
    await expect(
      loadUpcomingScheduleConflicts(
        { organizationId: a.organizationId, locationIds: a.locationIds, viewer: { memberId: randomUUID(), role: "owner" } },
        exhausted
      )
    ).rejects.toMatchObject({ name: "LoadAbandoned" });
    expect(early).toBe(1);
  });

  it("en las páginas, un presupuesto agotado devuelve null y no deja statement_timeout activo", async () => {
    const before = ((await db.execute(sql`show statement_timeout`)).rows[0] as { statement_timeout: string }).statement_timeout;
    const exhausted = await getUpcomingScheduleConflicts({
      organizationId: a.organizationId,
      locationIds: a.locationIds,
      viewer: { memberId: randomUUID(), role: "owner" },
      budgetMs: 0,
    });
    expect(exhausted).toBeNull();
    // Deja terminar la carga abandonada antes de mirar las conexiones.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const normal = await getUpcomingScheduleConflicts({
      organizationId: a.organizationId,
      locationIds: a.locationIds,
      viewer: { memberId: randomUUID(), role: "owner" },
    });
    expect(normal?.conflicts.length).toBeGreaterThan(0);
    // `set local` solo dura la transacción: ninguna conexión del pool lo conserva.
    const checks = await Promise.all(
      Array.from({ length: 4 }, () =>
        db.transaction(async (tx) => ((await tx.execute(sql`show statement_timeout`)).rows[0] as { statement_timeout: string }).statement_timeout)
      )
    );
    for (const value of checks) expect(value).toBe(before);
  });

  describe("el aviso no bloquea (con el candidato de O1)", () => {
    beforeAll(async () => {
      await db.execute(
        sql.raw(readFileSync(resolve(process.cwd(), "docs/deployment/candidates/20261111180000_coach_assignment_candidate.sql"), "utf8"))
      );
    }, 60_000);

    afterAll(async () => {
      if (!disposablePgEnabled) return;
      // Deja la base compartida como estaba, en una sola transacción.
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

    it("una sustitución que crea un choque se guarda, devuelve el aviso y lo audita", async () => {
      const c = await academy("C", 1);
      const owner = await member(c.organizationId, "owner", "all");
      const lia = await staffProfile(c.organizationId, "Lía", "Ferrer", (await member(c.organizationId, "coach", "all", [], "lia")).memberId);
      const kc1 = await classTemplate(c.organizationId, c.locationIds[0]!, "CI Mañana");
      const kc2 = await classTemplate(c.organizationId, c.locationIds[0]!, "CI Tarde");
      const busy = await session(c.organizationId, c.locationIds[0]!, kc1, at(2, 17), at(2, 18, 30));
      const target = await session(c.organizationId, c.locationIds[0]!, kc2, at(2, 18), at(2, 19));
      await assign(c.organizationId, busy, lia);

      const result = await setSessionCoaches({
        actor: owner,
        sessionId: target,
        command: {
          organizationId: c.organizationId,
          locationId: c.locationIds[0]!,
          clientRequestId: randomUUID(),
          staffProfileIds: [lia],
          expectedStaffProfileIds: [],
          reason: "absence",
        },
      });
      // Guardado igualmente.
      expect(result.coaches.map((coach) => coach.staffProfileId)).toEqual([lia]);
      expect(result.warnings.map(pairKey)).toEqual([key("coach_overlap", busy, target)]);
      const stored = await db.execute(sql`
        select count(*)::int as count from zaltyko.session_staff where session_id = ${target}::uuid and staff_profile_id = ${lia}::uuid
      `);
      expect(stored.rows).toEqual([{ count: 1 }]);
      const audit = await db.execute(sql`
        select metadata from zaltyko.audit_log
        where organization_id = ${c.organizationId}::uuid and target_id = ${target}::uuid and action = 'session.coaches_set'
      `);
      expect((audit.rows[0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
        savedWithWarnings: true,
        scheduleWarnings: [{ kind: "coach_overlap", staffProfileId: lia }],
      });
      expect(JSON.stringify(audit.rows)).not.toContain("Lía");
    }, 60_000);

    it("los avisos de O1 corren con statement_timeout acotado y luego se restaura el de la transacción", async () => {
      const j = await academy("J", 1);
      const owner = await member(j.organizationId, "owner", "all");
      const pau = await staffProfile(j.organizationId, "Pau", "Llorente", (await member(j.organizationId, "coach", "all", [], "pau")).memberId);
      const kj = await classTemplate(j.organizationId, j.locationIds[0]!, "CI Sonda");
      const target = await session(j.organizationId, j.locationIds[0]!, kj, at(5, 18), at(5, 19));
      const baseline = ((await db.execute(sql`show statement_timeout`)).rows[0] as { statement_timeout: string }).statement_timeout;
      probe.on = true;
      probe.inside = null;
      probe.after = null;
      try {
        await setSessionCoaches({
          actor: owner,
          sessionId: target,
          command: {
            organizationId: j.organizationId,
            locationId: j.locationIds[0]!,
            clientRequestId: randomUUID(),
            staffProfileIds: [pau],
            expectedStaffProfileIds: [],
            reason: null,
          },
        });
      } finally {
        probe.on = false;
      }
      expect(probe.inside).toBe("1500ms");
      // Tras liberar el savepoint, la auditoría de O1 vuelve a ver el valor de siempre.
      expect(probe.after).toBe(baseline);
      expect(probe.after).not.toBe("1500ms");
    }, 60_000);

    it("si la detección falla (error de SQL), la sustitución se guarda igual y el aviso queda como no disponible", async () => {
      const f = await academy("F", 1);
      const owner = await member(f.organizationId, "owner", "all");
      const mia = await staffProfile(f.organizationId, "Mía", "Soto", (await member(f.organizationId, "coach", "all", [], "mia")).memberId);
      const kf = await classTemplate(f.organizationId, f.locationIds[0]!, "CI Fallo");
      const target = await session(f.organizationId, f.locationIds[0]!, kf, at(3, 18), at(3, 19));
      detection.fail = true;
      try {
        const result = await setSessionCoaches({
          actor: owner,
          sessionId: target,
          command: {
            organizationId: f.organizationId,
            locationId: f.locationIds[0]!,
            clientRequestId: randomUUID(),
            staffProfileIds: [mia],
            expectedStaffProfileIds: [],
            reason: null,
          },
        });
        expect(result.warnings).toBeNull();
        expect(result.coaches.map((coach) => coach.staffProfileId)).toEqual([mia]);
      } finally {
        detection.fail = false;
      }
      const audit = await db.execute(sql`
        select metadata from zaltyko.audit_log
        where organization_id = ${f.organizationId}::uuid and target_id = ${target}::uuid and action = 'session.coaches_set'
      `);
      expect((audit.rows[0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({ scheduleWarningsUnavailable: true });
    }, 60_000);

    it("los avisos al guardar solo nombran sedes que ve quien guarda", async () => {
      const g = await academy("G", 2);
      const managerSite1 = await member(g.organizationId, "manager", "selected", [g.locationIds[0]!], "manager-g");
      const noa = await staffProfile(g.organizationId, "Noa", "Prieto", (await member(g.organizationId, "coach", "all", [], "noa")).memberId);
      const kg1 = await classTemplate(g.organizationId, g.locationIds[0]!, "CI Sede 1");
      const kg2 = await classTemplate(g.organizationId, g.locationIds[1]!, "CI Sede 2");
      const otherSite = await session(g.organizationId, g.locationIds[1]!, kg2, at(4, 17), at(4, 18, 30));
      const target = await session(g.organizationId, g.locationIds[0]!, kg1, at(4, 18), at(4, 19));
      await assign(g.organizationId, otherSite, noa);
      const result = await setSessionCoaches({
        actor: managerSite1,
        sessionId: target,
        command: {
          organizationId: g.organizationId,
          locationId: g.locationIds[0]!,
          clientRequestId: randomUUID(),
          staffProfileIds: [noa],
          expectedStaffProfileIds: [],
          reason: null,
        },
      });
      // Hay un choque real con la sede 2, pero la coordinación de la sede 1 no la ve.
      expect(result.warnings).toEqual([]);
      expect((await findScheduleConflicts(db, { organizationId: g.organizationId })).conflicts.map(pairKey)).toEqual([
        key("coach_overlap", otherSite, target),
      ]);
    }, 60_000);
  });
});
