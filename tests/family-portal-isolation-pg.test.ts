/**
 * P2 #16 · Portal de familias contra PostgreSQL desechable.
 *
 * Ejecuta las lecturas reales del portal (y las guardas SQL directamente)
 * sobre el esquema canónico replicado en un Postgres local de GitHub. Cubre:
 * dos academias, dos familias en la misma academia, una gimnasta compartida
 * por dos familias, el pagador con can_view_athletes = false que crea hoy
 * /owner, pagadores terminados y futuros, una membresía que termina hoy,
 * un tutor en dos academias, accesos revocados
 * (auth_user_id nulo, vínculo inactivo, familia inactiva, tutor inactivo),
 * membresías pasadas y futuras, academias suspended y closed, cuotas draft y
 * void, un cargo anulado, reembolsos y asistencia anterior al vínculo.
 *
 * Solo corre con ZALTYKO_PG_INTEGRATION=1 contra un Postgres desechable; en
 * el resto se omite. Aún no está registrada en ningún job de CI: el script de
 * replay está fijado por supabase/schema-snapshot-manifest.json y su
 * ejecución la decide Elvis (ver docs/producto/portal-familias.md).
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { attendanceRecords, sessions } from "@/db/zaltyko-schema";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import { familyCanViewAthlete } from "@/modules/family-portal/application/family-portal-sql";
import {
  getFamilyAthleteOverview,
  getFamilyFees,
} from "@/modules/family-portal/application/family-portal-reads";

const disposablePgEnabled = process.env.ZALTYKO_PG_INTEGRATION === "1";
const describeDisposablePg = describe.skipIf(!disposablePgEnabled);

/** Fixed clock: every date rule is evaluated from this instant, not now(). */
const NOW = new Date("2026-11-10T09:00:00.000Z");

function assertDisposableTarget() {
  if (
    process.env.ZALTYKO_PG_INTEGRATION !== "1" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_OS !== "Linux" ||
    process.env.NODE_ENV !== "test"
  ) {
    throw new Error("This suite is restricted to the disposable GitHub Linux database");
  }

  const connectionString = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const configuredUrls = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ];
  let parsed: URL;
  try {
    parsed = new URL(connectionString ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" ||
    !parsed.port ||
    !parsed.password ||
    parsed.pathname !== "/postgres" ||
    configuredUrls.some((value) => value !== connectionString)
  ) {
    throw new Error("The integration suite refuses an unexpected PostgreSQL identity");
  }

  const forbidden = [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ];
  const activeForbidden = forbidden.filter((name) => Boolean(process.env[name]));
  if (activeForbidden.length > 0) {
    throw new Error(
      `The integration runner contains forbidden external credential variables: ${activeForbidden.join(", ")}`
    );
  }
}

function id() {
  return randomUUID();
}

async function seedFixture() {
  const suffix = id().slice(0, 8);
  const f = {
    suffix,
    orgA: id(), orgB: id(), orgSuspended: id(), orgClosed: id(),
    siteNorth: id(), siteSouth: id(), siteB: id(), siteSuspended: id(), siteClosed: id(),
    // Accounts.
    userA: id(), userA2: id(), userViewer: id(), userNullLink: id(),
    userLinkInactive: id(), userFamilyInactive: id(), userGuardianInactive: id(),
    userSuspended: id(), userClosed: id(),
    userPayerNoView: id(), userPayerEnded: id(), userPayerFuture: id(),
    // Guardians (one person each).
    gA: id(), gAinB: id(), gA2: id(), gViewer: id(), gNullLink: id(),
    gLinkInactive: id(), gFamilyInactive: id(), gGuardianInactive: id(),
    gSuspended: id(), gClosed: id(),
    gPayerNoView: id(), gPayerEnded: id(), gPayerFuture: id(),
    // Families.
    famA: id(), famA2: id(), famInactive: id(), famB: id(), famSuspended: id(), famClosed: id(),
    // Athletes.
    ana: id(), bruno: id(), fede: id(), carla: id(), ines: id(), dani: id(), olga: id(), pia: id(),
    lia: id(),
    // Schedule.
    classNorth: id(), classSouth: id(), classB: id(),
    enrAna: id(), enrCarla: id(), enrDani: id(),
    sAnaSep: id(), sAnaOct: id(), sAnaNext: id(), sCarlaOct: id(), sCarlaNext: id(),
    sDaniAug: id(), sDaniOct: id(),
    // Ledger.
    invA: id(), invADraft: id(), invAVoid: id(), invA2: id(), invB: id(),
    lineA: id(), lineAVoid: id(), lineA2: id(), lineB: id(),
    chargeA: id(), chargeAVoid: id(), chargeA2: id(), chargeB: id(),
    payA: id(), payAVoid: id(), allocA: id(), allocAVoid: id(),
  };

  const users = [
    f.userA, f.userA2, f.userViewer, f.userNullLink, f.userLinkInactive,
    f.userFamilyInactive, f.userGuardianInactive, f.userSuspended, f.userClosed,
    f.userPayerNoView, f.userPayerEnded, f.userPayerFuture,
  ];
  await db.execute(sql`
    insert into auth.users (id, email)
    values ${sql.join(
      users.map((userId) => sql`(${userId}::uuid, ${`ci-family-portal-${userId}@example.invalid`})`),
      sql`, `
    )}
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status, default_timezone, default_currency)
    values
      (${f.orgA}::uuid, ${`CI portal A ${suffix}`}, 'active', 'Europe/Madrid', 'EUR'),
      (${f.orgB}::uuid, ${`CI portal B ${suffix}`}, 'trial', 'America/Mexico_City', 'MXN'),
      (${f.orgSuspended}::uuid, ${`CI portal S ${suffix}`}, 'suspended', 'Europe/Madrid', 'EUR'),
      (${f.orgClosed}::uuid, ${`CI portal C ${suffix}`}, 'closed', 'Europe/Madrid', 'EUR')
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values
      (${f.siteNorth}::uuid, ${f.orgA}::uuid, ${`n-${suffix}`}, 'CI Sede Norte', 'Europe/Madrid'),
      (${f.siteSouth}::uuid, ${f.orgA}::uuid, ${`s-${suffix}`}, 'CI Sede Sur', 'Europe/Madrid'),
      (${f.siteB}::uuid, ${f.orgB}::uuid, ${`b-${suffix}`}, 'CI Sede B', 'America/Mexico_City'),
      (${f.siteSuspended}::uuid, ${f.orgSuspended}::uuid, ${`x-${suffix}`}, 'CI Sede S', 'Europe/Madrid'),
      (${f.siteClosed}::uuid, ${f.orgClosed}::uuid, ${`c-${suffix}`}, 'CI Sede C', 'Europe/Madrid')
  `);

  // Athletes: person id equals athlete id for readability.
  const athleteRows: Array<[string, string, string, boolean]> = [
    [f.ana, f.orgA, "Ana", true],
    [f.bruno, f.orgA, "Bruno", true],
    [f.fede, f.orgA, "Fede", true],
    [f.carla, f.orgA, "Carla", true],
    [f.ines, f.orgA, "Ines", true],
    [f.dani, f.orgB, "Dani", true],
    [f.olga, f.orgSuspended, "Olga", true],
    [f.pia, f.orgClosed, "Pia", true],
    [f.lia, f.orgA, "Lia", true],
  ];
  for (const [athleteId, organizationId, givenName, active] of athleteRows) {
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (${athleteId}::uuid, ${organizationId}::uuid, ${givenName}, 'Portal Prueba')
    `);
    await db.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id, is_active)
      values (${athleteId}::uuid, ${organizationId}::uuid, ${athleteId}::uuid, ${active})
    `);
  }

  // Guardians: [guardian, organization, auth user | null, active].
  const guardianRows: Array<[string, string, string | null, boolean]> = [
    [f.gA, f.orgA, f.userA, true],
    [f.gAinB, f.orgB, f.userA, true],
    [f.gA2, f.orgA, f.userA2, true],
    [f.gViewer, f.orgA, f.userViewer, true],
    [f.gNullLink, f.orgA, null, true],
    [f.gLinkInactive, f.orgA, f.userLinkInactive, true],
    [f.gFamilyInactive, f.orgA, f.userFamilyInactive, true],
    [f.gGuardianInactive, f.orgA, f.userGuardianInactive, false],
    [f.gSuspended, f.orgSuspended, f.userSuspended, true],
    [f.gClosed, f.orgClosed, f.userClosed, true],
    [f.gPayerNoView, f.orgA, f.userPayerNoView, true],
    [f.gPayerEnded, f.orgA, f.userPayerEnded, true],
    [f.gPayerFuture, f.orgA, f.userPayerFuture, true],
  ];
  for (const [guardianId, organizationId, authUserId, active] of guardianRows) {
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (${guardianId}::uuid, ${organizationId}::uuid, 'Tutor', 'Portal')
    `);
    await db.execute(sql`
      insert into zaltyko.guardians (id, organization_id, person_id, auth_user_id, is_active)
      values (${guardianId}::uuid, ${organizationId}::uuid, ${guardianId}::uuid, ${authUserId}::uuid, ${active})
    `);
  }

  await db.execute(sql`
    insert into zaltyko.families (id, organization_id, is_active)
    values
      (${f.famA}::uuid, ${f.orgA}::uuid, true),
      (${f.famA2}::uuid, ${f.orgA}::uuid, true),
      (${f.famInactive}::uuid, ${f.orgA}::uuid, false),
      (${f.famB}::uuid, ${f.orgB}::uuid, true),
      (${f.famSuspended}::uuid, ${f.orgSuspended}::uuid, true),
      (${f.famClosed}::uuid, ${f.orgClosed}::uuid, true)
  `);

  // Links: [organization, family, guardian, can view, active].
  const linkRows: Array<[string, string, string, boolean, boolean]> = [
    [f.orgA, f.famA, f.gA, true, true],
    [f.orgB, f.famB, f.gAinB, true, true],
    [f.orgA, f.famA2, f.gA2, true, true],
    [f.orgA, f.famA, f.gViewer, true, true],
    [f.orgA, f.famA, f.gNullLink, true, true],
    [f.orgA, f.famA, f.gLinkInactive, true, false],
    [f.orgA, f.famInactive, f.gFamilyInactive, true, true],
    [f.orgA, f.famA, f.gGuardianInactive, true, true],
    [f.orgSuspended, f.famSuspended, f.gSuspended, true, true],
    [f.orgClosed, f.famClosed, f.gClosed, true, true],
    // Production default today (owner-family-association.ts:719): payer
    // links are created with can_view_athletes = false.
    [f.orgA, f.famA, f.gPayerNoView, false, true],
    [f.orgA, f.famA, f.gPayerEnded, false, true],
    [f.orgA, f.famA, f.gPayerFuture, false, true],
  ];
  for (const [organizationId, familyId, guardianId, canView, active] of linkRows) {
    await db.execute(sql`
      insert into zaltyko.family_guardians (
        organization_id, family_id, guardian_id, relationship, can_view_athletes, is_active
      ) values (
        ${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, 'parent', ${canView}, ${active}
      )
    `);
  }

  // Payers: gA (A), gAinB (B), gA2 (A2), and revoked-access guardians that
  // must not regain fees through their payer row. gViewer is not a payer.
  // [organization, family, guardian, starts, ends].
  const payerRows: Array<[string, string, string, string, string | null]> = [
    [f.orgA, f.famA, f.gA, "2026-09-01", null],
    [f.orgB, f.famB, f.gAinB, "2026-09-01", null],
    [f.orgA, f.famA2, f.gA2, "2026-09-01", null],
    [f.orgA, f.famA, f.gLinkInactive, "2026-09-01", null],
    [f.orgA, f.famInactive, f.gFamilyInactive, "2026-09-01", null],
    [f.orgSuspended, f.famSuspended, f.gSuspended, "2026-09-01", null],
    [f.orgClosed, f.famClosed, f.gClosed, "2026-09-01", null],
    [f.orgA, f.famA, f.gPayerNoView, "2026-09-01", null],
    // Payer period already over, and one that has not started yet.
    [f.orgA, f.famA, f.gPayerEnded, "2026-01-01", "2026-10-31"],
    [f.orgA, f.famA, f.gPayerFuture, "2026-12-01", null],
  ];
  for (const [organizationId, familyId, guardianId, startsOn, endsOn] of payerRows) {
    await db.execute(sql`
      insert into zaltyko.family_payers (
        organization_id, family_id, guardian_id, is_primary, starts_on, ends_on
      ) values (
        ${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, false,
        ${startsOn}::date, ${endsOn}::date
      )
    `);
  }

  // Members: [organization, family, athlete, starts, ends].
  const memberRows: Array<[string, string, string, string, string | null]> = [
    [f.orgA, f.famA, f.ana, "2026-09-01", null],
    [f.orgA, f.famA, f.bruno, "2025-09-01", "2026-09-30"],
    [f.orgA, f.famA, f.fede, "2026-12-01", null],
    // Ana is shared: family A2 only since 15 October.
    [f.orgA, f.famA2, f.ana, "2026-10-15", null],
    [f.orgA, f.famA2, f.carla, "2026-09-01", null],
    [f.orgA, f.famInactive, f.ines, "2026-09-01", null],
    [f.orgB, f.famB, f.dani, "2026-09-01", null],
    [f.orgSuspended, f.famSuspended, f.olga, "2026-09-01", null],
    [f.orgClosed, f.famClosed, f.pia, "2026-09-01", null],
    // Membership that ends exactly today (2026-11-10 in Madrid).
    [f.orgA, f.famA, f.lia, "2026-09-01", "2026-11-10"],
  ];
  for (const [organizationId, familyId, athleteId, startsOn, endsOn] of memberRows) {
    await db.execute(sql`
      insert into zaltyko.family_members (
        organization_id, family_id, athlete_id, relationship, starts_on, ends_on
      ) values (
        ${organizationId}::uuid, ${familyId}::uuid, ${athleteId}::uuid, 'other',
        ${startsOn}::date, ${endsOn}::date
      )
    `);
  }

  await db.execute(sql`
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    ) values
      (${f.classNorth}::uuid, ${f.orgA}::uuid, ${f.siteNorth}::uuid, 'CI Iniciación', 12, 'active', '2026-09-01'),
      (${f.classSouth}::uuid, ${f.orgA}::uuid, ${f.siteSouth}::uuid, 'CI Base 3', 12, 'active', '2026-09-01'),
      (${f.classB}::uuid, ${f.orgB}::uuid, ${f.siteB}::uuid, 'CI Clase B', 12, 'active', '2026-08-01')
  `);
  await db.execute(sql`
    insert into zaltyko.class_template_weekdays (
      organization_id, class_template_id, iso_weekday, starts_at_local, ends_at_local
    ) values
      (${f.orgA}::uuid, ${f.classNorth}::uuid, 2, '17:30', '19:00'),
      (${f.orgA}::uuid, ${f.classSouth}::uuid, 3, '18:00', '19:30'),
      (${f.orgB}::uuid, ${f.classB}::uuid, 4, '16:00', '17:00')
  `);
  await db.execute(sql`
    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id, status, starts_on, source
    ) values
      (${f.enrAna}::uuid, ${f.orgA}::uuid, ${f.siteNorth}::uuid, ${f.ana}::uuid, ${f.classNorth}::uuid, 'active', '2026-09-01', 'owner'),
      (${f.enrCarla}::uuid, ${f.orgA}::uuid, ${f.siteSouth}::uuid, ${f.carla}::uuid, ${f.classSouth}::uuid, 'active', '2026-09-01', 'owner'),
      (${f.enrDani}::uuid, ${f.orgB}::uuid, ${f.siteB}::uuid, ${f.dani}::uuid, ${f.classB}::uuid, 'active', '2026-08-01', 'owner')
  `);
  // Sessions: [id, organization, site, class, starts, ends, status].
  const sessionRows: Array<[string, string, string, string, string, string, string]> = [
    [f.sAnaSep, f.orgA, f.siteNorth, f.classNorth, "2026-09-22T15:30:00Z", "2026-09-22T17:00:00Z", "completed"],
    [f.sAnaOct, f.orgA, f.siteNorth, f.classNorth, "2026-10-20T15:30:00Z", "2026-10-20T17:00:00Z", "completed"],
    [f.sAnaNext, f.orgA, f.siteNorth, f.classNorth, "2026-11-10T16:30:00Z", "2026-11-10T18:00:00Z", "scheduled"],
    [f.sCarlaOct, f.orgA, f.siteSouth, f.classSouth, "2026-10-21T16:00:00Z", "2026-10-21T17:30:00Z", "completed"],
    [f.sCarlaNext, f.orgA, f.siteSouth, f.classSouth, "2026-11-11T17:00:00Z", "2026-11-11T18:30:00Z", "scheduled"],
    // 2026-08-20 16:00 in Mexico City: before Dani joined family B.
    [f.sDaniAug, f.orgB, f.siteB, f.classB, "2026-08-20T22:00:00Z", "2026-08-20T23:00:00Z", "completed"],
    [f.sDaniOct, f.orgB, f.siteB, f.classB, "2026-10-01T22:00:00Z", "2026-10-01T23:00:00Z", "completed"],
  ];
  for (const [sessionId, organizationId, locationId, classId, startsAt, endsAt, status] of sessionRows) {
    await db.execute(sql`
      insert into zaltyko.sessions (
        id, organization_id, location_id, class_template_id, status, starts_at, ends_at
      ) values (
        ${sessionId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${classId}::uuid,
        ${status}::zaltyko.session_status, ${startsAt}::timestamptz, ${endsAt}::timestamptz
      )
    `);
  }
  // Attendance: [organization, site, session, enrollment, athlete, status].
  const attendanceRows: Array<[string, string, string, string, string, string]> = [
    [f.orgA, f.siteNorth, f.sAnaSep, f.enrAna, f.ana, "present"],
    [f.orgA, f.siteNorth, f.sAnaOct, f.enrAna, f.ana, "late"],
    [f.orgA, f.siteSouth, f.sCarlaOct, f.enrCarla, f.carla, "absent"],
    [f.orgB, f.siteB, f.sDaniAug, f.enrDani, f.dani, "absent"],
    [f.orgB, f.siteB, f.sDaniOct, f.enrDani, f.dani, "present"],
  ];
  for (const [organizationId, locationId, sessionId, enrollmentId, athleteId, status] of attendanceRows) {
    await db.execute(sql`
      insert into zaltyko.attendance_records (
        organization_id, location_id, session_id, enrollment_id, athlete_id, status
      ) values (
        ${organizationId}::uuid, ${locationId}::uuid, ${sessionId}::uuid, ${enrollmentId}::uuid,
        ${athleteId}::uuid, ${status}::zaltyko.attendance_status
      )
    `);
  }

  // Invoices: [id, organization, site, family, reference, status, currency, total].
  const invoiceRows: Array<[string, string, string, string, string, string, string, number]> = [
    [f.invA, f.orgA, f.siteNorth, f.famA, `CI-A-${suffix}`, "partially_paid", "EUR", 4500],
    [f.invADraft, f.orgA, f.siteNorth, f.famA, `CI-A-DRAFT-${suffix}`, "draft", "EUR", 1000],
    [f.invAVoid, f.orgA, f.siteNorth, f.famA, `CI-A-VOID-${suffix}`, "void", "EUR", 1000],
    [f.invA2, f.orgA, f.siteSouth, f.famA2, `CI-A2-${suffix}`, "issued", "EUR", 3900],
    [f.invB, f.orgB, f.siteB, f.famB, `CI-B-${suffix}`, "issued", "MXN", 30000],
  ];
  for (const [invoiceId, organizationId, locationId, familyId, reference, status, currency, total] of invoiceRows) {
    await db.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values (
        ${invoiceId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${familyId}::uuid,
        ${reference}, ${status}::zaltyko.invoice_status, ${currency}, ${total},
        '2026-11-01T08:00:00Z', '2026-11-05T23:00:00Z', ${`ci-portal-${invoiceId}`}
      )
    `);
  }
  // Lines and charges: [line, charge, invoice, organization, site, family, status, amount, currency].
  const chargeRows: Array<[string, string, string, string, string, string, string, number, string]> = [
    [f.lineA, f.chargeA, f.invA, f.orgA, f.siteNorth, f.famA, "partially_paid", 4500, "EUR"],
    [f.lineAVoid, f.chargeAVoid, f.invA, f.orgA, f.siteNorth, f.famA, "void", 1000, "EUR"],
    [f.lineA2, f.chargeA2, f.invA2, f.orgA, f.siteSouth, f.famA2, "due", 3900, "EUR"],
    [f.lineB, f.chargeB, f.invB, f.orgB, f.siteB, f.famB, "due", 30000, "MXN"],
  ];
  for (const [lineId, chargeId, invoiceId, organizationId, locationId, familyId, status, amount, currency] of chargeRows) {
    await db.execute(sql`
      insert into zaltyko.invoice_lines (
        id, organization_id, invoice_id, location_id, line_type, quantity,
        unit_amount_cents, amount_cents, currency, service_period_start, service_period_end
      ) values (
        ${lineId}::uuid, ${organizationId}::uuid, ${invoiceId}::uuid, ${locationId}::uuid,
        'ci_portal_fee', 1, ${amount}, ${amount}, ${currency}, '2026-11-01', '2026-11-30'
      )
    `);
    await db.execute(sql`
      insert into zaltyko.charges (
        id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
        status, amount_cents, currency, due_at, service_period_start, service_period_end,
        idempotency_key
      ) values (
        ${chargeId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${invoiceId}::uuid,
        ${lineId}::uuid, ${familyId}::uuid, ${status}::zaltyko.charge_status, ${amount},
        ${currency}, '2026-11-05T23:00:00Z', '2026-11-01', '2026-11-30',
        ${`ci-portal-charge-${chargeId}`}
      )
    `);
  }
  // Payments on family A: 2500 to the live charge, 1000 to the voided one.
  for (const [paymentId, allocationId, chargeId, amount] of [
    [f.payA, f.allocA, f.chargeA, 2500],
    [f.payAVoid, f.allocAVoid, f.chargeAVoid, 1000],
  ] as const) {
    await db.execute(sql`
      insert into zaltyko.payments (
        id, organization_id, location_id, family_id, status, amount_cents, currency,
        processor, environment, provider_payment_id, received_at, idempotency_key
      ) values (
        ${paymentId}::uuid, ${f.orgA}::uuid, ${f.siteNorth}::uuid, ${f.famA}::uuid,
        'succeeded', ${amount}, 'EUR', 'local', 'sandbox', ${`ci-portal-pay-${paymentId}`},
        '2026-11-03T10:00:00Z', ${`ci-portal-pay-${paymentId}`}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.payment_allocations (
        id, organization_id, payment_id, charge_id, amount_cents, currency,
        allocated_at, idempotency_key
      ) values (
        ${allocationId}::uuid, ${f.orgA}::uuid, ${paymentId}::uuid, ${chargeId}::uuid,
        ${amount}, 'EUR', '2026-11-03T10:00:00Z', ${`ci-portal-alloc-${allocationId}`}
      )
    `);
  }
  // Refunds on the live allocation: 500 succeeded counts, 300 failed does not.
  for (const [status, amount] of [["succeeded", 500], ["failed", 300]] as const) {
    const refundId = id();
    await db.execute(sql`
      insert into zaltyko.refunds (
        id, organization_id, payment_id, payment_allocation_id, status, amount_cents,
        currency, processor, environment, provider_refund_id, reason_code, refunded_at,
        idempotency_key
      ) values (
        ${refundId}::uuid, ${f.orgA}::uuid, ${f.payA}::uuid, ${f.allocA}::uuid,
        ${status}::zaltyko.refund_status, ${amount}, 'EUR', 'local', 'sandbox',
        ${`ci-portal-refund-${refundId}`}, 'requested_by_customer', '2026-11-04T10:00:00Z',
        ${`ci-portal-refund-${refundId}`}
      )
    `);
  }

  return f;
}

async function notFound(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toMatchObject({ code: "NOT_FOUND", status: 404 });
}

/** Attendance ids the SQL guard alone admits (no in-memory filtering). */
async function guardedAttendanceIds(userId: string, athleteId: string) {
  const rows = await db
    .select({ sessionId: attendanceRecords.sessionId })
    .from(attendanceRecords)
    .innerJoin(
      sessions,
      and(
        eq(sessions.organizationId, attendanceRecords.organizationId),
        eq(sessions.id, attendanceRecords.sessionId)
      )
    )
    .where(
      and(
        eq(attendanceRecords.athleteId, athleteId),
        familyCanViewAthlete({
          userId,
          now: NOW,
          organizationRef: attendanceRecords.organizationId,
          athleteRef: attendanceRecords.athleteId,
          sinceRef: sessions.startsAt,
        })
      )
    );
  return rows.map((row) => row.sessionId).sort();
}

describeDisposablePg("Family portal isolation on disposable PostgreSQL", () => {
  it("shows each account exactly its own athletes, history and fees", async () => {
    assertDisposableTarget();
    const f = await seedFixture();

    // Guardian in two academies: A (ana, fees of A) and B (dani, fees of B).
    const accessA = await resolveFamilyPortalAccess({ userId: f.userA, now: NOW });
    expect(accessA.academies).toEqual([
      {
        organizationId: f.orgA,
        organizationName: `CI portal A ${f.suffix}`,
        timezone: "Europe/Madrid",
        defaultCurrency: "EUR",
        feeFamilyIds: [f.famA],
        athletes: [
          { athleteId: f.ana, displayName: "Ana Portal", visibleSince: "2026-09-01" },
          { athleteId: f.lia, displayName: "Lia Portal", visibleSince: "2026-09-01" },
        ],
      },
      {
        organizationId: f.orgB,
        organizationName: `CI portal B ${f.suffix}`,
        timezone: "America/Mexico_City",
        defaultCurrency: "MXN",
        feeFamilyIds: [f.famB],
        athletes: [{ athleteId: f.dani, displayName: "Dani Portal", visibleSince: "2026-09-01" }],
      },
    ]);

    // Second family in the same academy shares Ana only since 15 October.
    const accessA2 = await resolveFamilyPortalAccess({ userId: f.userA2, now: NOW });
    expect(accessA2.academies).toEqual([
      expect.objectContaining({
        organizationId: f.orgA,
        feeFamilyIds: [f.famA2],
        athletes: [
          { athleteId: f.ana, displayName: "Ana Portal", visibleSince: "2026-10-15" },
          { athleteId: f.carla, displayName: "Carla Portal", visibleSince: "2026-09-01" },
        ],
      }),
    ]);

    // Viewer without payer row: athletes yes, fees no.
    const accessViewer = await resolveFamilyPortalAccess({ userId: f.userViewer, now: NOW });
    expect(accessViewer.academies).toEqual([
      expect.objectContaining({
        organizationId: f.orgA,
        feeFamilyIds: [],
        athletes: [
          expect.objectContaining({ athleteId: f.ana }),
          expect.objectContaining({ athleteId: f.lia }),
        ],
      }),
    ]);
    expect(await getFamilyFees({ userId: f.userViewer, now: NOW })).toEqual([]);

    // Overview of Ana for family A: full history since 1 September.
    const anaForA = await getFamilyAthleteOverview({ userId: f.userA, athleteId: f.ana, now: NOW });
    expect(anaForA.classes.map((item) => [item.classTemplateId, item.className, item.locationName])).toEqual([
      [f.classNorth, "CI Iniciación", "CI Sede Norte"],
    ]);
    expect(anaForA.classes[0].weekdays).toEqual([
      { isoWeekday: 2, startsAtLocal: "17:30:00", endsAtLocal: "19:00:00" },
    ]);
    expect(anaForA.upcomingSessions.map((item) => item.sessionId)).toEqual([f.sAnaNext]);
    expect(anaForA.attendance.map((item) => [item.status, item.className])).toEqual([
      ["late", "CI Iniciación"],
      ["present", "CI Iniciación"],
    ]);

    // Same athlete for family A2: nothing before 15 October.
    const anaForA2 = await getFamilyAthleteOverview({ userId: f.userA2, athleteId: f.ana, now: NOW });
    expect(anaForA2.attendance.map((item) => item.status)).toEqual(["late"]);
    expect(anaForA2.upcomingSessions.map((item) => item.sessionId)).toEqual([f.sAnaNext]);
    expect(await guardedAttendanceIds(f.userA2, f.ana)).toEqual([f.sAnaOct]);
    expect(await guardedAttendanceIds(f.userA, f.ana)).toEqual([f.sAnaOct, f.sAnaSep].sort());

    const carlaForA2 = await getFamilyAthleteOverview({ userId: f.userA2, athleteId: f.carla, now: NOW });
    expect(carlaForA2.attendance.map((item) => item.status)).toEqual(["absent"]);
    expect(carlaForA2.upcomingSessions.map((item) => item.sessionId)).toEqual([f.sCarlaNext]);

    // Other academy: Dani's August record predates the membership.
    const daniForA = await getFamilyAthleteOverview({ userId: f.userA, athleteId: f.dani, now: NOW });
    expect(daniForA.attendance.map((item) => item.status)).toEqual(["present"]);
    expect(await guardedAttendanceIds(f.userA, f.dani)).toEqual([f.sDaniOct]);

    // Cross-family, cross-academy, past, future and unknown ids: 404.
    for (const [userId, athleteId] of [
      [f.userA, f.carla],
      [f.userA, f.bruno],
      [f.userA, f.fede],
      [f.userA, f.ines],
      [f.userA, f.olga],
      [f.userA, f.pia],
      [f.userA, id()],
      [f.userA2, f.dani],
      [f.userA2, f.bruno],
    ]) {
      await notFound(getFamilyAthleteOverview({ userId, athleteId, now: NOW }));
      expect(await guardedAttendanceIds(userId, athleteId)).toEqual([]);
    }

    // Fees: only issued/partially paid/paid of the families each account pays.
    expect(await getFamilyFees({ userId: f.userA, now: NOW })).toEqual([
      {
        organizationId: f.orgA,
        organizationName: `CI portal A ${f.suffix}`,
        timezone: "Europe/Madrid",
        fees: [
          {
            invoiceId: f.invA,
            reference: `CI-A-${f.suffix}`,
            status: "partially_paid",
            currency: "EUR",
            totalCents: 4500,
            paidCents: 2000,
            refundedCents: 500,
            pendingCents: 2000,
            dueAt: "2026-11-05T23:00:00.000Z",
            periodStart: "2026-11-01",
            periodEnd: "2026-11-30",
          },
        ],
      },
      {
        organizationId: f.orgB,
        organizationName: `CI portal B ${f.suffix}`,
        timezone: "America/Mexico_City",
        fees: [
          {
            invoiceId: f.invB,
            reference: `CI-B-${f.suffix}`,
            status: "issued",
            currency: "MXN",
            totalCents: 30000,
            paidCents: 0,
            refundedCents: 0,
            pendingCents: 30000,
            dueAt: "2026-11-05T23:00:00.000Z",
            periodStart: "2026-11-01",
            periodEnd: "2026-11-30",
          },
        ],
      },
    ]);
    expect(
      (await getFamilyFees({ userId: f.userA2, now: NOW })).flatMap((academy) =>
        academy.fees.map((fee) => fee.invoiceId)
      )
    ).toEqual([f.invA2]);
  });

  it("applies payer periods and today's membership end like production data", async () => {
    assertDisposableTarget();
    const f = await seedFixture();

    // Production default: payer link with can_view_athletes = false.
    const payerNoView = await resolveFamilyPortalAccess({ userId: f.userPayerNoView, now: NOW });
    expect(payerNoView.academies).toEqual([
      {
        organizationId: f.orgA,
        organizationName: `CI portal A ${f.suffix}`,
        timezone: "Europe/Madrid",
        defaultCurrency: "EUR",
        feeFamilyIds: [f.famA],
        athletes: [],
      },
    ]);
    expect(
      (await getFamilyFees({ userId: f.userPayerNoView, now: NOW })).flatMap((academy) =>
        academy.fees.map((fee) => [fee.invoiceId, fee.paidCents, fee.pendingCents])
      )
    ).toEqual([[f.invA, 2000, 2000]]);
    for (const athleteId of [f.ana, f.lia]) {
      await notFound(getFamilyAthleteOverview({ userId: f.userPayerNoView, athleteId, now: NOW }));
      expect(await guardedAttendanceIds(f.userPayerNoView, athleteId)).toEqual([]);
    }

    // Payer period over (ended 31 October) or not started (1 December).
    for (const userId of [f.userPayerEnded, f.userPayerFuture]) {
      expect((await resolveFamilyPortalAccess({ userId, now: NOW })).academies).toEqual([]);
      expect(await getFamilyFees({ userId, now: NOW })).toEqual([]);
      await notFound(getFamilyAthleteOverview({ userId, athleteId: f.ana, now: NOW }));
    }
    // The future payer gains the fees once the period starts.
    const afterStart = new Date("2026-12-01T09:00:00.000Z");
    expect(
      (await getFamilyFees({ userId: f.userPayerFuture, now: afterStart })).map(
        (academy) => academy.organizationId
      )
    ).toEqual([f.orgA]);

    // Lia's membership ends today: visible all of 10 November (Madrid), gone on the 11th.
    const lastDay = await getFamilyAthleteOverview({ userId: f.userA, athleteId: f.lia, now: NOW });
    expect(lastDay.athlete).toEqual({ athleteId: f.lia, displayName: "Lia Portal", visibleSince: "2026-09-01" });
    const lateEvening = new Date("2026-11-10T22:30:00.000Z"); // 23:30 in Madrid
    expect(
      (await resolveFamilyPortalAccess({ userId: f.userA, now: lateEvening })).academies[0].athletes.map(
        (athlete) => athlete.athleteId
      )
    ).toEqual([f.ana, f.lia]);
    const nextDay = new Date("2026-11-10T23:30:00.000Z"); // 00:30 on the 11th in Madrid
    await notFound(getFamilyAthleteOverview({ userId: f.userA, athleteId: f.lia, now: nextDay }));
    expect(
      (await resolveFamilyPortalAccess({ userId: f.userA, now: nextDay })).academies[0].athletes.map(
        (athlete) => athlete.athleteId
      )
    ).toEqual([f.ana]);
  });

  it("revoked, inactive, suspended and closed access sees nothing", async () => {
    assertDisposableTarget();
    const f = await seedFixture();

    for (const [userId, athleteId] of [
      [f.userNullLink, f.ana],
      [f.userLinkInactive, f.ana],
      [f.userFamilyInactive, f.ines],
      [f.userGuardianInactive, f.ana],
      [f.userSuspended, f.olga],
      [f.userClosed, f.pia],
    ]) {
      const access = await resolveFamilyPortalAccess({ userId, now: NOW });
      expect(access.academies).toEqual([]);
      expect(await getFamilyFees({ userId, now: NOW })).toEqual([]);
      await notFound(getFamilyAthleteOverview({ userId, athleteId, now: NOW }));
      expect(await guardedAttendanceIds(userId, athleteId)).toEqual([]);
    }

    // Revoking a working account takes effect on the next request.
    expect((await resolveFamilyPortalAccess({ userId: f.userViewer, now: NOW })).academies).toHaveLength(1);
    await db.execute(sql`
      update zaltyko.guardians set auth_user_id = null
      where organization_id = ${f.orgA}::uuid and id = ${f.gViewer}::uuid
    `);
    expect((await resolveFamilyPortalAccess({ userId: f.userViewer, now: NOW })).academies).toEqual([]);
    await notFound(getFamilyAthleteOverview({ userId: f.userViewer, athleteId: f.ana, now: NOW }));

    // Deactivating family A's link removes Ana and the fees from user A in A only.
    await db.execute(sql`
      update zaltyko.family_guardians set is_active = false
      where organization_id = ${f.orgA}::uuid and family_id = ${f.famA}::uuid and guardian_id = ${f.gA}::uuid
    `);
    const accessA = await resolveFamilyPortalAccess({ userId: f.userA, now: NOW });
    expect(accessA.academies.map((academy) => academy.organizationId)).toEqual([f.orgB]);
    expect(await guardedAttendanceIds(f.userA, f.ana)).toEqual([]);
    expect(
      (await getFamilyFees({ userId: f.userA, now: NOW })).map((academy) => academy.organizationId)
    ).toEqual([f.orgB]);
  });
});
