import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  ACCOUNT_ERASURE_AUDIT_ACTION,
  isAccountErasureSchemaInstalled,
  prepareAccountErasure,
} from "@/modules/data-rights/application/account-erasure";
import { assertCanonicalTeamAccessSchema } from "@/modules/staff/application/canonical-team-access-schema";

/**
 * Supresión de cuentas sobre el PostgreSQL desechable de GitHub. Cada prueba
 * corre dentro de una única transacción que se deshace al final: el candidato,
 * su vuelta atrás y todas las filas sintéticas desaparecen, y la base
 * compartida queda como estaba aunque una aserción falle. Nunca en un proyecto
 * enlazado ni con credenciales externas.
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

const file = (name: string) => readFileSync(resolve(process.cwd(), "docs/deployment/candidates", name), "utf8");
const CANDIDATE = "20261114120000_account_erasure_candidate.sql";
const VERIFY = "20261114120000_account_erasure_verify.sql";
const ROLLBACK = "20261114120000_account_erasure_rollback.sql";
const TEAM_ACCESS = "20261105120000_canonical_team_access_candidate.sql";

class RollbackSentinel extends Error {}

/** Corre `body` en una transacción que siempre se deshace. */
async function inRolledBackTransaction(body: (tx: TransactionClient) => Promise<void>) {
  assertDisposableTarget();
  await db
    .transaction(async (tx) => {
      await body(tx);
      throw new RollbackSentinel();
    })
    .catch((error) => {
      if (!(error instanceof RollbackSentinel)) throw error;
    });
}

type Failure = { code?: string; message?: string; cause?: { code?: string; message?: string } };

/** Ejecuta en un savepoint y devuelve el error de PostgreSQL (el savepoint se deshace). */
async function failure(tx: TransactionClient, run: (sp: TransactionClient) => Promise<unknown>): Promise<Failure> {
  const error = (await tx.transaction(async (sp) => run(sp)).then(
    () => null,
    (caught) => caught
  )) as Failure | null;
  expect(error, "se esperaba un error").not.toBeNull();
  return (error?.cause ?? error) as Failure;
}

const one = async <T extends Record<string, unknown>>(tx: TransactionClient, query: ReturnType<typeof sql>) =>
  ((await tx.execute(query)).rows[0] ?? {}) as T;

/** Definiciones que toca el candidato; la vuelta atrás debe dejarlas idénticas. */
async function catalogFingerprint(tx: TransactionClient): Promise<string> {
  const result = await tx.execute(sql`
    select jsonb_build_object(
      'constraints', (
        select jsonb_agg(jsonb_build_object('relation', conrelid::regclass::text, 'name', conname, 'definition', pg_get_constraintdef(oid))
          order by conrelid::regclass::text, conname)
        from pg_constraint
        where conrelid in (
          'zaltyko.organization_members'::regclass, 'zaltyko.payments'::regclass, 'zaltyko.insight_actions'::regclass,
          'zaltyko.organization_member_invitations'::regclass, 'zaltyko.organization_team_command_receipts'::regclass,
          'public.directory_grants'::regclass, 'public.directory_claims'::regclass, 'public.directory_revisions'::regclass,
          'public.directory_subscriptions'::regclass, 'public.directory_audit'::regclass
        )
      ),
      'not_null', (
        select jsonb_agg(attrelid::regclass::text || '.' || attname || '=' || attnotnull order by attrelid::regclass::text, attname)
        from pg_attribute
        where attrelid in (
            'zaltyko.organization_members'::regclass, 'zaltyko.insight_actions'::regclass,
            'public.directory_grants'::regclass, 'public.directory_claims'::regclass
          )
          and attrelid::regclass::text || '.' || attname in (
            'zaltyko.organization_members.user_id', 'zaltyko.insight_actions.actor_user_id',
            'public.directory_grants.approved_by', 'public.directory_claims.user_id'
          )
      ),
      'functions', (
        select jsonb_agg(jsonb_build_object('name', proname, 'source', prosrc, 'definer', prosecdef, 'config', proconfig, 'owner', proowner::regrole::text)
          order by proname)
        from pg_proc
        where oid in (
          'zaltyko_domain_private.reject_audit_mutation()'::regprocedure,
          'zaltyko_domain_private.reject_insight_history_mutation()'::regprocedure
        )
      )
    )::text as fingerprint
  `);
  return String((result.rows[0] as { fingerprint: string }).fingerprint);
}

interface Fixture {
  organizationId: string;
  locationId: string;
  superAdmin: string;
  owner: { userId: string; memberId: string };
  coach: { userId: string; memberId: string };
  staffProfileId: string;
  coachAuditId: string;
  ownerAuditId: string;
  paymentId: string;
  invitationId: string;
  directoryEntryId: string;
  claimId: string;
}

async function authUser(tx: TransactionClient, label: string): Promise<string> {
  const id = randomUUID();
  await tx.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`ci-erasure-${label}-${id}@example.invalid`})`);
  return id;
}

async function member(tx: TransactionClient, organizationId: string, role: "owner" | "coach", label: string) {
  const userId = await authUser(tx, label);
  const memberId = randomUUID();
  await tx.execute(sql`
    insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
    values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, ${role}, 'active', 'all')
  `);
  return { userId, memberId };
}

const hex = () => randomUUID().replaceAll("-", "").repeat(2);

/** Una academia con dueña, una entrenadora con autoría en cada tipo de registro y el directorio. */
async function fixture(tx: TransactionClient): Promise<Fixture> {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  await tx.execute(sql`insert into zaltyko.organizations (id, name, status) values (${organizationId}::uuid, 'CI supresión de cuentas', 'active')`);
  await tx.execute(sql`insert into zaltyko.locations (id, organization_id, code, name) values (${locationId}::uuid, ${organizationId}::uuid, 'ci-erasure', 'Sede CI')`);
  const superAdmin = await authUser(tx, "super-admin");
  const owner = await member(tx, organizationId, "owner", "owner");
  const coach = await member(tx, organizationId, "coach", "coach");

  // Ficha del equipo enlazada a la pertenencia (RESTRICT): debe sobrevivir.
  const personId = randomUUID();
  const staffProfileId = randomUUID();
  await tx.execute(sql`insert into zaltyko.people (id, organization_id, given_name, family_name) values (${personId}::uuid, ${organizationId}::uuid, 'Carla', 'Pons')`);
  await tx.execute(sql`
    insert into zaltyko.staff_profiles (id, organization_id, person_id, member_id)
    values (${staffProfileId}::uuid, ${organizationId}::uuid, ${personId}::uuid, ${coach.memberId}::uuid)
  `);

  // Auditoría de solo inserción firmada por la entrenadora y por la dueña.
  const coachAuditId = randomUUID();
  const ownerAuditId = randomUUID();
  for (const [id, actor] of [[coachAuditId, coach.userId], [ownerAuditId, owner.userId]] as const) {
    await tx.execute(sql`
      insert into zaltyko.audit_log (id, organization_id, actor_user_id, action, target_type, target_id, metadata)
      values (${id}::uuid, ${organizationId}::uuid, ${actor}::uuid, 'attendance.recorded', 'session', ${randomUUID()}::uuid, '{"ci":true}'::jsonb)
    `);
  }

  // Cobro manual anotado por la entrenadora: se conserva.
  const familyId = randomUUID();
  const paymentId = randomUUID();
  await tx.execute(sql`insert into zaltyko.families (id, organization_id) values (${familyId}::uuid, ${organizationId}::uuid)`);
  await tx.execute(sql`
    insert into zaltyko.payments (id, organization_id, family_id, source, status, amount_cents, currency, manual_method, recorded_by_user_id, received_at, idempotency_key)
    values (${paymentId}::uuid, ${organizationId}::uuid, ${familyId}::uuid, 'manual', 'succeeded', 4500, 'EUR', 'cash', ${coach.userId}::uuid, now(), ${`ci-erasure-${paymentId}`})
  `);

  // Invitación que aceptó la entrenadora y su recibo de reintento.
  const invitationId = randomUUID();
  await tx.execute(sql`
    insert into zaltyko.organization_member_invitations
      (id, organization_id, normalized_email, role, status, invited_by_member_id, token_sha256, expires_at,
       invitee_given_name, invitee_family_name, accepted_by_user_id, accepted_member_id, accepted_at)
    values (${invitationId}::uuid, ${organizationId}::uuid, ${`ci-erasure-${invitationId}@example.invalid`}, 'coach', 'accepted',
       ${owner.memberId}::uuid, ${hex()}, now() + interval '7 days', 'Carla', 'Pons', ${coach.userId}::uuid, ${coach.memberId}::uuid, now())
  `);
  await tx.execute(sql`
    insert into zaltyko.organization_team_command_receipts
      (organization_id, actor_user_id, idempotency_key, operation, request_hash, invitation_id, invitation_status, invitation_revision, invitation_expires_at, member_id)
    values (${organizationId}::uuid, ${coach.userId}::uuid, ${hex()}, 'accept', ${hex()}, ${invitationId}::uuid, 'accepted', 1, now() + interval '7 days', ${coach.memberId}::uuid)
  `);

  // Directorio: una reclamación pendiente y el derecho a gestionar una ficha.
  const directoryEntryId = randomUUID();
  const grantedEntryId = randomUUID();
  const claimId = randomUUID();
  for (const id of [directoryEntryId, grantedEntryId]) {
    await tx.execute(sql`insert into public.directory_entries (id, kind, data, slug) values (${id}::uuid, 'academy', '{}'::jsonb, ${`ci-erasure-${id}`})`);
  }
  await tx.execute(sql`
    insert into public.directory_claims (id, entry_id, user_id, relationship, evidence)
    values (${claimId}::uuid, ${directoryEntryId}::uuid, ${coach.userId}::uuid, 'Entrenadora', 'Prueba sintética')
  `);
  await tx.execute(sql`
    insert into public.directory_grants (entry_id, user_id, approved_by)
    values (${grantedEntryId}::uuid, ${coach.userId}::uuid, ${superAdmin}::uuid)
  `);

  return {
    organizationId, locationId, superAdmin, owner, coach, staffProfileId, coachAuditId, ownerAuditId,
    paymentId, invitationId, directoryEntryId, claimId,
  };
}

async function ensureTeamAccess(tx: TransactionClient) {
  const present = await one<{ present: boolean }>(tx, sql`select to_regclass('zaltyko.organization_member_invitations') is not null as present`);
  if (!present.present) await tx.execute(sql.raw(file(TEAM_ACCESS)));
}

describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1")("supresión de cuentas en PostgreSQL desechable", () => {
  it("instala, verifica y deshace el candidato sin dejar diferencias; rechaza reinstalarse", async () => {
    await inRolledBackTransaction(async (tx) => {
      await ensureTeamAccess(tx);
      expect(await isAccountErasureSchemaInstalled(tx)).toBe(false);
      // La verificación falla mientras el candidato no esté aplicado.
      expect((await failure(tx, (sp) => sp.execute(sql.raw(file(VERIFY))))).message).toMatch(/Account erasure verification failed/);
      // Tampoco hay vuelta atrás de algo que no está instalado.
      expect((await failure(tx, (sp) => sp.execute(sql.raw(file(ROLLBACK))))).message).toMatch(/requires the installed account erasure candidate/);

      const before = await catalogFingerprint(tx);
      await tx.execute(sql.raw(file(CANDIDATE)));
      expect(await isAccountErasureSchemaInstalled(tx)).toBe(true);
      await tx.execute(sql.raw(file(VERIFY)));
      expect(await catalogFingerprint(tx)).not.toBe(before);
      await expect(assertCanonicalTeamAccessSchema(tx)).resolves.toBeUndefined();

      const again = await failure(tx, (sp) => sp.execute(sql.raw(file(CANDIDATE))));
      expect(again.code).toBe("P0001");
      expect(again.message).toMatch(/^Account erasure candidate requires .*; inspect existing schema before promotion$/);

      await tx.execute(sql.raw(file(ROLLBACK)));
      expect(await isAccountErasureSchemaInstalled(tx)).toBe(false);
      expect(await catalogFingerprint(tx)).toBe(before);
      await expect(assertCanonicalTeamAccessSchema(tx)).resolves.toBeUndefined();
    });
  }, 60_000);

  it("sin el candidato, la supresión falla cerrada (503) y sin escribir", async () => {
    await inRolledBackTransaction(async (tx) => {
      await ensureTeamAccess(tx);
      const f = await fixture(tx);
      await expect(prepareAccountErasure(tx, { userId: f.coach.userId, actorUserId: f.superAdmin })).rejects.toMatchObject({
        code: "ACCOUNT_ERASURE_NOT_AVAILABLE",
        status: 503,
      });
      const membership = await one<{ status: string }>(tx, sql`select status::text from zaltyko.organization_members where id = ${f.coach.memberId}::uuid`);
      expect(membership.status).toBe("active");
      // Y el borrado directo de la cuenta sigue fallando entero, como hoy.
      await failure(tx, (sp) => sp.execute(sql`delete from auth.users where id = ${f.coach.userId}::uuid`));
    });
  }, 60_000);

  it("suprime la cuenta, seudonimiza la autoría y conserva los registros de la academia", async () => {
    await inRolledBackTransaction(async (tx) => {
      await ensureTeamAccess(tx);
      await tx.execute(sql.raw(file(CANDIDATE)));
      const f = await fixture(tx);

      // Sin el procedimiento, borrar la cuenta falla entero: la pertenencia
      // activa no puede quedarse sin cuenta (CHECK).
      const direct = await failure(tx, (sp) => sp.execute(sql`delete from auth.users where id = ${f.coach.userId}::uuid`));
      expect(direct.code).toBe("23514");

      const preparation = await prepareAccountErasure(tx, { userId: f.coach.userId, actorUserId: f.superAdmin });
      expect(preparation).toEqual({ revokedMemberships: 1, organizations: 1, withdrawnDirectoryClaims: 1 });
      // Lo que hace Supabase Auth al borrar la cuenta.
      await tx.execute(sql`delete from auth.users where id = ${f.coach.userId}::uuid`);

      const membership = await one<{ user_id: string | null; status: string; role: string }>(tx, sql`
        select user_id::text, status::text, role::text from zaltyko.organization_members where id = ${f.coach.memberId}::uuid`);
      expect(membership).toEqual({ user_id: null, status: "revoked", role: "coach" });
      const staff = await one<{ member_id: string }>(tx, sql`select member_id::text from zaltyko.staff_profiles where id = ${f.staffProfileId}::uuid`);
      expect(staff.member_id).toBe(f.coach.memberId);

      const audit = await one<{ actor_user_id: string | null; action: string; metadata: unknown }>(tx, sql`
        select actor_user_id::text, action, metadata from zaltyko.audit_log where id = ${f.coachAuditId}::uuid`);
      expect(audit).toEqual({ actor_user_id: null, action: "attendance.recorded", metadata: { ci: true } });
      const erasureAudit = await one<{ actor_user_id: string; before: unknown; after: unknown }>(tx, sql`
        select actor_user_id::text, before, after from zaltyko.audit_log
        where organization_id = ${f.organizationId}::uuid and action = ${ACCOUNT_ERASURE_AUDIT_ACTION} and target_id = ${f.coach.memberId}::uuid`);
      expect(erasureAudit).toEqual({ actor_user_id: f.superAdmin, before: { status: "active" }, after: { status: "revoked" } });

      const payment = await one<{ recorded_by_user_id: string | null; amount_cents: string; source: string }>(tx, sql`
        select recorded_by_user_id::text, amount_cents::text, source::text from zaltyko.payments where id = ${f.paymentId}::uuid`);
      expect(payment).toEqual({ recorded_by_user_id: null, amount_cents: "4500", source: "manual" });

      const invitation = await one<{ status: string; accepted_by_user_id: string | null; accepted_member_id: string }>(tx, sql`
        select status, accepted_by_user_id::text, accepted_member_id::text from zaltyko.organization_member_invitations where id = ${f.invitationId}::uuid`);
      expect(invitation).toEqual({ status: "accepted", accepted_by_user_id: null, accepted_member_id: f.coach.memberId });
      const receipts = await one<{ count: number }>(tx, sql`
        select count(*)::int as count from zaltyko.organization_team_command_receipts where invitation_id = ${f.invitationId}::uuid`);
      expect(receipts.count).toBe(0);

      const claim = await one<{ user_id: string | null; status: string; decided_at: string | null }>(tx, sql`
        select user_id::text, status, decided_at::text from public.directory_claims where id = ${f.claimId}::uuid`);
      expect(claim.user_id).toBeNull();
      expect(claim.status).toBe("withdrawn");
      expect(claim.decided_at).not.toBeNull();
      const grants = await one<{ count: number }>(tx, sql`
        select count(*)::int as count from public.directory_grants where user_id is null or approved_by = ${f.superAdmin}::uuid`);
      expect(grants.count).toBe(0);

      // Quedan las tablas de solo inserción como estaban para todo lo demás.
      expect((await failure(tx, (sp) => sp.execute(sql`update zaltyko.audit_log set action = 'x' where id = ${f.coachAuditId}::uuid`))).code).toBe("55000");
      expect((await failure(tx, (sp) => sp.execute(sql`delete from zaltyko.audit_log where id = ${f.coachAuditId}::uuid`))).code).toBe("55000");
      // Vaciar el actor de una cuenta que sigue existiendo tampoco se admite.
      expect((await failure(tx, (sp) => sp.execute(sql`update zaltyko.audit_log set actor_user_id = null where id = ${f.ownerAuditId}::uuid`))).code).toBe("55000");

      // El acceso de equipo sigue reconociendo su esquema.
      await expect(assertCanonicalTeamAccessSchema(tx)).resolves.toBeUndefined();

      // Reintentar es seguro: no hay nada que revocar.
      expect(await prepareAccountErasure(tx, { userId: f.coach.userId, actorUserId: f.superAdmin }))
        .toEqual({ revokedMemberships: 0, organizations: 0, withdrawnDirectoryClaims: 0 });

      // Ya no hay vuelta atrás sin decidir qué hacer con estas filas.
      expect((await failure(tx, (sp) => sp.execute(sql.raw(file(ROLLBACK))))).message).toMatch(/accounts were already erased/);
    });
  }, 60_000);

  it("no deja una academia sin dueña activa", async () => {
    await inRolledBackTransaction(async (tx) => {
      await ensureTeamAccess(tx);
      await tx.execute(sql.raw(file(CANDIDATE)));
      const f = await fixture(tx);

      await expect(prepareAccountErasure(tx, { userId: f.owner.userId, actorUserId: f.superAdmin })).rejects.toMatchObject({
        code: "ACCOUNT_ERASURE_LAST_OWNER",
        status: 409,
        details: { organizations: 1 },
      });
      const unchanged = await one<{ status: string }>(tx, sql`select status::text from zaltyko.organization_members where id = ${f.owner.memberId}::uuid`);
      expect(unchanged.status).toBe("active");

      // Con otra dueña activa, la supresión sigue adelante.
      await member(tx, f.organizationId, "owner", "second-owner");
      const preparation = await prepareAccountErasure(tx, { userId: f.owner.userId, actorUserId: f.superAdmin });
      expect(preparation.revokedMemberships).toBe(1);
      await tx.execute(sql`delete from auth.users where id = ${f.owner.userId}::uuid`);
      const invitation = await one<{ invited_by_member_id: string }>(tx, sql`
        select invited_by_member_id::text from zaltyko.organization_member_invitations where id = ${f.invitationId}::uuid`);
      expect(invitation.invited_by_member_id).toBe(f.owner.memberId);
    });
  }, 60_000);
});
