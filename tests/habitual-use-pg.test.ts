import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// El correo es lo único simulado: la base de datos y sus consultas son las reales.
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: vi.fn() }));

import { db } from "@/db";
import { loadCoachSessionCandidates } from "@/modules/habitual-use/application/coach-reminders";
import { loadOwnerDigestMetrics } from "@/modules/habitual-use/application/owner-weekly-digest";
import { isUsageStorageAvailable, resetUsageStorageCache } from "@/modules/habitual-use/application/storage";
import { recordFamilyPortalView, recordStaffVisit } from "@/modules/habitual-use/application/usage-events";
import { loadAcademyActivity, loadUsageWeeks } from "@/modules/habitual-use/application/usage-metrics";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

/**
 * Uso habitual sobre PostgreSQL desechable de GitHub. Instala el candidato SQL
 * solo aquí y borra su tabla al terminar; nunca en un proyecto enlazado ni con
 * credenciales externas. Cubre el SQL real que los mocks no ven: candidatos de
 * aviso a entrenadoras (equipo asignado, alcance de sedes, zona de la sede),
 * cifras del resumen, registro de eventos sin datos personales y vista de uso.
 */
const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";
const describeDisposablePg = describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1");

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
  readFileSync(resolve(process.cwd(), "docs/deployment/candidates/20261114130000_habitual_use_candidate.sql"), "utf8");

const MADRID = "Europe/Madrid";
const MEXICO = "America/Mexico_City";

interface Fixture {
  organizationId: string;
  madridId: string;
  mexicoId: string;
  ownerUserId: string;
  coachMemberId: string;
  coachEmail: string;
  scopedCoachMemberId: string;
  sessions: { soon: string; ended: string; recorded: string; otherSite: string };
}

async function seed(): Promise<Fixture> {
  const organizationId = randomUUID();
  const madridId = randomUUID();
  const mexicoId = randomUUID();
  const ownerUserId = randomUUID();
  const coachUserId = randomUUID();
  const scopedUserId = randomUUID();
  const coachMemberId = randomUUID();
  const scopedCoachMemberId = randomUUID();
  const templateMadrid = randomUUID();
  const templateMexico = randomUUID();
  const personIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const athleteIds = [randomUUID(), randomUUID()];
  const enrollmentIds = [randomUUID(), randomUUID(), randomUUID()];
  const staffIds = [randomUUID(), randomUUID()];
  const sessions = { soon: randomUUID(), ended: randomUUID(), recorded: randomUUID(), otherSite: randomUUID() };
  const coachEmail = `ci-habitual-coach-${coachUserId}@example.invalid`;

  await db.execute(sql`insert into zaltyko.organizations (id, name, default_timezone) values (${organizationId}::uuid, ${`CI uso habitual ${organizationId}`}, ${MADRID})`);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone) values
      (${madridId}::uuid, ${organizationId}::uuid, 'uh-madrid', 'UH Madrid', ${MADRID}),
      (${mexicoId}::uuid, ${organizationId}::uuid, 'uh-cdmx', 'UH CDMX', ${MEXICO})
  `);
  await db.execute(sql`
    insert into auth.users (id, email) values
      (${ownerUserId}::uuid, ${`ci-habitual-owner-${ownerUserId}@example.invalid`}),
      (${coachUserId}::uuid, ${coachEmail}),
      (${scopedUserId}::uuid, ${`ci-habitual-scoped-${scopedUserId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode) values
      (${randomUUID()}::uuid, ${organizationId}::uuid, ${ownerUserId}::uuid, 'owner', 'active', 'all'),
      (${coachMemberId}::uuid, ${organizationId}::uuid, ${coachUserId}::uuid, 'coach', 'active', 'all'),
      (${scopedCoachMemberId}::uuid, ${organizationId}::uuid, ${scopedUserId}::uuid, 'coach', 'active', 'selected')
  `);
  // Esta segunda entrenadora solo tiene la sede de México en su alcance.
  await db.execute(sql`
    insert into zaltyko.member_location_scopes (organization_id, member_id, location_id)
    values (${organizationId}::uuid, ${scopedCoachMemberId}::uuid, ${mexicoId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from) values
      (${templateMadrid}::uuid, ${organizationId}::uuid, ${madridId}::uuid, 'UH clase Madrid', 10, 'active', current_date - 60),
      (${templateMexico}::uuid, ${organizationId}::uuid, ${mexicoId}::uuid, 'UH clase México', 10, 'active', current_date - 60)
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name) values
      ${sql.join(personIds.map((id, i) => sql`(${id}::uuid, ${organizationId}::uuid, 'CI', ${`Persona ${i}`})`), sql`, `)}
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id, is_active) values
      (${athleteIds[0]}::uuid, ${organizationId}::uuid, ${personIds[0]}::uuid, true),
      (${athleteIds[1]}::uuid, ${organizationId}::uuid, ${personIds[1]}::uuid, true)
  `);
  await db.execute(sql`
    insert into zaltyko.staff_profiles (id, organization_id, person_id, member_id, is_active) values
      (${staffIds[0]}::uuid, ${organizationId}::uuid, ${personIds[2]}::uuid, ${coachMemberId}::uuid, true),
      (${staffIds[1]}::uuid, ${organizationId}::uuid, ${personIds[3]}::uuid, ${scopedCoachMemberId}::uuid, true)
  `);
  const today = sql`(now() at time zone ${MADRID})::date`;
  await db.execute(sql`
    insert into zaltyko.enrollments (id, organization_id, location_id, athlete_id, class_template_id, status, starts_on, ends_on, source) values
      (${enrollmentIds[0]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[0]}::uuid, ${templateMadrid}::uuid, 'active', ${today} - 40, null, 'owner'),
      (${enrollmentIds[1]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[1]}::uuid, ${templateMadrid}::uuid, 'active', ${today} - 40, null, 'owner'),
      (${enrollmentIds[2]}::uuid, ${organizationId}::uuid, ${mexicoId}::uuid, ${athleteIds[0]}::uuid, ${templateMexico}::uuid, 'active', ${today} - 40, null, 'owner')
  `);
  await db.execute(sql`
    insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at) values
      (${sessions.soon}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${templateMadrid}::uuid, 'scheduled', now() + interval '12 minutes', now() + interval '72 minutes'),
      (${sessions.ended}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${templateMadrid}::uuid, 'scheduled', now() - interval '3 hours', now() - interval '2 hours'),
      (${sessions.recorded}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${templateMadrid}::uuid, 'scheduled', now() - interval '6 hours', now() - interval '5 hours'),
      (${sessions.otherSite}::uuid, ${organizationId}::uuid, ${mexicoId}::uuid, ${templateMexico}::uuid, 'scheduled', now() + interval '10 minutes', now() + interval '70 minutes')
  `);
  // Todas las sesiones tienen a la primera entrenadora; la de México, además, a la segunda.
  await db.execute(sql`
    insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id) values
      (${organizationId}::uuid, ${sessions.soon}::uuid, ${staffIds[0]}::uuid),
      (${organizationId}::uuid, ${sessions.ended}::uuid, ${staffIds[0]}::uuid),
      (${organizationId}::uuid, ${sessions.recorded}::uuid, ${staffIds[0]}::uuid),
      (${organizationId}::uuid, ${sessions.otherSite}::uuid, ${staffIds[1]}::uuid),
      (${organizationId}::uuid, ${sessions.soon}::uuid, ${staffIds[1]}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.attendance_records (organization_id, location_id, session_id, enrollment_id, athlete_id, status) values
      (${organizationId}::uuid, ${madridId}::uuid, ${sessions.recorded}::uuid, ${enrollmentIds[0]}::uuid, ${athleteIds[0]}::uuid, 'present'),
      (${organizationId}::uuid, ${madridId}::uuid, ${sessions.recorded}::uuid, ${enrollmentIds[1]}::uuid, ${athleteIds[1]}::uuid, 'absent')
  `);
  return { organizationId, madridId, mexicoId, ownerUserId, coachMemberId, coachEmail, scopedCoachMemberId, sessions };
}

describeDisposablePg("uso habitual sobre PostgreSQL desechable", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    assertDisposableTarget();
    await db.execute(sql`drop table if exists public.usage_events`);
    await db.execute(sql.raw(candidate()));
    fixture = await seed();
  });

  afterAll(async () => {
    await db.execute(sql`drop table if exists public.usage_events`);
  });

  it("detecta el almacenamiento instalado tal como lo define el candidato", async () => {
    expect(await isUsageStorageAvailable(db)).toBe(true);
    await db.execute(sql`alter table public.usage_events add column extra text`);
    expect(await isUsageStorageAvailable(db)).toBe(false);
    await db.execute(sql`alter table public.usage_events drop column extra`);
    expect(await isUsageStorageAvailable(db)).toBe(true);
  });

  it("elige sesiones con equipo asignado y sede en su alcance, con la zona de la sede", async () => {
    const rows = (await loadCoachSessionCandidates(new Date())).filter(
      (row) => row.organizationId === fixture.organizationId
    );
    const key = (row: (typeof rows)[number]) => `${row.sessionId}:${row.recipientMemberId}`;
    const keys = rows.map(key).sort();
    // La titular con todas las sedes recibe las tres de Madrid (una ya con lista: el plan la descarta);
    // la entrenadora con alcance solo en México recibe la de México y NO la de Madrid donde también figura.
    expect(keys).toEqual(
      [
        `${fixture.sessions.soon}:${fixture.coachMemberId}`,
        `${fixture.sessions.ended}:${fixture.coachMemberId}`,
        `${fixture.sessions.recorded}:${fixture.coachMemberId}`,
        `${fixture.sessions.otherSite}:${fixture.scopedCoachMemberId}`,
      ].sort()
    );
    const ended = rows.find((row) => row.sessionId === fixture.sessions.ended)!;
    expect(ended).toMatchObject({ timezone: MADRID, hasAttendance: false, expectedAthletes: 2, recipientEmail: fixture.coachEmail });
    expect(rows.find((row) => row.sessionId === fixture.sessions.otherSite)?.timezone).toBe(MEXICO);
    expect(rows.find((row) => row.sessionId === fixture.sessions.recorded)?.hasAttendance).toBe(true);
  });

  it("calcula las cifras del resumen con el alcance real de sedes", async () => {
    const scope = await resolveOwnerScope({ userId: fixture.ownerUserId, organizationId: fixture.organizationId });
    const metrics = await loadOwnerDigestMetrics({ scope, now: new Date(), timezone: MADRID });
    // La sesión terminada hace 2 h no tiene lista; la de hace 5 h sí.
    expect(metrics.unrecordedSessions).toBe(1);
    expect(metrics.overdueInvoices).toBe(0);
    // Una gimnasta figuró ausente en la sesión con lista y no tiene ninguna asistencia en 14 días.
    expect(metrics.inactiveAthletes).toBe(1);
  });

  it("registra eventos sin datos personales y los cuenta en la vista de uso", async () => {
    process.env.ZALTYKO_HABITUAL_USE_ENABLED = "true";
    process.env.ZALTYKO_USAGE_METRICS_ENABLED = "true";
    process.env.UNSUBSCRIBE_HMAC_SECRET = "s".repeat(32);
    resetUsageStorageCache();
    try {
      expect(await recordStaffVisit({ organizationId: fixture.organizationId, role: "coach" })).toBe(true);
      expect(await recordStaffVisit({ organizationId: fixture.organizationId, role: "coach" })).toBe(true);
      expect(await recordFamilyPortalView({ organizationId: fixture.organizationId, userId: randomUUID() })).toBe(true);

      const rows = (
        await db.execute(sql`
          select event_name, actor_role, actor_ref, occurrences
          from public.usage_events where organization_id = ${fixture.organizationId}::uuid
          order by event_name
        `)
      ).rows as Array<{ event_name: string; actor_role: string; actor_ref: string; occurrences: number }>;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ event_name: "family_portal_view", actor_role: "family", occurrences: 1 });
      expect(rows[0]?.actor_ref).toMatch(/^[0-9a-f]{16}$/);
      expect(rows[1]).toMatchObject({ event_name: "staff_visit", actor_role: "coach", actor_ref: "", occurrences: 2 });

      const weeks = await loadUsageWeeks(db, 2);
      expect(weeks[0]?.activeAcademies).toBeGreaterThanOrEqual(1);
      expect(weeks[0]?.familyAccounts).toBeGreaterThanOrEqual(1);
      // Si la prueba corre el lunes de madrugada las sesiones caen en la semana anterior.
      expect(weeks.reduce((total, week) => total + week.sessionsHeld, 0)).toBeGreaterThanOrEqual(2);
      expect(weeks.reduce((total, week) => total + week.sessionsWithAttendance, 0)).toBeGreaterThanOrEqual(1);

      const mine = (await loadAcademyActivity(db)).find((item) => item.organizationId === fixture.organizationId);
      expect(mine?.lastActivityAt).not.toBeNull();
    } finally {
      delete process.env.ZALTYKO_HABITUAL_USE_ENABLED;
      delete process.env.ZALTYKO_USAGE_METRICS_ENABLED;
      delete process.env.UNSUBSCRIBE_HMAC_SECRET;
      resetUsageStorageCache();
    }
  });

  it("el candidato rechaza datos fuera de contrato y no se reinstala encima", async () => {
    await expect(
      db.execute(sql`
        insert into public.usage_events (organization_id, event_name, actor_role, occurred_on)
        values (${fixture.organizationId}::uuid, 'staff_visit', 'family', current_date)
      `)
    ).rejects.toThrow();
    await expect(
      db.execute(sql`
        insert into public.usage_events (organization_id, event_name, actor_role, occurred_on, actor_ref)
        values (${fixture.organizationId}::uuid, 'family_portal_view', 'family', current_date, 'correo@ejemplo.test')
      `)
    ).rejects.toThrow();
    await expect(db.execute(sql.raw(candidate()))).rejects.toThrow(/requires public.usage_events absent/);
  });
});
