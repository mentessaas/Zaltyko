import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  acceptCanonicalTeamInvitation, createCanonicalTeamInvitation, inspectCanonicalTeamInvitation,
  listCanonicalTeamAccess, reissueCanonicalTeamInvitation, revokeCanonicalTeamInvitation,
} from "@/modules/staff/application/canonical-team-access";
import { exportCanonicalAcademyData } from "@/modules/data-rights/application/canonical-academy-return";
import { validateCanonicalAcademyArchive } from "@/modules/data-rights/application/verify-canonical-academy-archive";
import { assertCanonicalTeamAccessSchema } from "@/modules/staff/application/canonical-team-access-schema";

/** No hosted URL, fallback env, inherited credentials, or workstation runtime. */
function assertDisposableTarget() {
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const target = new URL(connection ?? "");
  if (process.env.ZALTYKO_PG_INTEGRATION !== "1" || process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_OS !== "Linux" || process.env.NODE_ENV !== "test" || !["postgres:", "postgresql:"].includes(target.protocol) || !["127.0.0.1", "localhost", "::1"].includes(target.hostname) || target.username !== "supabase_admin" || !target.password || !target.port || target.pathname !== "/postgres" || target.search !== "?sslmode=disable" || [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(value => value !== connection)) throw new Error("Disposable GitHub Linux loopback Postgres is required");
  for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY", "E2E_TARGET_SUPABASE_PROJECT_REF", "STRIPE_SAAS_TEST_SECRET_KEY", "STRIPE_SAAS_LIVE_SECRET_KEY", "VERCEL_TOKEN"]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const tables = ["organization_member_invitations", "organization_member_invitation_scopes", "organization_team_command_receipts"] as const;
const candidate = () => readFileSync(resolve(process.cwd(), "docs/deployment/candidates/20261105120000_canonical_team_access_candidate.sql"), "utf8");
const key = () => `synthetic-${randomUUID()}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function expectPgCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, failure => failure) as { code?: string; cause?: { code?: string } } | null;
  expect(error).not.toBeNull();
  expect(error?.cause?.code ?? error?.code).toBe(code);
}

/**
 * Synthetic Auth user plus its Auth identity. `provider: "email"` is the
 * email/password identity; OAuth identities state `email_verified`.
 */
async function identity(email?: string, confirmed = true, auth: { provider?: string; emailVerified?: boolean; identityEmail?: string } = {}) {
  const userId = randomUUID();
  const normalizedEmail = email ?? `team-${userId}@example.invalid`;
  await db.execute(sql`insert into auth.users(id,email,email_confirmed_at)
    values (${userId}::uuid,${normalizedEmail},${confirmed ? new Date().toISOString() : null}::timestamptz)`);
  const provider = auth.provider ?? "email";
  if (provider !== "none") {
    const data = { sub: userId, email: auth.identityEmail ?? normalizedEmail, ...(auth.emailVerified === undefined ? {} : { email_verified: auth.emailVerified }) };
    await db.execute(sql`insert into auth.identities(provider_id,user_id,identity_data,provider)
      values (${`${provider}-${userId}`},${userId}::uuid,${JSON.stringify(data)}::jsonb,${provider})`);
  }
  return { userId, email: normalizedEmail.trim().toLowerCase() };
}

async function fixture() {
  const organizationId = randomUUID();
  const locationA = randomUUID();
  const locationB = randomUUID();
  const owner = await identity();
  const memberId = randomUUID();
  await db.execute(sql`insert into zaltyko.organizations(id,name) values (${organizationId}::uuid,'Club sintético de equipo')`);
  await db.execute(sql`insert into zaltyko.locations(id,organization_id,code,name)
    values (${locationA}::uuid,${organizationId}::uuid,'sede-a','Sede A'),(${locationB}::uuid,${organizationId}::uuid,'sede-b','Sede B')`);
  await db.execute(sql`insert into zaltyko.organization_members(id,organization_id,user_id,role,status,location_scope_mode)
    values (${memberId}::uuid,${organizationId}::uuid,${owner.userId}::uuid,'owner','active','all')`);
  return { organizationId, locationA, locationB, actor: { userId: owner.userId, memberId } };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type InviteOverrides = Partial<{ role: "manager" | "coach"; locationIds: string[]; idempotencyKey: string;
  staffProfileId: string | null; givenName: string | null; familyName: string | null }>;
async function invite(f: Fixture, who: Awaited<ReturnType<typeof identity>>, overrides: InviteOverrides = {}) {
  const target = overrides.staffProfileId ? { staffProfileId: overrides.staffProfileId, givenName: null, familyName: null } : { givenName: "Persona", familyName: "Sintética" };
  return createCanonicalTeamInvitation({ ...f, email: who.email, role: "coach", locationIds: [f.locationA, f.locationB], idempotencyKey: key(), ...target, ...overrides });
}

const GENERIC_INVALID = /no es válido para tu cuenta/u;

/** Existing team profile without an account (as created from Personal). */
async function staffProfile(organizationId: string, givenName = "Bea", familyName = "Ficha") {
  const personId = randomUUID(); const profileId = randomUUID();
  await db.execute(sql`insert into zaltyko.people(id,organization_id,given_name,family_name) values (${personId}::uuid,${organizationId}::uuid,${givenName},${familyName})`);
  await db.execute(sql`insert into zaltyko.staff_profiles(id,organization_id,person_id,is_active) values (${profileId}::uuid,${organizationId}::uuid,${personId}::uuid,true)`);
  return profileId;
}

async function memberOf(f: Fixture, role: "owner" | "admin" | "manager" | "coach", mode: "all" | "selected", locationIds: string[] = []) {
  const user = await identity(); const memberId = randomUUID();
  await db.execute(sql`insert into zaltyko.organization_members(id,organization_id,user_id,role,status,location_scope_mode)
    values (${memberId}::uuid,${f.organizationId}::uuid,${user.userId}::uuid,${role},'active',${mode})`);
  for (const locationId of locationIds) await db.execute(sql`insert into zaltyko.member_location_scopes(organization_id,member_id,location_id)
    values (${f.organizationId}::uuid,${memberId}::uuid,${locationId}::uuid)`);
  return { ...f, actor: { userId: user.userId, memberId } };
}

async function linkedProfile(organizationId: string, memberId: string) {
  const result = await db.execute(sql`select s.id::text as id,p.given_name,p.family_name,s.is_active from zaltyko.staff_profiles s
    join zaltyko.people p on p.organization_id=s.organization_id and p.id=s.person_id
    where s.organization_id=${organizationId}::uuid and s.member_id=${memberId}::uuid`);
  return result.rows as Array<{ id: string; given_name: string; family_name: string; is_active: boolean }>;
}

/**
 * Waits until `count` backends are blocked by the lock holder (`holderPid`),
 * directly or behind another waiter on the same row (tuple-lock queue).
 */
async function waitForLockWaiters(holderPid: number, count: number) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const result = await db.execute(sql`with direct as (
        select pid from pg_stat_activity where ${holderPid}::int = any(pg_blocking_pids(pid))
      ), queued as (
        select pid from pg_stat_activity
        where pg_blocking_pids(pid) && (select coalesce(array_agg(pid), '{}'::int[]) from direct)
      )
      select count(distinct pid)::int as waiting from (select pid from direct union select pid from queued) waiters`);
    if (Number((result.rows[0] as { waiting: number }).waiting) >= count) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 25));
  }
  throw new Error("Concurrent acceptances did not reach the invitation row lock");
}

async function snapshot(organizationId: string) {
  const scoped = [...tables, "organization_members", "member_location_scopes", "audit_log"];
  const result = await db.execute(sql`${sql.join(scoped.map(table => sql`
    select ${table} as table_name,count(*)::int as count,
      md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) as checksum
    from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r where organization_id=${organizationId}::uuid`), sql` union all `)} order by table_name`);
  return result.rows;
}

describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1")("canonical team access on disposable PostgreSQL", () => {
  const previousFlag = process.env.ZALTYKO_TEAM_ACCESS_ENABLED;
  beforeAll(async () => {
    assertDisposableTarget();
    // Historical disposable replay uses a minimal Auth stub. Add only the real
    // upstream column required by this suite, after every CI/loopback guard.
    // This is never baseline/candidate SQL and never runs against hosted Auth.
    await db.execute(sql`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
    // Same guard: the minimal stub has no identities table; real Supabase does.
    // Only the columns the service reads (and real NOT NULL ones) are created.
    await db.execute(sql`create table if not exists auth.identities (
      id uuid primary key default gen_random_uuid(),
      provider_id text not null,
      user_id uuid not null,
      identity_data jsonb not null,
      provider text not null,
      unique (provider_id, provider))`);
    process.env.ZALTYKO_TEAM_ACCESS_ENABLED = "true";
    // The guard refuses an existing partial candidate before touching its ACLs.
    await expect(db.transaction(async tx => {
      await tx.execute(sql`create table zaltyko.organization_member_invitations (id uuid)`);
      await tx.execute(sql.raw(candidate()));
    })).rejects.toThrow(/all three new relations absent/);
    await db.execute(sql.raw(candidate()));
  });
  afterAll(() => {
    if (previousFlag === undefined) delete process.env.ZALTYKO_TEAM_ACCESS_ENABLED;
    else process.env.ZALTYKO_TEAM_ACCESS_ENABLED = previousFlag;
  });

  it("forces RLS and denies direct anonymous/authenticated table access", async () => {
    const inventory = await db.execute(sql`select c.relname,c.relrowsecurity,c.relforcerowsecurity,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_access,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='zaltyko' and c.relname in (${sql.join(tables.map(table => sql`${table}`), sql`,`)}) order by c.relname`);
    expect(inventory.rows).toHaveLength(3);
    for (const table of inventory.rows) expect(table).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, anon_access: false, authenticated_access: false });
    for (const role of ["anon", "authenticated"]) for (const table of tables) {
      await expectPgCode(db.transaction(async tx => {
        await tx.execute(sql.raw(`set local role ${role}`));
        await tx.execute(sql`select id from ${sql.identifier("zaltyko")}.${sql.identifier(table)} limit 1`);
      }), "42501");
      await expectPgCode(db.transaction(async tx => {
        await tx.execute(sql.raw(`set local role ${role}`));
        await tx.execute(sql`delete from ${sql.identifier("zaltyko")}.${sql.identifier(table)} where false`);
      }), "42501");
    }
    await expect(db.execute(sql.raw(candidate()))).rejects.toThrow(/all three new relations absent/);
  });

  it.each([
    { name: "missing same-organization site FK", mutation: "alter table zaltyko.organization_member_invitation_scopes drop constraint %CONSTRAINT%", table: "organization_member_invitation_scopes", constraint: "contype='f' and confrelid='zaltyko.locations'::regclass" },
    { name: "unvalidated same-organization site FK", mutation: "alter table zaltyko.organization_member_invitation_scopes drop constraint %CONSTRAINT%; alter table zaltyko.organization_member_invitation_scopes add constraint ci_team_location_fk foreign key (organization_id,location_id) references zaltyko.locations(organization_id,id) not valid", table: "organization_member_invitation_scopes", constraint: "contype='f' and confrelid='zaltyko.locations'::regclass" },
    { name: "missing pending-email uniqueness", mutation: "drop index zaltyko.organization_member_invitations_pending_email_uq" },
    { name: "wrong pending-email predicate", mutation: "drop index zaltyko.organization_member_invitations_pending_email_uq; create unique index organization_member_invitations_pending_email_uq on zaltyko.organization_member_invitations(organization_id,normalized_email) where status='accepted'" },
    { name: "weakened role check", mutation: "alter table zaltyko.organization_member_invitations drop constraint %CONSTRAINT%; alter table zaltyko.organization_member_invitations add constraint ci_team_role_check check (role in ('manager','coach','owner'))", table: "organization_member_invitations", constraint: "contype='c' and conkey=array[(select attnum from pg_attribute where attrelid='zaltyko.organization_member_invitations'::regclass and attname='role')]::int2[]" },
    { name: "nullable required revision", mutation: "alter table zaltyko.organization_member_invitations alter column revision drop not null" },
    { name: "divergent email type", mutation: "alter table zaltyko.organization_member_invitations alter column normalized_email type varchar(254)" },
    { name: "RLS not forced", mutation: "alter table zaltyko.organization_member_invitations no force row level security" },
    { name: "disabled FK enforcement triggers", mutation: "alter table zaltyko.organization_member_invitation_scopes disable trigger all" },
    { name: "replica-mode constraint bypass", mutation: "set local session_replication_role=replica" },
    { name: "anonymous table grant", mutation: "grant select on zaltyko.organization_member_invitations to anon" },
    { name: "authenticated column grant", mutation: "grant select (id) on zaltyko.organization_member_invitations to authenticated" },
    { name: "public column grant", mutation: "grant select (id) on zaltyko.organization_member_invitations to public" },
    { name: "unexpected direct-client policy", mutation: "create policy ci_team_client_policy on zaltyko.organization_member_invitations for select to authenticated using (true)" },
  ])("fails closed without writes for reversible catalog drift: $name", async drift => {
    const f = await fixture(); const who = await identity(); await invite(f, who);
    const before = await snapshot(f.organizationId);
    await expect(db.transaction(async tx => {
      let mutation = drift.mutation;
      if ("table" in drift && "constraint" in drift) {
        const constraint = await tx.execute(sql.raw(`select conname from pg_constraint where conrelid='zaltyko.${drift.table}'::regclass and ${drift.constraint}`));
        const name = String(constraint.rows[0]?.conname ?? "");
        if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error("Expected candidate constraint not found");
        mutation = mutation.replace("%CONSTRAINT%", `"${name}"`);
      }
      await tx.execute(sql.raw(mutation));
      // Use this exact transaction so the uncommitted drift is visible to the
      // production entry guard; its 503 aborts and reverts the DDL as well.
      await assertCanonicalTeamAccessSchema(tx);
    })).rejects.toMatchObject({ status: 503, code: "FEATURE_NOT_AVAILABLE" });
    expect(await snapshot(f.organizationId)).toEqual(before);
    expect((await listCanonicalTeamAccess(f)).invitations).toHaveLength(1);
  });

  it("creates explicit selected-scope invitations with only a hash in DB and safe receipts", async () => {
    const f = await fixture(); const who = await identity();
    const idempotencyKey = key();
    const created = await invite(f, { ...who, email: ` ${who.email.toUpperCase()} ` }, { idempotencyKey });
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created).toMatchObject({ replayed: false, invitation: { email: who.email, role: "coach", status: "pending", expired: false, revision: 1 } });
    expect(created.invitation.requestedLocations.map(site => site.id).sort()).toEqual([f.locationA, f.locationB].sort());
    const persisted = await db.execute(sql`select token_sha256,
      extract(epoch from expires_at-created_at) as ttl from zaltyko.organization_member_invitations where id=${created.invitation.id}::uuid`);
    expect(persisted.rows[0]?.token_sha256).toBe(sha(created.token!));
    expect(Number(persisted.rows[0]?.ttl)).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 - 2);
    expect(Number(persisted.rows[0]?.ttl)).toBeLessThan(7 * 24 * 60 * 60 + 5);
    const stored = await db.execute(sql`select to_jsonb(r) as receipt from zaltyko.organization_team_command_receipts r where organization_id=${f.organizationId}::uuid`);
    const audit = await db.execute(sql`select to_jsonb(r) as audit from zaltyko.audit_log r where organization_id=${f.organizationId}::uuid`);
    const safeText = JSON.stringify([stored.rows, audit.rows]);
    expect(safeText).not.toContain(who.email); expect(safeText).not.toContain(created.token!); expect(safeText).not.toContain(sha(created.token!)); expect(safeText).not.toContain(idempotencyKey);
    const list = await listCanonicalTeamAccess(f);
    expect(list.invitations).toEqual([created.invitation]);
    expect(list.members).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(f.actor.userId);
  });

  it("returns no token on replay, preserves original receipt after reissue, and rejects changed payload", async () => {
    const f = await fixture(); const who = await identity(); const idempotencyKey = key();
    const first = await invite(f, who, { idempotencyKey });
    const before = await snapshot(f.organizationId);
    expect(await invite(f, who, { idempotencyKey, locationIds: [f.locationB, f.locationA] })).toEqual({ ...first, token: null, replayed: true });
    expect(await snapshot(f.organizationId)).toEqual(before);
    await expect(invite(f, who, { idempotencyKey, role: "manager" })).rejects.toMatchObject({ status: 409 });
    const reissueKey = key();
    const reissued = await reissueCanonicalTeamInvitation({ ...f, invitationId: first.invitation.id, revision: 1, idempotencyKey: reissueKey });
    expect(reissued.token).not.toBe(first.token); expect(reissued.invitation.revision).toBe(2);
    expect(await reissueCanonicalTeamInvitation({ ...f, invitationId: first.invitation.id, revision: 1, idempotencyKey: reissueKey })).toEqual({ ...reissued, token: null, replayed: true });
    expect(await invite(f, who, { idempotencyKey })).toEqual({ ...first, token: null, replayed: true });
    await expect(inspectCanonicalTeamInvitation({ userId: who.userId, token: first.token! })).rejects.toMatchObject({ status: 404 });
    await expect(revokeCanonicalTeamInvitation({ ...f, invitationId: first.invitation.id, revision: 1, idempotencyKey: key() })).rejects.toMatchObject({ status: 409 });
  });

  it("derives expiration without writes, blocks duplicate pending even expired, and permits explicit revoke", async () => {
    const f = await fixture(); const who = await identity(); const pending = await invite(f, who);
    await db.execute(sql`update zaltyko.organization_member_invitations set expires_at=clock_timestamp()-interval '1 second' where id=${pending.invitation.id}::uuid`);
    const before = await snapshot(f.organizationId);
    expect((await listCanonicalTeamAccess(f)).invitations[0]).toMatchObject({ status: "pending", expired: true, revision: 1 });
    await expect(invite(f, who)).rejects.toMatchObject({ status: 409 });
    // O3: an expired link answers exactly like an unknown or used one.
    await expect(inspectCanonicalTeamInvitation({ userId: who.userId, token: pending.token! })).rejects.toMatchObject({ status: 404, message: expect.stringMatching(GENERIC_INVALID) });
    await expect(acceptCanonicalTeamInvitation({ userId: who.userId, token: pending.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 404, message: expect.stringMatching(GENERIC_INVALID) });
    expect(await snapshot(f.organizationId)).toEqual(before);
    const idempotencyKey = key();
    const result = await revokeCanonicalTeamInvitation({ ...f, invitationId: pending.invitation.id, revision: 1, idempotencyKey });
    expect(result).toEqual({ id: pending.invitation.id, status: "revoked", revision: 2, replayed: false });
    expect(await revokeCanonicalTeamInvitation({ ...f, invitationId: pending.invitation.id, revision: 1, idempotencyKey })).toEqual({ ...result, replayed: true });
  });

  it("inspects only the real confirmed Auth identity without consuming or writing", async () => {
    const f = await fixture(); const who = await identity(); const other = await identity(); const unconfirmed = await identity(undefined, false);
    const created = await invite(f, who); const waiting = await invite(f, unconfirmed);
    const before = await snapshot(f.organizationId);
    const inspection = await inspectCanonicalTeamInvitation({ userId: who.userId, token: created.token! });
    expect(inspection).toEqual({ organization: { id: f.organizationId, name: "Club sintético de equipo" }, role: "coach", locations: created.invitation.requestedLocations, joinable: true });
    expect(JSON.stringify(inspection)).not.toContain(who.email); expect(JSON.stringify(inspection)).not.toContain(who.userId);
    for (const attempt of [{ userId: other.userId, token: created.token! }, { userId: unconfirmed.userId, token: waiting.token! }, { userId: who.userId, token: "a".repeat(43) }]) {
      await expect(inspectCanonicalTeamInvitation(attempt)).rejects.toMatchObject({ status: 404, message: expect.stringMatching(GENERIC_INVALID) });
    }
    expect(await snapshot(f.organizationId)).toEqual(before);
  });

  it("accepts atomically once with exact selected scopes and never upserts prior membership", async () => {
    const f = await fixture(); const who = await identity(); const created = await invite(f, who, { role: "manager" }); const idempotencyKey = key();
    const accepted = await acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey });
    expect(accepted).toMatchObject({ replayed: false, membership: { role: "manager", status: "active", locationScopeMode: "selected" } });
    expect(accepted.membership.locations).toEqual(created.invitation.requestedLocations);
    const after = await snapshot(f.organizationId);
    expect(await acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey })).toEqual({ ...accepted, replayed: true });
    expect(await snapshot(f.organizationId)).toEqual(after);
    await expect(acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 404 });
    const revokedIdentity = await identity(); const another = await invite(f, revokedIdentity);
    await db.execute(sql`insert into zaltyko.organization_members(organization_id,user_id,role,status,location_scope_mode)
      values (${f.organizationId}::uuid,${revokedIdentity.userId}::uuid,'coach','revoked','selected')`);
    const beforeConflict = await snapshot(f.organizationId);
    await expect(acceptCanonicalTeamInvitation({ userId: revokedIdentity.userId, token: another.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 409 });
    expect(await snapshot(f.organizationId)).toEqual(beforeConflict);
    // A receipt is never permission to restore revoked access or report active.
    await db.execute(sql`update zaltyko.organization_members set status='revoked' where id=${accepted.membership.id}::uuid`);
    const beforeReplay = await snapshot(f.organizationId);
    await expect(acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey })).rejects.toMatchObject({ status: 409 });
    expect(await snapshot(f.organizationId)).toEqual(beforeReplay);
  });

  it("serializes concurrent accept and revoke to one winner with no partial scopes", async () => {
    for (let run = 0; run < 3; run += 1) {
      const f = await fixture(); const who = await identity(); const created = await invite(f, who);
      const outcomes = await Promise.allSettled([
        acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() }),
        revokeCanonicalTeamInvitation({ ...f, invitationId: created.invitation.id, revision: 1, idempotencyKey: key() }),
      ]);
      expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
      const state = await db.execute(sql`select i.status,i.revision,
        (select count(*)::int from zaltyko.organization_members m where m.organization_id=i.organization_id and m.user_id=${who.userId}::uuid) as members,
        (select count(*)::int from zaltyko.member_location_scopes s join zaltyko.organization_members m on m.organization_id=s.organization_id and m.id=s.member_id
          where m.organization_id=i.organization_id and m.user_id=${who.userId}::uuid) as scopes
        from zaltyko.organization_member_invitations i where i.id=${created.invitation.id}::uuid`);
      expect(state.rows[0]).toEqual(state.rows[0]?.status === "accepted"
        ? { status: "accepted", revision: 2, members: 1, scopes: 2 }
        : { status: "revoked", revision: 2, members: 0, scopes: 0 });
    }
  });

  it("serializes distinct-key concurrent accepts to one membership and one receipt", async () => {
    const f = await fixture(); const who = await identity(); const created = await invite(f, who);
    const outcomes = await Promise.allSettled([
      acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() }),
      acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() }),
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const counts = await db.execute(sql`select
      (select count(*)::int from zaltyko.organization_members where organization_id=${f.organizationId}::uuid and user_id=${who.userId}::uuid) as members,
      (select count(*)::int from zaltyko.organization_team_command_receipts where organization_id=${f.organizationId}::uuid and operation='accept') as receipts,
      (select count(*)::int from zaltyko.member_location_scopes s join zaltyko.organization_members m on m.organization_id=s.organization_id and m.id=s.member_id
        where m.organization_id=${f.organizationId}::uuid and m.user_id=${who.userId}::uuid) as scopes`);
    expect(counts.rows[0]).toEqual({ members: 1, receipts: 1, scopes: 2 });
  });

  it("rolls back membership, all scopes, token consumption and receipt when final audit fails", async () => {
    const f = await fixture(); const who = await identity(); const created = await invite(f, who);
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `ci_team_audit_failure_${suffix}`;
    const triggerName = `ci_team_audit_failure_${suffix}`;
    const before = await snapshot(f.organizationId);
    // This runs only after all candidate and disposable-target guards. Failure
    // occurs after the real writer inserted member, scopes and command receipt.
    await db.execute(sql.raw(`create function zaltyko.${functionName}() returns trigger language plpgsql as $ci_team_failure$ begin raise exception 'Synthetic final audit failure'; end; $ci_team_failure$`));
    try {
      await db.execute(sql.raw(`create trigger ${triggerName} before insert on zaltyko.audit_log for each row when (new.organization_id='${f.organizationId}'::uuid and new.action='team.invitation_accept') execute function zaltyko.${functionName}()`));
      await expect(acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 503 });
      expect(await snapshot(f.organizationId)).toEqual(before);
    } finally {
      await db.execute(sql.raw(`drop trigger if exists ${triggerName} on zaltyko.audit_log`));
      await db.execute(sql.raw(`drop function zaltyko.${functionName}()`));
    }
    expect((await acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() })).membership.status).toBe("active");
  });

  it("rolls back cross-organization, deactivated-site, and inviter-authority failures", async () => {
    const f = await fixture(); const foreign = await fixture(); const who = await identity();
    const before = await snapshot(f.organizationId); const foreignBefore = await snapshot(foreign.organizationId);
    await expect(invite(f, who, { locationIds: [f.locationA, foreign.locationB] })).rejects.toMatchObject({ status: 400 });
    expect(await snapshot(f.organizationId)).toEqual(before); expect(await snapshot(foreign.organizationId)).toEqual(foreignBefore);
    const created = await invite(f, who);
    await expectPgCode(db.execute(sql`insert into zaltyko.organization_member_invitation_scopes(organization_id,invitation_id,location_id)
      values (${f.organizationId}::uuid,${created.invitation.id}::uuid,${foreign.locationA}::uuid)`), "23503");
    await db.execute(sql`update zaltyko.locations set is_active=false where id=${f.locationB}::uuid`);
    const disabledSite = await snapshot(f.organizationId);
    await expect(acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 404 });
    expect(await snapshot(f.organizationId)).toEqual(disabledSite);
    await db.execute(sql`update zaltyko.locations set is_active=true where id=${f.locationB}::uuid`);
    await db.execute(sql`update zaltyko.organization_members set location_scope_mode='selected' where id=${f.actor.memberId}::uuid`);
    const inviterChanged = await snapshot(f.organizationId);
    await expect(acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 404 });
    expect(await snapshot(f.organizationId)).toEqual(inviterChanged);
  });

  it("denies coaches and selected-scope owners/admins, and cross-org resource use", async () => {
    const f = await fixture(); const who = await identity(); const created = await invite(f, who);
    for (const [role, mode] of [["coach", "all"], ["coach", "selected"], ["owner", "selected"], ["admin", "selected"]] as const) {
      const { actor } = await memberOf(f, role, mode, mode === "selected" ? [f.locationA, f.locationB] : []);
      const before = await snapshot(f.organizationId);
      await expect(listCanonicalTeamAccess({ ...f, actor })).rejects.toMatchObject({ status: 403 });
      await expect(invite({ ...f, actor }, await identity())).rejects.toMatchObject({ status: 403 });
      await expect(revokeCanonicalTeamInvitation({ ...f, actor, invitationId: created.invitation.id, revision: 1, idempotencyKey: key() })).rejects.toMatchObject({ status: 403 });
      expect(await snapshot(f.organizationId)).toEqual(before);
    }
    const foreign = await fixture(); const before = await snapshot(foreign.organizationId);
    await expect(revokeCanonicalTeamInvitation({ ...foreign, invitationId: created.invitation.id, revision: 1, idempotencyKey: key() })).rejects.toMatchObject({ status: 404 });
    expect(await snapshot(foreign.organizationId)).toEqual(before);
  });

  it("keeps idempotency actor-scoped without audit-key collisions", async () => {
    const f = await fixture(); const anotherOwner = await identity(); const memberId = randomUUID();
    await db.execute(sql`insert into zaltyko.organization_members(id,organization_id,user_id,role,status,location_scope_mode)
      values (${memberId}::uuid,${f.organizationId}::uuid,${anotherOwner.userId}::uuid,'owner','active','all')`);
    const sharedKey = key();
    const first = await invite(f, await identity(), { idempotencyKey: sharedKey });
    const second = await invite({ ...f, actor: { userId: anotherOwner.userId, memberId } }, await identity(), { idempotencyKey: sharedKey });
    expect(second.invitation.id).not.toBe(first.invitation.id);
    const counts = await db.execute(sql`select
      (select count(*)::int from zaltyko.organization_team_command_receipts where organization_id=${f.organizationId}::uuid) as receipts,
      (select count(*)::int from zaltyko.audit_log where organization_id=${f.organizationId}::uuid) as audits`);
    expect(counts.rows[0]).toEqual({ receipts: 2, audits: 2 });
  });

  it("exports a verifiable Owner archive after the candidate without exporting invitation secrets or PII", async () => {
    const f = await fixture(); const who = await identity(); const created = await invite(f, who);
    const before = await snapshot(f.organizationId);
    const result = await exportCanonicalAcademyData({ userId: f.actor.userId, organizationId: f.organizationId });
    expect(validateCanonicalAcademyArchive({ body: result.body, organizationId: f.organizationId })).toMatchObject({ valid: true, checksumsVerified: true, tenantScopeVerified: true, restorable: false });
    expect(result.body).not.toContain(who.email); expect(result.body).not.toContain(created.token!); expect(result.body).not.toContain(sha(created.token!));
    const archive = JSON.parse(result.body);
    for (const table of tables) {
      expect(archive.coverage.excludedTables).toContainEqual(expect.objectContaining({ table, rowCount: table === "organization_member_invitation_scopes" ? 2 : 1, valuesExported: false }));
    }
    expect(await snapshot(f.organizationId)).toEqual(before);
  });

  // ---------------------------------------------------------------------------
  // O3: team profile link, inviter authority, plan read-only, deterministic race
  // ---------------------------------------------------------------------------

  it("acceptance creates the named team profile and links staff_profiles.member_id", async () => {
    const f = await fixture(); const who = await identity();
    const created = await invite(f, who, { givenName: "Lúa", familyName: "Pérez" });
    expect(created.invitation.person).toEqual({ kind: "new", staffProfileId: null, name: "Lúa Pérez" });
    expect(created.delivery).toBe("manual_link");
    const accepted = await acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() });
    const profiles = await linkedProfile(f.organizationId, accepted.membership.id);
    expect(profiles).toEqual([{ id: accepted.membership.staffProfileId, given_name: "Lúa", family_name: "Pérez", is_active: true }]);
    const list = await listCanonicalTeamAccess(f);
    expect(list.members.find(member => member.id === accepted.membership.id)?.staffProfile).toEqual({ id: accepted.membership.staffProfileId, name: "Lúa Pérez" });
    const audit = await db.execute(sql`select metadata from zaltyko.audit_log where organization_id=${f.organizationId}::uuid and action='team.invitation_accept'`);
    expect(audit.rows[0]).toMatchObject({ metadata: { staffProfileId: accepted.membership.staffProfileId } });
  });

  it("acceptance links an existing team profile once; it cannot be targeted twice nor linked if it changed", async () => {
    const f = await fixture(); const profileId = await staffProfile(f.organizationId, "Bea", "Martín");
    expect((await listCanonicalTeamAccess(f)).linkableStaffProfiles).toContainEqual({ id: profileId, name: "Bea Martín" });
    const who = await identity();
    const created = await invite(f, who, { staffProfileId: profileId });
    expect(created.invitation.person).toEqual({ kind: "existing", staffProfileId: profileId, name: "Bea Martín" });
    // While pending, the profile is no longer offered nor can be targeted again.
    expect((await listCanonicalTeamAccess(f)).linkableStaffProfiles.map(item => item.id)).not.toContain(profileId);
    await expect(invite(f, await identity(), { staffProfileId: profileId })).rejects.toMatchObject({ status: 409 });
    const accepted = await acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() });
    expect(accepted.membership.staffProfileId).toBe(profileId);
    expect((await linkedProfile(f.organizationId, accepted.membership.id)).map(row => row.id)).toEqual([profileId]);
    await expect(invite(f, await identity(), { staffProfileId: profileId })).rejects.toMatchObject({ status: 409 });

    // Archived or meanwhile-linked profiles: invitation refused / acceptance rolled back.
    const archived = await staffProfile(f.organizationId, "Archivada", "Ficha");
    await db.execute(sql`update zaltyko.staff_profiles set is_active=false where id=${archived}::uuid`);
    await expect(invite(f, await identity(), { staffProfileId: archived })).rejects.toMatchObject({ status: 409 });
    const raced = await staffProfile(f.organizationId, "Cambiada", "Ficha"); const late = await identity();
    const pending = await invite(f, late, { staffProfileId: raced });
    await db.execute(sql`update zaltyko.staff_profiles set member_id=${f.actor.memberId}::uuid where id=${raced}::uuid`);
    const before = await snapshot(f.organizationId);
    await expect(acceptCanonicalTeamInvitation({ userId: late.userId, token: pending.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 409 });
    expect(await snapshot(f.organizationId)).toEqual(before);
    // A profile of another academy cannot be named.
    const foreign = await fixture(); const foreignProfile = await staffProfile(foreign.organizationId);
    await expect(invite(f, await identity(), { staffProfileId: foreignProfile })).rejects.toMatchObject({ status: 400 });
  });

  it("owner and admin with every site invite managers; a manager invites only coaches in their own sites", async () => {
    const f = await fixture();
    const admin = await memberOf(f, "admin", "all");
    expect((await invite(admin, await identity(), { role: "manager" })).invitation.role).toBe("manager");
    const manager = await memberOf(f, "manager", "selected", [f.locationA]);
    const ownerInvitation = await invite(f, await identity(), { locationIds: [f.locationA, f.locationB] });
    const before = await snapshot(f.organizationId);
    await expect(invite(manager, await identity(), { role: "manager", locationIds: [f.locationA] })).rejects.toMatchObject({ status: 403 });
    await expect(invite(manager, await identity(), { locationIds: [f.locationA, f.locationB] })).rejects.toMatchObject({ status: 403 });
    await expect(revokeCanonicalTeamInvitation({ ...manager, invitationId: ownerInvitation.invitation.id, revision: 1, idempotencyKey: key() })).rejects.toMatchObject({ status: 403 });
    expect(await snapshot(f.organizationId)).toEqual(before);
    // Profiles carry no site: a manager neither sees nor links existing ones,
    // and cannot manage an invitation that names one.
    const existing = await staffProfile(f.organizationId, "Ficha", "Ajena");
    await expect(invite(manager, await identity(), { locationIds: [f.locationA], staffProfileId: existing })).rejects.toMatchObject({ status: 403 });
    const ownerExisting = await invite(f, await identity(), { locationIds: [f.locationA], staffProfileId: existing });
    await expect(reissueCanonicalTeamInvitation({ ...manager, invitationId: ownerExisting.invitation.id, revision: 1, idempotencyKey: key() })).rejects.toMatchObject({ status: 403 });
    await expect(revokeCanonicalTeamInvitation({ ...manager, invitationId: ownerExisting.invitation.id, revision: 1, idempotencyKey: key() })).rejects.toMatchObject({ status: 403 });
    const coachUser = await identity();
    const own = await invite(manager, coachUser, { locationIds: [f.locationA] });
    const view = await listCanonicalTeamAccess(manager);
    expect(view.viewer).toEqual({ role: "manager", invitableRoles: ["coach"] });
    expect(view.activeLocations.map(location => location.id)).toEqual([f.locationA]);
    expect(view.invitations.map(item => item.id)).toEqual([own.invitation.id]);
    expect(view.linkableStaffProfiles).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("Ajena");
    expect(view.members.every(member => member.role === "coach")).toBe(true);
    // If the manager loses the site before acceptance, the link stops working.
    await db.execute(sql`delete from zaltyko.member_location_scopes where member_id=${manager.actor.memberId}::uuid`);
    await expect(acceptCanonicalTeamInvitation({ userId: coachUser.userId, token: own.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 404, message: expect.stringMatching(GENERIC_INVALID) });
  });

  it("isolates academies: another academy's owner sees and manages nothing of this one", async () => {
    const f = await fixture(); const foreign = await fixture(); const who = await identity();
    const created = await invite(f, who);
    const foreignView = await listCanonicalTeamAccess(foreign);
    expect(foreignView.invitations).toEqual([]);
    expect(JSON.stringify(foreignView)).not.toContain(who.email);
    await expect(listCanonicalTeamAccess({ ...f, actor: foreign.actor })).rejects.toMatchObject({ status: 403 });
    await expect(reissueCanonicalTeamInvitation({ ...foreign, invitationId: created.invitation.id, revision: 1, idempotencyKey: key() })).rejects.toMatchObject({ status: 404 });
  });

  it("rejects another account, even with the right link, and leaves the invitation pending", async () => {
    const f = await fixture(); const who = await identity(); const intruder = await identity();
    const created = await invite(f, who);
    const before = await snapshot(f.organizationId);
    await expect(acceptCanonicalTeamInvitation({ userId: intruder.userId, token: created.token!, idempotencyKey: key() })).rejects.toMatchObject({ status: 404, message: expect.stringMatching(GENERIC_INVALID) });
    expect(await snapshot(f.organizationId)).toEqual(before);
    expect((await acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() })).membership.status).toBe("active");
  });

  it("in plan read-only mode blocks invite, reissue and acceptance but still allows revoking", async () => {
    const f = await fixture(); const who = await identity(); const created = await invite(f, who);
    await db.execute(sql`
      with new_people as (
        insert into zaltyko.people (organization_id, given_name, family_name)
        select ${f.organizationId}::uuid, 'Capacidad sintética', series.n::text from generate_series(1, 31) as series(n)
        returning id
      )
      insert into zaltyko.athletes (organization_id, person_id) select ${f.organizationId}::uuid, new_people.id from new_people`);
    expect(await inspectCanonicalTeamInvitation({ userId: who.userId, token: created.token! })).toMatchObject({ joinable: false });
    const before = await snapshot(f.organizationId);
    await expect(invite(f, await identity())).rejects.toMatchObject({ status: 409, code: "PLAN_OVER_CAPACITY" });
    await expect(reissueCanonicalTeamInvitation({ ...f, invitationId: created.invitation.id, revision: 1, idempotencyKey: key() })).rejects.toMatchObject({ status: 409, code: "PLAN_OVER_CAPACITY" });
    const refused = await acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() }).catch(error => error);
    expect(refused).toMatchObject({ status: 409 });
    expect(String(refused.message)).not.toMatch(/plan|límite/iu);
    expect(await snapshot(f.organizationId)).toEqual(before);
    expect(await revokeCanonicalTeamInvitation({ ...f, invitationId: created.invitation.id, revision: 1, idempotencyKey: key() })).toMatchObject({ status: "revoked" });
  });

  it("deterministic double acceptance: two requests queued on the invitation row lock yield one member, one profile and one receipt", async () => {
    const f = await fixture(); const who = await identity(); const created = await invite(f, who);
    let locked!: (pid: number) => void; let release!: () => void;
    const lockedSignal = new Promise<number>(resolveLocked => { locked = resolveLocked; });
    const gate = new Promise<void>(resolveGate => { release = resolveGate; });
    const holder = db.transaction(async tx => {
      await tx.execute(sql`select id from zaltyko.organization_member_invitations where id=${created.invitation.id}::uuid for update`);
      const pid = await tx.execute(sql`select pg_backend_pid()::int as pid`);
      locked(Number((pid.rows[0] as { pid: number }).pid));
      await gate;
    });
    const holderPid = await lockedSignal;
    const first = acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() });
    const second = acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() });
    // Both acceptances are now waiting on the same invitation row before release.
    await waitForLockWaiters(holderPid, 2);
    release();
    await holder;
    const outcomes = await Promise.allSettled([first, second]);
    const fulfilled = outcomes.filter(outcome => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 404, message: expect.stringMatching(GENERIC_INVALID) });
    const counts = await db.execute(sql`select
      (select count(*)::int from zaltyko.organization_members where organization_id=${f.organizationId}::uuid and user_id=${who.userId}::uuid) as members,
      (select count(*)::int from zaltyko.staff_profiles s join zaltyko.organization_members m on m.organization_id=s.organization_id and m.id=s.member_id
        where m.organization_id=${f.organizationId}::uuid and m.user_id=${who.userId}::uuid) as profiles,
      (select count(*)::int from zaltyko.organization_team_command_receipts where organization_id=${f.organizationId}::uuid and operation='accept') as receipts`);
    expect(counts.rows[0]).toEqual({ members: 1, profiles: 1, receipts: 1 });
  }, 30_000);

  it("does not trust email_confirmed_at alone: needs an email identity or a verified allow-listed OAuth one", async () => {
    const f = await fixture();
    const attempt = async (who: Awaited<ReturnType<typeof identity>>) => {
      const created = await invite(f, who);
      return acceptCanonicalTeamInvitation({ userId: who.userId, token: created.token!, idempotencyKey: key() });
    };
    for (const who of [
      await identity(undefined, true, { provider: "none" }),
      await identity(undefined, true, { provider: "github", emailVerified: true }),
      await identity(undefined, true, { provider: "google", emailVerified: false }),
      await identity(undefined, true, { provider: "google" }),
      await identity(undefined, true, { provider: "email", identityEmail: "otra@example.invalid" }),
    ]) {
      await expect(attempt(who)).rejects.toMatchObject({ status: 404, message: expect.stringMatching(GENERIC_INVALID) });
    }
    expect((await attempt(await identity(undefined, true, { provider: "google", emailVerified: true }))).membership.status).toBe("active");
  });

  it("matches the invited email regardless of case and surrounding spaces", async () => {
    const f = await fixture(); const userId = randomUUID(); const base = `Mixed.${userId}@Example.Invalid`;
    await db.execute(sql`insert into auth.users(id,email,email_confirmed_at) values (${userId}::uuid,${` ${base} `},now())`);
    await db.execute(sql`insert into auth.identities(provider_id,user_id,identity_data,provider)
      values (${`email-${userId}`},${userId}::uuid,${JSON.stringify({ sub: userId, email: base })}::jsonb,'email')`);
    const created = await createCanonicalTeamInvitation({ ...f, email: `  ${base.toUpperCase()} `, role: "coach", locationIds: [f.locationA],
      givenName: "Mixta", familyName: "Mayúsculas", idempotencyKey: key() });
    expect(created.invitation.email).toBe(base.toLowerCase());
    expect((await acceptCanonicalTeamInvitation({ userId, token: created.token!, idempotencyKey: key() })).membership.status).toBe("active");
  });

  it("the database also refuses two pending invitations for the same team profile", async () => {
    const f = await fixture(); const profileId = await staffProfile(f.organizationId);
    const created = await invite(f, await identity(), { staffProfileId: profileId });
    await expectPgCode(db.execute(sql`insert into zaltyko.organization_member_invitations
      (organization_id,normalized_email,role,invited_by_member_id,token_sha256,expires_at,staff_profile_id)
      values (${f.organizationId}::uuid,'otra@example.invalid','coach',${f.actor.memberId}::uuid,${sha(randomUUID())},now()+interval '7 days',${profileId}::uuid)`), "23505");
    expect(created.invitation.person.staffProfileId).toBe(profileId);
  });
});
