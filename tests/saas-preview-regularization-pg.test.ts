import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { DatabaseClient, TransactionClient } from "@/lib/db-transactions";
import { getOrganizationUsage, assertOrganizationOperationalWritable, assertOrganizationResourceCapacity } from "@/modules/saas-billing/application/organization-usage";
import { archiveResourceInTransaction, getRegularizationStatusInTransaction } from "@/modules/saas-billing/application/regularization-service";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { createAthleteForGroup } from "@/modules/groups/application/group-membership-service";
import { createOperationalGroup } from "@/modules/groups/application/group-management-service";
import { createScheduledClass } from "@/modules/scheduling/application/class-management-service";
import { createEnrollmentInTransaction } from "@/modules/enrollments/application/enrollment-service";
import { isMetricSourceEvent } from "@/modules/analytics/application/metric-engine";

// Remote-only. The existing QA academy is observed, never reactivated or archived.
// Successful mutation coverage uses ONE separate synthetic organization and rolls back.
const org = "ea613b46-f1e2-44b3-8d2f-1a4b98c9e481";
const location = "0d47b1d1-ea68-4240-a343-57eca7e7849e";
const rollback = new Error("ROLLBACK_SYNTHETIC_QA_ONLY");
const observedTables = [
  "athletes", "audit_log", "class_template_groups", "class_template_weekdays",
  "class_templates", "enrollments", "enrollment_status_history", "group_membership_history", "group_memberships",
  "groups", "outbox_events", "people", "session_staff", "sessions",
  "organization_entitlements", "organization_entitlement_changes",
  "organization_saas_trials", "organization_saas_subscriptions",
  "organization_saas_customers", "organization_saas_checkout_operations",
  "organization_saas_webhook_events", "organization_saas_webhook_reconciliation_decisions",
] as const;

function target() {
  expect(process.env.VERCEL).toBe("1");
  expect(process.env.VERCEL_ENV).toBe("preview");
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://aeeootdmuiqkfeernskw.supabase.co");
}

async function snapshot(organizationId: string, client: DatabaseClient = db) {
  // Fixed allowlist; compare counts AND complete ordered row contents, not only names.
  const rows = sql.join(observedTables.map(table => sql`
    select ${table}::text as table_name, count(*)::int as count,
      md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
    from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r
    where r.organization_id = ${organizationId}::uuid
  `), sql` union all `);
  const result = await client.execute(sql`select * from (${rows}) snapshots order by table_name`);
  return result.rows;
}

async function qaOwner(tx: TransactionClient) {
  const owners = (await tx.execute(sql`select id, user_id from zaltyko.organization_members where organization_id = ${org}::uuid and role = 'owner' and status = 'active' order by id`)).rows;
  expect(owners).toHaveLength(1);
  return { userId: String(owners[0].user_id), memberId: String(owners[0].id) };
}

async function assertQaBaseline(tx: TransactionClient) {
  const usage = await getOrganizationUsage(tx, org);
  expect(usage.planCode).toBe("free");
  expect(usage.readOnly).toBe(false);
  expect(usage.resources.map(item => item.current)).toEqual([30, 3, 10]);
  return usage;
}

describe("sandbox PostgreSQL regularization (remote / rollback)", () => {
  it("fails closed if the already-regularized QA baseline or Owner access changes", async () => {
    target();
    expect(isMetricSourceEvent("saas.resource_archived")).toBe(true);
    await db.transaction(async tx => {
      await assertQaBaseline(tx);
      const actor = await qaOwner(tx);
      await expect(assertOperationalAccess(tx, { organizationId: org, locationId: location, actor, allowedRoles: ["owner"] })).resolves.toBeTruthy();
      await expect(assertOperationalAccess(tx, { organizationId: org, locationId: location, actor, allowedRoles: ["owner"], intent: "write" })).resolves.toBeTruthy();
      await expect(assertOperationalAccess(tx, { organizationId: org, locationId: location, actor: { ...actor, userId: randomUUID() }, allowedRoles: ["owner"], intent: "write" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("archives only selected resources, preserves people/history, replays once and unfreezes only after every excess is resolved", async () => {
    target();
    const before = await snapshot(org);
    const fixtureOrg = randomUUID();
    const fixtureLocation = randomUUID();
    const fixtureMember = randomUUID();
    const people = Array.from({ length: 32 }, () => ({ person: randomUUID(), athlete: randomUUID() }));
    const groups = Array.from({ length: 4 }, () => randomUUID());
    const classes = Array.from({ length: 11 }, () => randomUUID());
    const athlete = people[30];
    const secondExcessAthlete = people[31];
    const withinLimitAthlete = people[0];
    const group = groups[3];
    const cls = classes[10];
    const membership = randomUUID();
    const session = randomUUID();
    const outcome = await db.transaction(async tx => {
      await tx.execute(sql`set local statement_timeout = '15000'`);
      await assertQaBaseline(tx);
      const owner = await qaOwner(tx);
      // Reuse only the existing auth user's ID in a temporary membership. No Auth
      // account, real membership, trial, entitlement or archived resource is changed.
      await tx.execute(sql`insert into zaltyko.organizations (id, name, status) values (${fixtureOrg}::uuid, 'QA ROLLBACK ONLY', 'active')`);
      // The real organization trigger creates Free plus its revision history.
      // Do not insert a duplicate projection or bypass that canonical bootstrap.
      const bootstrap = await getOrganizationUsage(tx, fixtureOrg);
      expect(bootstrap.planCode).toBe("free");
      expect(bootstrap.readOnly).toBe(false);
      expect(bootstrap.resources.map(item => item.current)).toEqual([0, 0, 0]);
      await tx.execute(sql`insert into zaltyko.locations (id, organization_id, code, name) values (${fixtureLocation}::uuid, ${fixtureOrg}::uuid, 'qa-rollback', 'QA rollback only')`);
      await tx.execute(sql`insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode) values (${fixtureMember}::uuid, ${fixtureOrg}::uuid, ${owner.userId}::uuid, 'owner', 'active', 'all')`);
      await tx.execute(sql`insert into zaltyko.people (id, organization_id, given_name, family_name) values ${sql.join(people.map((item, index) => sql`(${item.person}::uuid, ${fixtureOrg}::uuid, ${`QA ${index + 1}`}, 'Synthetic rollback')`), sql`, `)}`);
      await tx.execute(sql`insert into zaltyko.athletes (id, organization_id, person_id) values ${sql.join(people.slice(0, 30).map(item => sql`(${item.athlete}::uuid, ${fixtureOrg}::uuid, ${item.person}::uuid)`), sql`, `)}`);
      await tx.execute(sql`insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status) values ${sql.join(groups.map((id, index) => sql`(${id}::uuid, ${fixtureOrg}::uuid, ${fixtureLocation}::uuid, ${`QA rollback group ${index + 1}`}, 30, 'active')`), sql`, `)}`);
      await tx.execute(sql`insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from) values ${sql.join(classes.map((id, index) => sql`(${id}::uuid, ${fixtureOrg}::uuid, ${fixtureLocation}::uuid, ${`QA rollback class ${index + 1}`}, 30, 'active', current_date)`), sql`, `)}`);
      await tx.execute(sql`insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at) values (${session}::uuid, ${fixtureOrg}::uuid, ${fixtureLocation}::uuid, ${cls}::uuid, 'scheduled', current_timestamp + interval '1 day', current_timestamp + interval '1 day 1 hour')`);
      const initial = await getOrganizationUsage(tx, fixtureOrg);
      expect(initial.readOnly).toBe(true);
      expect(initial.resources.map(item => item.current)).toEqual([30, 4, 11]);
      const actor = { userId: owner.userId, memberId: fixtureMember };
      await expect(assertOperationalAccess(tx, { organizationId: fixtureOrg, locationId: fixtureLocation, actor, allowedRoles: ["owner"] })).resolves.toBeTruthy();
      await expect(assertOperationalAccess(tx, { organizationId: fixtureOrg, locationId: fixtureLocation, actor, allowedRoles: ["owner"], intent: "write" })).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
      await expect(assertOperationalAccess(tx, { organizationId: fixtureOrg, locationId: fixtureLocation, actor: { ...actor, userId: randomUUID() }, allowedRoles: ["owner"], intent: "write" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      const base = { userId: owner.userId, organizationId: fixtureOrg };
      const withinLimitSnapshot = await snapshot(fixtureOrg, tx);
      await expect(getRegularizationStatusInTransaction(tx, { ...base, resource: "athletes" })).resolves.toMatchObject({ items: [], next: null });
      await expect(archiveResourceInTransaction(tx, { ...base, resource: "athletes", resourceId: withinLimitAthlete.athlete, idempotencyKey: `qa-archive-${randomUUID()}` })).rejects.toMatchObject({ code: "RESOURCE_NOT_OVER_LIMIT", status: 409 });
      expect(await snapshot(fixtureOrg, tx)).toEqual(withinLimitSnapshot);

      await tx.execute(sql`insert into zaltyko.athletes (id, organization_id, person_id) values (${athlete.athlete}::uuid, ${fixtureOrg}::uuid, ${athlete.person}::uuid), (${secondExcessAthlete.athlete}::uuid, ${fixtureOrg}::uuid, ${secondExcessAthlete.person}::uuid)`);
      await tx.execute(sql`insert into zaltyko.group_memberships (id, organization_id, group_id, athlete_id, status, starts_on) values (${membership}::uuid, ${fixtureOrg}::uuid, ${group}::uuid, ${athlete.athlete}::uuid, 'active', current_date)`);
      const overLimit = await getOrganizationUsage(tx, fixtureOrg);
      expect(overLimit.resources.map(item => item.current)).toEqual([32, 4, 11]);
      const overLimitSnapshot = await snapshot(fixtureOrg, tx);
      await expect(createEnrollmentInTransaction(tx, {
        organizationId: fixtureOrg,
        locationId: fixtureLocation,
        athleteId: withinLimitAthlete.athlete,
        classTemplateId: classes[0],
        startsOn: "2099-10-26",
        status: "pending",
        source: "owner",
        pricePlanId: null,
        idempotencyKey: `qa-block-enrollment-${randomUUID()}`,
        actor,
      })).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
      expect(await snapshot(fixtureOrg, tx)).toEqual(overLimitSnapshot);
      const input = { ...base, resource: "athletes" as const, resourceId: athlete.athlete, idempotencyKey: `qa-archive-${randomUUID()}` };
      const first = await archiveResourceInTransaction(tx, input);
      expect(first.resources[0].current).toBe(31);
      expect(first.readOnly).toBe(true); // groups/classes still exceed
      await archiveResourceInTransaction(tx, input);
      const audits = (await tx.execute(sql`select count(*)::int as count from zaltyko.audit_log where organization_id = ${fixtureOrg}::uuid and idempotency_key = ${input.idempotencyKey}`)).rows[0];
      expect(audits.count).toBe(1);
      const kept = (await tx.execute(sql`select a.is_active, p.id, (select count(*)::int from zaltyko.group_memberships m where m.organization_id = a.organization_id and m.athlete_id = a.id and m.status in ('active','pending','paused')) as open from zaltyko.athletes a join zaltyko.people p on p.organization_id = a.organization_id and p.id = a.person_id where a.organization_id = ${fixtureOrg}::uuid and a.id = ${athlete.athlete}::uuid`)).rows[0];
      expect(kept.is_active).toBe(false); expect(kept.id).toBe(athlete.person); expect(kept.open).toBe(0);
      const history = (await tx.execute(sql`select count(*)::int as count from zaltyko.group_membership_history where organization_id = ${fixtureOrg}::uuid and membership_id = ${membership}::uuid and from_status = 'active' and to_status = 'ended'`)).rows[0];
      expect(history.count).toBe(1);
      await expect(archiveResourceInTransaction(tx, { ...base, resource: "athletes", resourceId: athlete.athlete, idempotencyKey: `qa-archive-${randomUUID()}` })).rejects.toMatchObject({ code: "NOT_FOUND" });
      const secondAthleteArchive = await archiveResourceInTransaction(tx, { ...base, resource: "athletes", resourceId: secondExcessAthlete.athlete, idempotencyKey: `qa-archive-${randomUUID()}` });
      expect(secondAthleteArchive.resources[0].current).toBe(30);
      const afterAthleteExcess = await snapshot(fixtureOrg, tx);
      await expect(archiveResourceInTransaction(tx, { ...base, resource: "athletes", resourceId: withinLimitAthlete.athlete, idempotencyKey: `qa-archive-${randomUUID()}` })).rejects.toMatchObject({ code: "RESOURCE_NOT_OVER_LIMIT" });
      expect(await snapshot(fixtureOrg, tx)).toEqual(afterAthleteExcess);
      const second = await archiveResourceInTransaction(tx, { ...base, resource: "groups", resourceId: group, idempotencyKey: `qa-archive-${randomUUID()}` });
      expect(second.resources.map(item => item.current)).toEqual([30, 3, 11]);
      expect(second.readOnly).toBe(true);
      const third = await archiveResourceInTransaction(tx, { ...base, resource: "classes", resourceId: cls, idempotencyKey: `qa-archive-${randomUUID()}` });
      expect(third.resources.map(item => item.current)).toEqual([30,3,10]);
      expect(third.readOnly).toBe(false);
      const selected = (await tx.execute(sql`select (select status::text from zaltyko.groups where organization_id = ${fixtureOrg}::uuid and id = ${group}::uuid) as group_status, (select status::text from zaltyko.class_templates where organization_id = ${fixtureOrg}::uuid and id = ${cls}::uuid) as class_status`)).rows[0];
      expect(selected).toEqual({ group_status: "archived", class_status: "archived" });
      await assertOrganizationOperationalWritable(tx, fixtureOrg);
      for (const resource of ["athletes", "groups", "classes"] as const) {
        await expect(assertOrganizationResourceCapacity(tx, fixtureOrg, resource)).rejects.toMatchObject({ code: "CAPACITY_FULL" });
      }
      const sessions = (await tx.execute(sql`select id, status from zaltyko.sessions where organization_id = ${fixtureOrg}::uuid and class_template_id = ${cls}::uuid and starts_at >= current_timestamp`)).rows;
      expect(sessions).toEqual([{ id: session, status: "cancelled" }]);
      const retained = (await tx.execute(sql`select (select count(*)::int from zaltyko.people where organization_id = ${fixtureOrg}::uuid) as people, (select count(*)::int from zaltyko.athletes where organization_id = ${fixtureOrg}::uuid) as athletes, (select count(*)::int from zaltyko.groups where organization_id = ${fixtureOrg}::uuid) as groups, (select count(*)::int from zaltyko.class_templates where organization_id = ${fixtureOrg}::uuid) as classes`)).rows[0];
      expect(retained).toEqual({ people: 32, athletes: 32, groups: 4, classes: 11 });
      const withinAllLimits = await snapshot(fixtureOrg, tx);
      for (const [resource, resourceId] of [["athletes", withinLimitAthlete.athlete], ["groups", groups[0]], ["classes", classes[0]]] as const) {
        await expect(archiveResourceInTransaction(tx, { ...base, resource, resourceId, idempotencyKey: `qa-archive-${randomUUID()}` })).rejects.toMatchObject({ code: "RESOURCE_NOT_OVER_LIMIT", status: 409 });
        expect(await snapshot(fixtureOrg, tx)).toEqual(withinAllLimits);
      }
      await expect(archiveResourceInTransaction(tx, { ...input, resourceId: randomUUID() })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await expect(archiveResourceInTransaction(tx, { ...base, resource: "athletes", resourceId: randomUUID(), idempotencyKey: `qa-archive-${randomUUID()}` })).rejects.toMatchObject({ code: "RESOURCE_NOT_OVER_LIMIT" });
      const full = await snapshot(fixtureOrg, tx);
      // Public commands own db.transaction. Route ONLY that boundary to real
      // nested PostgreSQL savepoints on the fixture's outer transaction. Guards,
      // authorization and all SQL remain real. Even a successful regression can
      // only release a savepoint; the outer transaction MUST still roll back.
      // db is a lazy Proxy, so its virtual transaction property has no own
      // descriptor to spy on. PgDatabase delegates it to this real session.
      const commandSession = Reflect.get(db, "session") as { transaction: typeof db.transaction };
      const transaction = vi.spyOn(commandSession, "transaction").mockImplementation(callback => tx.transaction(callback));
      try {
        await expect(createAthleteForGroup({
          organizationId: fixtureOrg,
          groupId: groups[0],
          givenName: "QA BLOCKED",
          familyName: "Athlete",
          idempotencyKey: `qa-block-${randomUUID()}`,
          actor,
        })).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
        expect(await snapshot(fixtureOrg, tx)).toEqual(full);

        await expect(createOperationalGroup({ organizationId: fixtureOrg, locationId: fixtureLocation, programId: null, name: "QA MUST NOT EXIST", capacity: 30, idempotencyKey: `qa-block-${randomUUID()}`, actor })).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
        expect(await snapshot(fixtureOrg, tx)).toEqual(full);
        await expect(createScheduledClass({ organizationId: fixtureOrg, locationId: fixtureLocation, programId: null, name: "QA MUST NOT EXIST", capacity: 30, effectiveFrom: "2099-10-26", effectiveTo: "2099-10-26", schedule: [{ isoWeekday: 1, startsAtLocal: "08:00", endsAtLocal: "09:00" }], idempotencyKey: `qa-block-${randomUUID()}`, actor })).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY" });
        expect(await snapshot(fixtureOrg, tx)).toEqual(full);
        const absent = (await tx.execute(sql`select (select count(*)::int from zaltyko.groups where organization_id = ${fixtureOrg}::uuid and name = 'QA MUST NOT EXIST') + (select count(*)::int from zaltyko.class_templates where organization_id = ${fixtureOrg}::uuid and name = 'QA MUST NOT EXIST') as count`)).rows[0];
        expect(absent.count).toBe(0);
      } finally {
        transaction.mockRestore();
      }
      throw rollback;
    }).catch((error: unknown) => error);
    expect(await snapshot(org)).toEqual(before);
    const remaining = (await db.execute(sql`select count(*)::int as count from zaltyko.organizations where id = ${fixtureOrg}::uuid`)).rows[0];
    expect(remaining.count).toBe(0);
    expect((await snapshot(fixtureOrg)).every(row => row.count === 0)).toBe(true);
    expect(outcome).toBe(rollback);
  });

  it("keeps all three QA limits full without changing its 22-table snapshot", async () => {
    target();
    const before = await snapshot(org);
    await db.transaction(async tx => {
      await assertQaBaseline(tx);
      for (const resource of ["athletes", "groups", "classes"] as const) {
        await expect(assertOrganizationResourceCapacity(tx, org, resource)).rejects.toMatchObject({ code: "CAPACITY_FULL" });
      }
    });
    expect(await snapshot(org)).toEqual(before);
  });
});
