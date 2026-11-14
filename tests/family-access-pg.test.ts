import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// El correo es lo único simulado: el resto son los servicios y la base reales.
const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; template?: string; dedupeKey?: string; subject: string }>, failNext: 0 }));
vi.mock("@/lib/email/email-service", () => ({
  sendEmailWithLogging: vi.fn(async (options: { to: string; template?: string; dedupeKey?: string; subject: string }) => {
    if (mail.failNext > 0) {
      mail.failNext -= 1;
      return false;
    }
    mail.sent.push(options);
    return true;
  }),
}));

import { db } from "@/db";
import { isFamilyAccessStorageAvailable } from "@/modules/family-access/application/family-access-storage";
import {
  acceptFamilyInvitation,
  inspectFamilyInvitation,
  listOwnerFamilyAccess,
  runFamilyAccessCommand,
} from "@/modules/family-access/application/guardian-invitations";
import {
  changeSessionAndNotify,
  deliverNoticeEmails,
  getOwnerNoticesBundle,
  notifySessionSubstitution,
  sendManualNotice,
} from "@/modules/family-access/application/family-notices";
import {
  listFamilyNotices,
  markFamilyNoticesRead,
  setFamilyNotificationPreferences,
} from "@/modules/family-access/application/family-notice-reads";

/**
 * Familias: alta por invitación y avisos de sesión sobre PostgreSQL desechable
 * de GitHub. Instala el candidato solo aquí, después de los guardas, y borra
 * sus tablas al terminar. Cubre: función dormida (503), RLS/REVOKE, token con
 * hash, correo verificado, caducidad, reenvío con espera, revocación, correo
 * cambiado, una familia nunca ve avisos ni preferencias de otra (ni de otra
 * academia), permiso de ver gimnastas, preferencia de correo, idempotencia de
 * cancelaciones, cambios de hora, sustituciones y avisos manuales, y retirada
 * de acceso.
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
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some((value) => value !== connection)
  ) {
    throw new Error("Disposable GitHub Linux loopback Postgres is required");
  }
  for (const name of [
    "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY", "E2E_TARGET_SUPABASE_PROJECT_REF", "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY", "VERCEL_TOKEN",
  ]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const TABLES = ["family_notice_recipients", "family_notices", "guardian_notification_preferences", "guardian_access_invitations"] as const;
const candidate = () =>
  readFileSync(resolve(process.cwd(), "docs/deployment/candidates/20261114120000_family_access_notices_candidate.sql"), "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const key = () => `family-ci-${randomUUID()}`;

type Actor = { userId: string; memberId: string };

async function authUser(email: string): Promise<string> {
  const userId = randomUUID();
  await db.execute(sql`insert into auth.users (id, email, email_confirmed_at) values (${userId}::uuid, ${email}, now())`);
  await db.execute(sql`insert into auth.identities (provider_id, user_id, identity_data, provider)
    values (${`email-${userId}`}, ${userId}::uuid, ${JSON.stringify({ sub: userId, email })}::jsonb, 'email')`);
  return userId;
}

async function academy(label: string) {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  await db.execute(sql`insert into zaltyko.organizations (id, name, status, default_timezone)
    values (${organizationId}::uuid, ${`CI familias ${label}`}, 'active', 'Europe/Madrid')`);
  await db.execute(sql`insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
    values (${locationId}::uuid, ${organizationId}::uuid, ${`ci-fam-${organizationId.slice(0, 8)}`}, ${`Sede ${label}`}, 'Europe/Madrid', true)`);
  return { organizationId, locationId };
}

async function member(organizationId: string, role: "owner" | "manager", scope: "all" | "selected", locationIds: string[] = []): Promise<Actor> {
  const userId = await authUser(`ci-fam-staff-${randomUUID()}@example.invalid`);
  const memberId = randomUUID();
  await db.execute(sql`insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
    values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, ${role}, 'active', ${scope})`);
  for (const locationId of locationIds) {
    await db.execute(sql`insert into zaltyko.member_location_scopes (organization_id, member_id, location_id)
      values (${organizationId}::uuid, ${memberId}::uuid, ${locationId}::uuid)`);
  }
  return { userId, memberId };
}

async function person(organizationId: string, givenName: string) {
  const id = randomUUID();
  await db.execute(sql`insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (${id}::uuid, ${organizationId}::uuid, ${givenName}, 'Prueba')`);
  return id;
}

/** Familia con una gimnasta y un tutor (vínculo activo sin permiso de ver, como /owner hoy). */
async function family(organizationId: string, athleteName: string, guardianName: string, email: string | null) {
  const athletePerson = await person(organizationId, athleteName);
  const athleteId = randomUUID();
  await db.execute(sql`insert into zaltyko.athletes (id, organization_id, person_id, is_active)
    values (${athleteId}::uuid, ${organizationId}::uuid, ${athletePerson}::uuid, true)`);
  const familyId = randomUUID();
  await db.execute(sql`insert into zaltyko.families (id, organization_id, is_active) values (${familyId}::uuid, ${organizationId}::uuid, true)`);
  await db.execute(sql`insert into zaltyko.family_members (organization_id, family_id, athlete_id, relationship, starts_on)
    values (${organizationId}::uuid, ${familyId}::uuid, ${athleteId}::uuid, 'other', '2026-01-01')`);
  const guardianId = await guardian(organizationId, familyId, guardianName, email);
  return { athleteId, familyId, guardianId };
}

async function guardian(organizationId: string, familyId: string, name: string, email: string | null) {
  const guardianPerson = await person(organizationId, name);
  const guardianId = randomUUID();
  await db.execute(sql`insert into zaltyko.guardians (id, organization_id, person_id, is_active)
    values (${guardianId}::uuid, ${organizationId}::uuid, ${guardianPerson}::uuid, true)`);
  await db.execute(sql`insert into zaltyko.family_guardians (organization_id, family_id, guardian_id, relationship, can_view_athletes, is_active)
    values (${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, 'parent', false, true)`);
  if (email) {
    await db.execute(sql`insert into zaltyko.guardian_contacts (organization_id, guardian_id, kind, value, normalized_value, is_primary)
      values (${organizationId}::uuid, ${guardianId}::uuid, 'email', ${email}, ${email.toLowerCase()}, true)`);
  }
  return guardianId;
}

async function classTemplate(organizationId: string, locationId: string, name: string) {
  const id = randomUUID();
  await db.execute(sql`insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${name}, 12, 'active', '2026-01-01')`);
  return id;
}

async function enroll(organizationId: string, locationId: string, classTemplateId: string, athleteId: string) {
  await db.execute(sql`insert into zaltyko.enrollments (organization_id, location_id, athlete_id, class_template_id, status, starts_on, source)
    values (${organizationId}::uuid, ${locationId}::uuid, ${athleteId}::uuid, ${classTemplateId}::uuid, 'active', '2026-01-01', 'owner')`);
}

async function session(organizationId: string, locationId: string, classTemplateId: string, days: number) {
  const id = randomUUID();
  const startsAt = new Date(Date.now() + days * 86_400_000);
  startsAt.setUTCHours(16, 30, 0, 0);
  await db.execute(sql`insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${classTemplateId}::uuid, 'scheduled',
      ${startsAt.toISOString()}::timestamptz, ${startsAt.toISOString()}::timestamptz + interval '90 minutes')`);
  return { id, startsAt };
}

function tokenOf(link: string | null): string {
  const match = /#token=([A-Za-z0-9_-]{43})$/.exec(link ?? "");
  if (!match) throw new Error("La invitación no devolvió un enlace con token");
  return match[1]!;
}

async function recipients(noticeId: string) {
  const result = await db.execute(sql`select guardian_id::text, email_status from zaltyko.family_notice_recipients
    where notice_id = ${noticeId}::uuid order by guardian_id`);
  return result.rows as Array<{ guardian_id: string; email_status: string }>;
}

describe.skipIf(!disposablePgEnabled)("acceso de familias y avisos en PostgreSQL desechable", () => {
  const previousFlag = process.env.ZALTYKO_FAMILY_ACCESS_ENABLED;
  let createdIdentitiesStub = false;
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let ownerA: Actor;
  let ownerB: Actor;
  let managerA: Actor;
  let ana: Awaited<ReturnType<typeof family>>;
  let bea: Awaited<ReturnType<typeof family>>;
  let zoe: Awaited<ReturnType<typeof family>>;
  let noMailGuardian: string;
  let userAna: string;
  let userBea: string;
  let userZoe: string;
  let intruder: string;
  let classA: string;
  let groupA: string;
  const emailAna = `ci-fam-ana-${randomUUID()}@example.invalid`;
  const emailBea = `ci-fam-bea-${randomUUID()}@example.invalid`;
  const emailZoe = `ci-fam-zoe-${randomUUID()}@example.invalid`;
  const scopeA = () => ({ organizationId: a.organizationId, locationId: a.locationId });

  beforeAll(async () => {
    assertDisposableTarget();
    // Mismo stub mínimo de Auth que tests/canonical-team-access-pg.test.ts,
    // solo en la base desechable y después de todos los guardas.
    await db.execute(sql`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
    const existing = await db.execute(sql`select to_regclass('auth.identities') is not null as present`);
    createdIdentitiesStub = (existing.rows[0] as { present: boolean }).present !== true;
    await db.execute(sql`create table if not exists auth.identities (
      id uuid primary key default gen_random_uuid(),
      provider_id text not null,
      user_id uuid not null,
      identity_data jsonb not null,
      provider text not null,
      unique (provider_id, provider))`);

    a = await academy("A");
    b = await academy("B");
    ownerA = await member(a.organizationId, "owner", "all");
    ownerB = await member(b.organizationId, "owner", "all");
    managerA = await member(a.organizationId, "manager", "selected", [a.locationId]);
    ana = await family(a.organizationId, "Ana", "Madre Ana", emailAna);
    bea = await family(a.organizationId, "Bea", "Padre Bea", emailBea);
    noMailGuardian = await guardian(a.organizationId, ana.familyId, "Abuela Ana", null);
    zoe = await family(b.organizationId, "Zoe", "Madre Zoe", emailZoe);
    userAna = await authUser(emailAna);
    userBea = await authUser(emailBea);
    userZoe = await authUser(emailZoe);
    intruder = await authUser(`ci-fam-intruso-${randomUUID()}@example.invalid`);
    classA = await classTemplate(a.organizationId, a.locationId, "CI Base 3");
    await enroll(a.organizationId, a.locationId, classA, ana.athleteId);
    await enroll(a.organizationId, a.locationId, classA, bea.athleteId);
    groupA = randomUUID();
    await db.execute(sql`insert into zaltyko.groups (id, organization_id, location_id, name, status)
      values (${groupA}::uuid, ${a.organizationId}::uuid, ${a.locationId}::uuid, 'CI Grupo Ana', 'active')`);
    await db.execute(sql`insert into zaltyko.group_memberships (organization_id, group_id, athlete_id, status, starts_on)
      values (${a.organizationId}::uuid, ${groupA}::uuid, ${ana.athleteId}::uuid, 'active', '2026-01-01')`);

    // Dormida: con la bandera apagada, 503 sin tocar nada.
    delete process.env.ZALTYKO_FAMILY_ACCESS_ENABLED;
    await expect(listOwnerFamilyAccess({ ...scopeA(), actor: ownerA })).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    // Con la bandera y sin el candidato, también 503.
    process.env.ZALTYKO_FAMILY_ACCESS_ENABLED = "true";
    expect(await isFamilyAccessStorageAvailable(db)).toBe(false);
    await expect(listOwnerFamilyAccess({ ...scopeA(), actor: ownerA })).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    // El preflight rechaza una relación parcial antes de tocar nada.
    await expect(db.transaction(async (tx) => {
      await tx.execute(sql`create table zaltyko.family_notices (id uuid)`);
      await tx.execute(sql.raw(candidate()));
    })).rejects.toThrow(/all four new relations absent/);
    await db.execute(sql.raw(candidate()));
    expect(await isFamilyAccessStorageAvailable(db)).toBe(true);
  }, 60_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    await db.transaction(async (tx) => {
      for (const table of TABLES) await tx.execute(sql.raw(`drop table if exists zaltyko.${table}`));
    });
    if (createdIdentitiesStub) await db.execute(sql`drop table if exists auth.identities`);
    if (previousFlag === undefined) delete process.env.ZALTYKO_FAMILY_ACCESS_ENABLED;
    else process.env.ZALTYKO_FAMILY_ACCESS_ENABLED = previousFlag;
  });

  it("fuerza RLS y niega el acceso directo de anon y authenticated", async () => {
    const result = await db.execute(sql`select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'zaltyko' and c.relname in (${sql.join(TABLES.map((table) => sql`${table}`), sql`,`)})
      order by c.relname`);
    expect(result.rows).toHaveLength(4);
    for (const row of result.rows as Array<Record<string, boolean>>) {
      expect(row.relrowsecurity && row.relforcerowsecurity).toBe(true);
      expect(row.anon_access || row.authenticated_access).toBe(false);
    }
  });

  it("solo la dirección con todas las sedes gestiona el acceso; otra academia, nunca", async () => {
    await expect(listOwnerFamilyAccess({ ...scopeA(), actor: managerA })).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    await expect(listOwnerFamilyAccess({ ...scopeA(), actor: ownerB })).rejects.toMatchObject({ status: 403 });
    await expect(runFamilyAccessCommand({ actor: ownerB, idempotencyKey: key(), command: { ...scopeA(), action: "invite", guardianId: ana.guardianId, grantViewAthletes: true } }))
      .rejects.toMatchObject({ status: 403 });
    // Un tutor de otra academia no existe para A.
    await expect(runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "invite", guardianId: zoe.guardianId, grantViewAthletes: true } }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("invita, guarda solo el hash y acepta solo con el correo verificado de la invitación", async () => {
    const clientKey = key();
    const invited = await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: clientKey, command: { ...scopeA(), action: "invite", guardianId: ana.guardianId, grantViewAthletes: true } });
    const token = tokenOf(invited.link);
    expect(invited.emailSent).toBe(true);
    expect(mail.sent[mail.sent.length - 1]?.to).toBe(emailAna);
    expect(mail.sent[mail.sent.length - 1]?.template).toBe("family_portal_invitation");
    // Repetir el comando no crea otra invitación ni devuelve otro enlace.
    const replay = await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: clientKey, command: { ...scopeA(), action: "invite", guardianId: ana.guardianId, grantViewAthletes: true } });
    expect(replay).toMatchObject({ replayed: true, link: null, invitationId: invited.invitationId });
    const stored = await db.execute(sql`select token_sha256 from zaltyko.guardian_access_invitations where guardian_id = ${ana.guardianId}::uuid`);
    expect(stored.rows).toEqual([{ token_sha256: sha(token) }]);
    const leaked = await db.execute(sql`select count(*)::int as count from zaltyko.audit_log
      where organization_id = ${a.organizationId}::uuid and (metadata::text like ${`%${token}%`} or coalesce(after::text, '') like ${`%${token}%`})`);
    expect((leaked.rows[0] as { count: number }).count).toBe(0);

    await expect(inspectFamilyInvitation({ userId: intruder, token })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(acceptFamilyInvitation({ userId: intruder, token })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await inspectFamilyInvitation({ userId: userAna, token })).toEqual({ academyName: "CI familias A", grantViewAthletes: true });
    expect(await acceptFamilyInvitation({ userId: userAna, token })).toEqual({ academyName: "CI familias A", replayed: false });
    expect(await acceptFamilyInvitation({ userId: userAna, token })).toEqual({ academyName: "CI familias A", replayed: true });

    const linked = await db.execute(sql`select g.auth_user_id::text, fg.can_view_athletes from zaltyko.guardians g
      join zaltyko.family_guardians fg on fg.organization_id = g.organization_id and fg.guardian_id = g.id
      where g.id = ${ana.guardianId}::uuid`);
    expect(linked.rows).toEqual([{ auth_user_id: userAna, can_view_athletes: true }]);
    const list = await listOwnerFamilyAccess({ ...scopeA(), actor: ownerA });
    expect(list.guardians.find((row) => row.guardianId === ana.guardianId)).toMatchObject({ status: "linked", canViewAthletes: true, athletes: ["Ana Prueba"] });
    expect(list.guardians.find((row) => row.guardianId === noMailGuardian)).toMatchObject({ status: "not_invited", email: null, actions: { invite: false } });
    expect(list.guardians.some((row) => row.guardianId === zoe.guardianId)).toBe(false);
    const audit = await db.execute(sql`select action from zaltyko.audit_log where organization_id = ${a.organizationId}::uuid
      and action like 'family_access.%' order by created_at`);
    expect((audit.rows as Array<{ action: string }>).map((row) => row.action)).toEqual(["family_access.invitation_invite", "family_access.invitation_accept"]);
  });

  it("caducidad, reenvío con espera, revocación y correo cambiado invalidan el enlace", async () => {
    const first = await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "invite", guardianId: bea.guardianId, grantViewAthletes: true } });
    const t1 = tokenOf(first.link);
    // Otra invitación pendiente para el mismo tutor: 409.
    await expect(runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "invite", guardianId: bea.guardianId, grantViewAthletes: true } }))
      .rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", status: 409 });
    // Reenviar enseguida: espera obligatoria.
    await expect(runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "resend", invitationId: first.invitationId!, revision: 1 } }))
      .rejects.toMatchObject({ status: 429 });
    await db.execute(sql`update zaltyko.guardian_access_invitations set expires_at = now() - interval '1 minute', last_sent_at = now() - interval '1 hour'
      where id = ${first.invitationId}::uuid`);
    await expect(acceptFamilyInvitation({ userId: userBea, token: t1 })).rejects.toMatchObject({ status: 404 });
    expect((await listOwnerFamilyAccess({ ...scopeA(), actor: ownerA })).guardians.find((row) => row.guardianId === bea.guardianId)?.status).toBe("expired");

    const resent = await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "resend", invitationId: first.invitationId!, revision: 1 } });
    const t2 = tokenOf(resent.link);
    expect(t2).not.toBe(t1);
    await expect(acceptFamilyInvitation({ userId: userBea, token: t1 })).rejects.toMatchObject({ status: 404 });
    // Revisión vieja: conflicto de versión.
    await expect(runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "revoke", invitationId: first.invitationId!, revision: 1 } }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "revoke", invitationId: first.invitationId!, revision: 2 } });
    await expect(acceptFamilyInvitation({ userId: userBea, token: t2 })).rejects.toMatchObject({ status: 404 });

    // Espera por tutor entre envíos aceptados, también tras revocar.
    await expect(runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "invite", guardianId: bea.guardianId, grantViewAthletes: true } }))
      .rejects.toMatchObject({ status: 429 });
    await db.execute(sql`update zaltyko.guardian_access_invitations set last_sent_at = now() - interval '1 hour' where guardian_id = ${bea.guardianId}::uuid`);
    // Nueva invitación y, antes de aceptarla, la academia corrige el correo.
    const third = await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "invite", guardianId: bea.guardianId, grantViewAthletes: true } });
    const t3 = tokenOf(third.link);
    await db.execute(sql`update zaltyko.guardian_contacts set value = 'otro@example.invalid', normalized_value = 'otro@example.invalid'
      where guardian_id = ${bea.guardianId}::uuid and kind = 'email'`);
    await expect(acceptFamilyInvitation({ userId: userBea, token: t3 })).rejects.toMatchObject({ status: 404 });
    await db.execute(sql`update zaltyko.guardian_contacts set value = ${emailBea}, normalized_value = ${emailBea}
      where guardian_id = ${bea.guardianId}::uuid and kind = 'email'`);
    expect(await acceptFamilyInvitation({ userId: userBea, token: t3 })).toMatchObject({ replayed: false });
  });

  it("cancelar una sesión avisa una vez a las familias con permiso de ver a la gimnasta", async () => {
    const s1 = await session(a.organizationId, a.locationId, classA, 3);
    const clientKey = key();
    mail.sent.length = 0;
    const cancelled = await changeSessionAndNotify({ actor: ownerA, sessionId: s1.id, idempotencyKey: clientKey, command: { ...scopeA(), action: "cancel", reason: "Competición" } });
    expect(cancelled).toMatchObject({ status: "cancelled", recipients: 2, replayed: false, emails: { sent: 2, failed: 0 } });
    // La abuela no tiene permiso de ver gimnastas: no es destinataria.
    expect((await recipients(cancelled.noticeId)).map((row) => row.guardian_id).sort()).toEqual([ana.guardianId, bea.guardianId].sort());
    expect(mail.sent.map((item) => item.to).sort()).toEqual([emailAna, emailBea].sort());
    // El asunto del correo no nombra a ninguna gimnasta.
    for (const item of mail.sent) expect(item.subject).not.toMatch(/Ana|Bea/);
    const status = await db.execute(sql`select status::text, cancellation_reason from zaltyko.sessions where id = ${s1.id}::uuid`);
    expect(status.rows).toEqual([{ status: "cancelled", cancellation_reason: "Competición" }]);

    const replay = await changeSessionAndNotify({ actor: ownerA, sessionId: s1.id, idempotencyKey: clientKey, command: { ...scopeA(), action: "cancel", reason: "Competición" } });
    expect(replay).toMatchObject({ noticeId: cancelled.noticeId, replayed: true, emails: null });
    await expect(changeSessionAndNotify({ actor: ownerA, sessionId: s1.id, idempotencyKey: key(), command: { ...scopeA(), action: "cancel", reason: null } }))
      .rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", status: 409 });
    // Otra academia no puede cambiar la sesión.
    const s2 = await session(a.organizationId, a.locationId, classA, 4);
    await expect(changeSessionAndNotify({ actor: ownerB, sessionId: s2.id, idempotencyKey: key(), command: { organizationId: b.organizationId, locationId: b.locationId, action: "cancel", reason: null } }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    const count = await db.execute(sql`select count(*)::int as count from zaltyko.family_notices where organization_id = ${a.organizationId}::uuid`);
    expect((count.rows[0] as { count: number }).count).toBe(1);
  });

  it("cambiar la hora y sustituir crean un aviso por cambio, sin duplicados", async () => {
    const s = await session(a.organizationId, a.locationId, classA, 6);
    const other = await session(a.organizationId, a.locationId, classA, 7);
    const newStart = new Date(s.startsAt.getTime() + 60 * 60 * 1000);
    const newEnd = new Date(newStart.getTime() + 90 * 60 * 1000);
    const moved = await changeSessionAndNotify({ actor: ownerA, sessionId: s.id, idempotencyKey: key(), command: { ...scopeA(), action: "reschedule", startsAt: newStart.toISOString(), endsAt: newEnd.toISOString(), reason: null } });
    expect(moved).toMatchObject({ status: "scheduled", startsAt: newStart.toISOString(), recipients: 2, previousSessionId: s.id });
    expect(moved.sessionId).not.toBe(s.id);
    // La original queda cancelada en su franja: regenerar sesiones de la
    // plantilla choca con ella (on conflict do nothing) y no la recrea.
    const original = await db.execute(sql`select status::text, starts_at, cancellation_reason from zaltyko.sessions where id = ${s.id}::uuid`);
    expect(original.rows[0]).toMatchObject({ status: "cancelled", cancellation_reason: "Cambio de horario" });
    expect(new Date((original.rows[0] as { starts_at: string }).starts_at).toISOString()).toBe(s.startsAt.toISOString());
    const replacement = await db.execute(sql`select status::text, class_template_id::text from zaltyko.sessions where id = ${moved.sessionId}::uuid`);
    expect(replacement.rows[0]).toEqual({ status: "scheduled", class_template_id: classA });
    await expect(changeSessionAndNotify({ actor: ownerA, sessionId: other.id, idempotencyKey: key(), command: { ...scopeA(), action: "reschedule", startsAt: newStart.toISOString(), endsAt: newEnd.toISOString(), reason: null } }))
      .rejects.toMatchObject({ status: 409 });
    const staff = [randomUUID()];
    const firstAt = "2026-11-14T10:00:00.000000Z";
    const substitution = await notifySessionSubstitution({ actor: ownerA, organizationId: a.organizationId, sessionId: moved.sessionId, staffProfileIds: staff, substitutionChangedAt: firstAt });
    expect(substitution).toMatchObject({ recipients: 2, replayed: false });
    expect(await notifySessionSubstitution({ actor: ownerA, organizationId: a.organizationId, sessionId: moved.sessionId, staffProfileIds: staff, substitutionChangedAt: firstAt })).toMatchObject({ noticeId: substitution!.noticeId, replayed: true });
    // Volver a las titulares y sustituir otra vez con la misma persona es otro aviso.
    expect(await notifySessionSubstitution({ actor: ownerA, organizationId: a.organizationId, sessionId: moved.sessionId, staffProfileIds: staff, substitutionChangedAt: "2026-11-14T11:00:00.000000Z" })).toMatchObject({ replayed: false });
    // Una sesión cancelada no recibe avisos de sustitución.
    expect(await notifySessionSubstitution({ actor: ownerA, organizationId: a.organizationId, sessionId: s.id, staffProfileIds: staff, substitutionChangedAt: firstAt })).toBeNull();
    const kinds = await db.execute(sql`select kind from zaltyko.family_notices where session_id = ${moved.sessionId}::uuid order by created_at`);
    expect((kinds.rows as Array<{ kind: string }>).map((row) => row.kind)).toEqual(["session_rescheduled", "session_substitution", "session_substitution"]);
  });

  it("una familia nunca ve, marca ni configura avisos de otra familia o de otra academia", async () => {
    const manual = await sendManualNotice({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), target: { kind: "group", groupId: groupA }, title: "Entreno abierto", body: "El sábado, puertas abiertas." } });
    expect(manual.recipients).toBe(1);
    const anaView = await listFamilyNotices({ userId: userAna });
    const beaView = await listFamilyNotices({ userId: userBea });
    expect(anaView).toHaveLength(1);
    expect(anaView[0]!.notices.map((notice) => notice.id)).toContain(manual.noticeId);
    expect(beaView[0]!.notices.map((notice) => notice.id)).not.toContain(manual.noticeId);
    // Zoe (otra academia) tiene cuenta pero no vínculo: no ve nada de A.
    expect(await listFamilyNotices({ userId: userZoe })).toEqual([]);
    expect(await listFamilyNotices({ userId: intruder })).toEqual([]);

    expect(await markFamilyNoticesRead({ userId: userBea, body: { noticeIds: [manual.noticeId] } })).toEqual({ updated: 0 });
    expect(await markFamilyNoticesRead({ userId: intruder, body: { noticeIds: [manual.noticeId] } })).toEqual({ updated: 0 });
    expect(await markFamilyNoticesRead({ userId: userAna, body: { noticeIds: [manual.noticeId] } })).toEqual({ updated: 1 });
    expect(await markFamilyNoticesRead({ userId: userAna, body: { noticeIds: [manual.noticeId] } })).toEqual({ updated: 0 });

    const bundle = await getOwnerNoticesBundle({ ...scopeA(), actor: ownerA });
    const seen = bundle.notices.find((notice) => notice.id === manual.noticeId)!;
    expect(seen.recipients).toHaveLength(1);
    expect(seen.recipients[0]!.readAt).not.toBeNull();
    // Otra academia no ve los avisos de A.
    const bundleB = await getOwnerNoticesBundle({ organizationId: b.organizationId, locationId: b.locationId, actor: ownerB });
    expect(bundleB.notices).toEqual([]);

    await expect(setFamilyNotificationPreferences({ userId: userBea, body: { organizationId: b.organizationId, emailSessionChanges: false, emailManualNotices: false } }))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(setFamilyNotificationPreferences({ userId: intruder, body: { organizationId: a.organizationId, emailSessionChanges: false, emailManualNotices: false } }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("la preferencia de correo se respeta y el aviso sigue en el portal", async () => {
    await setFamilyNotificationPreferences({ userId: userAna, body: { organizationId: a.organizationId, emailSessionChanges: true, emailManualNotices: false } });
    mail.sent.length = 0;
    const manual = await sendManualNotice({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), target: { kind: "class", classTemplateId: classA }, title: "Material", body: "Traed la cinta." } });
    const rows = await recipients(manual.noticeId);
    expect(rows.find((row) => row.guardian_id === ana.guardianId)?.email_status).toBe("skipped_preference");
    expect(rows.find((row) => row.guardian_id === bea.guardianId)?.email_status).toBe("sent");
    expect(mail.sent.map((item) => item.to)).toEqual([emailBea]);
    expect((await listFamilyNotices({ userId: userAna }))[0]!.notices.map((notice) => notice.id)).toContain(manual.noticeId);
  });

  it("un correo fallido queda pendiente y se reintenta, como mucho tres veces", async () => {
    // Ana desactivó los mensajes en la prueba anterior: solo Bea recibe correo.
    mail.failNext = 1;
    const manual = await sendManualNotice({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), target: { kind: "class", classTemplateId: classA }, title: "Fotos", body: "Mañana hay fotos de grupo." } });
    expect(manual.emails).toMatchObject({ sent: 0, pending: 1 });
    let row = (await db.execute(sql`select email_status, email_attempts from zaltyko.family_notice_recipients where notice_id = ${manual.noticeId}::uuid and guardian_id = ${bea.guardianId}::uuid`)).rows[0];
    expect(row).toEqual({ email_status: "pending", email_attempts: 1 });
    // Antes de la espera no se reintenta.
    expect(await deliverNoticeEmails({ noticeId: manual.noticeId })).toEqual({ sent: 0, failed: 0, pending: 0 });
    await db.execute(sql`update zaltyko.family_notice_recipients set email_attempted_at = now() - interval '10 minutes' where notice_id = ${manual.noticeId}::uuid and guardian_id = ${bea.guardianId}::uuid`);
    expect(await deliverNoticeEmails({ noticeId: manual.noticeId })).toMatchObject({ sent: 1 });
    row = (await db.execute(sql`select email_status, email_attempts from zaltyko.family_notice_recipients where notice_id = ${manual.noticeId}::uuid and guardian_id = ${bea.guardianId}::uuid`)).rows[0];
    expect(row).toEqual({ email_status: "sent", email_attempts: 2 });

    mail.failNext = 3;
    const failing = await sendManualNotice({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), target: { kind: "class", classTemplateId: classA }, title: "Horario", body: "Cambio de horario del grupo." } });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await db.execute(sql`update zaltyko.family_notice_recipients set email_attempted_at = now() - interval '10 minutes' where notice_id = ${failing.noticeId}::uuid and guardian_id = ${bea.guardianId}::uuid`);
      await deliverNoticeEmails({ noticeId: failing.noticeId });
    }
    row = (await db.execute(sql`select email_status, email_attempts from zaltyko.family_notice_recipients where notice_id = ${failing.noticeId}::uuid and guardian_id = ${bea.guardianId}::uuid`)).rows[0];
    expect(row).toEqual({ email_status: "failed", email_attempts: 3 });
    mail.failNext = 0;
  });

  it("al quitar el permiso de ver gimnastas, la familia deja de ver los avisos", async () => {
    await db.execute(sql`update zaltyko.family_guardians set can_view_athletes = false where guardian_id = ${bea.guardianId}::uuid`);
    expect(await listFamilyNotices({ userId: userBea })).toEqual([]);
    await db.execute(sql`update zaltyko.family_guardians set can_view_athletes = true where guardian_id = ${bea.guardianId}::uuid`);
    expect(await listFamilyNotices({ userId: userBea })).toHaveLength(1);
  });

  it("al aceptar, ver gimnastas solo se concede en los vínculos que no cambiaron desde la invitación", async () => {
    const emailCarla = `ci-fam-carla-${randomUUID()}@example.invalid`;
    const carla = await family(a.organizationId, "Carla", "Madre Carla", emailCarla);
    const userCarla = await authUser(emailCarla);
    const invited = await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "invite", guardianId: carla.guardianId, grantViewAthletes: true } });
    // La academia registra un cambio en el vínculo (custodia) antes de que se acepte.
    await db.execute(sql`update zaltyko.family_guardians set updated_at = now() where guardian_id = ${carla.guardianId}::uuid`);
    await acceptFamilyInvitation({ userId: userCarla, token: tokenOf(invited.link) });
    const link = await db.execute(sql`select can_view_athletes from zaltyko.family_guardians where guardian_id = ${carla.guardianId}::uuid`);
    expect(link.rows).toEqual([{ can_view_athletes: false }]);
    const audit = await db.execute(sql`select after from zaltyko.audit_log where target_id = ${invited.invitationId}::uuid and action = 'family_access.invitation_accept'`);
    expect((audit.rows[0] as { after: { grantedLinks: number } }).after.grantedLinks).toBe(0);
  });

  it("retirar el acceso funciona con la bandera apagada; lo demás no", async () => {
    delete process.env.ZALTYKO_FAMILY_ACCESS_ENABLED;
    try {
      const list = await listOwnerFamilyAccess({ ...scopeA(), actor: ownerA, removeOnly: true });
      expect(list.guardians.every((row) => row.status === "linked" && row.actions.removeAccess && !row.actions.invite)).toBe(true);
      expect(list.guardians.some((row) => row.guardianId === bea.guardianId)).toBe(true);
      await expect(runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "invite_all", grantViewAthletes: true } }))
        .rejects.toMatchObject({ status: 503 });
      await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "remove_access", guardianId: bea.guardianId } });
      const linked = await db.execute(sql`select auth_user_id from zaltyko.guardians where id = ${bea.guardianId}::uuid`);
      expect(linked.rows).toEqual([{ auth_user_id: null }]);
    } finally {
      process.env.ZALTYKO_FAMILY_ACCESS_ENABLED = "true";
    }
  });

  it("retirar el acceso corta la lectura en la siguiente petición", async () => {
    await runFamilyAccessCommand({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), action: "remove_access", guardianId: ana.guardianId } });
    expect(await listFamilyNotices({ userId: userAna })).toEqual([]);
    const anyNotice = await db.execute(sql`select notice_id::text from zaltyko.family_notice_recipients where guardian_id = ${ana.guardianId}::uuid limit 1`);
    const noticeId = (anyNotice.rows[0] as { notice_id: string }).notice_id;
    expect(await markFamilyNoticesRead({ userId: userAna, body: { noticeIds: [noticeId] } })).toEqual({ updated: 0 });
    expect((await listOwnerFamilyAccess({ ...scopeA(), actor: ownerA })).guardians.find((row) => row.guardianId === ana.guardianId)?.status).toBe("removed");
    // Un aviso nuevo llega a Ana como «sin acceso al portal»: sin correo.
    const manual = await sendManualNotice({ actor: ownerA, idempotencyKey: key(), command: { ...scopeA(), target: { kind: "group", groupId: groupA }, title: "Horario", body: "Nuevo horario de grupo." } });
    expect((await recipients(manual.noticeId))[0]?.email_status).toBe("skipped_no_account");
  });
});
