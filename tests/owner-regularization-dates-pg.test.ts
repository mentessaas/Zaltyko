import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient, TransactionClient } from "@/lib/db-transactions";
import { getDatabaseUrl } from "@/lib/env";
import { archiveResourceInTransaction } from "@/modules/saas-billing/application/regularization-service";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";

const disposablePgEnabled = process.env.ZALTYKO_PG_INTEGRATION === "1";
const describeDisposablePg = describe.skipIf(!disposablePgEnabled);
const rollback = new Error("ROLLBACK_SYNTHETIC_REGULARIZATION_ONLY");

const snapshotTables = [
  "audit_log",
  "athletes",
  "class_templates",
  "enrollment_status_history",
  "enrollments",
  "group_membership_history",
  "group_memberships",
  "groups",
  "organization_entitlement_changes",
  "organization_entitlements",
  "organization_members",
  "outbox_events",
  "people",
] as const;

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
  let parsed: URL;
  try {
    parsed = new URL(connectionString ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  const configuredUrls = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ];
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" ||
    !parsed.port ||
    !parsed.password ||
    parsed.pathname !== "/postgres" ||
    configuredUrls.some((value) => value !== connectionString) ||
    getDatabaseUrl() !== connectionString
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

async function snapshot(
  organizationId: string,
  client: DatabaseClient = db
): Promise<Record<string, { count: number; hash: string }>> {
  const rows = sql.join(
    snapshotTables.map((table) => sql`
      select ${table}::text as table_name,
        count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
      from zaltyko.${sql.identifier(table)} as row_data
      where row_data.organization_id = ${organizationId}::uuid
    `),
    sql` union all `
  );
  const result = await client.execute(
    sql`select * from (${rows}) snapshots order by table_name`
  );
  return Object.fromEntries(
    result.rows.map((row) => [
      String(row.table_name),
      { count: Number(row.count), hash: String(row.content_hash) },
    ])
  );
}

describeDisposablePg("Owner SaaS regularization date integrity (disposable PostgreSQL)", () => {
  it("preserves historical ends and closes future memberships/enrollments at their starts", async () => {
    assertDisposableTarget();

    const organizationId = randomUUID();
    const ownerUserId = randomUUID();
    const ownerMemberId = randomUUID();
    const locationId = randomUUID();
    const targetAthleteId = randomUUID();
    const historicalMembershipId = randomUUID();
    const futureMembershipId = randomUUID();
    const historicalEnrollmentId = randomUUID();
    const futureEnrollmentId = randomUUID();
    const groupIds = [randomUUID(), randomUUID()];
    const classTemplateIds = [randomUUID(), randomUUID()];
    const people = Array.from({ length: 31 }, () => ({
      id: randomUUID(),
      athleteId: randomUUID(),
    }));
    people[30].athleteId = targetAthleteId;

    const outcome = await db
      .transaction(async (tx: TransactionClient) => {
        await tx.execute(sql`set local statement_timeout = '10000'`);

        await tx.execute(sql`
          insert into auth.users (id, email)
          values (
            ${ownerUserId}::uuid,
            ${`ci-regularization-${ownerUserId}@example.invalid`}
          )
        `);
        await tx.execute(sql`
          insert into zaltyko.organizations (id, name, status)
          values (${organizationId}::uuid, 'CI regularization dates', 'active')
        `);
        await tx.execute(sql`
          insert into zaltyko.locations (id, organization_id, code, name, timezone)
          values (${locationId}::uuid, ${organizationId}::uuid, 'regularization', 'CI regularization', 'Europe/Madrid')
        `);
        await tx.execute(sql`
          insert into zaltyko.organization_members (
            id, organization_id, user_id, role, status, location_scope_mode
          ) values (
            ${ownerMemberId}::uuid, ${organizationId}::uuid, ${ownerUserId}::uuid,
            'owner', 'active', 'all'
          )
        `);
        await tx.execute(sql`
          insert into zaltyko.people (id, organization_id, given_name, family_name)
          values ${sql.join(
            people.map(
              (person, index) => sql`(
                ${person.id}::uuid, ${organizationId}::uuid,
                ${`Synthetic ${index + 1}`}, 'Regularization QA'
              )`
            ),
            sql`, `
          )}
        `);
        await tx.execute(sql`
          insert into zaltyko.athletes (id, organization_id, person_id)
          values ${sql.join(
            people.map(
              (person) => sql`(
                ${person.athleteId}::uuid, ${organizationId}::uuid, ${person.id}::uuid
              )`
            ),
            sql`, `
          )}
        `);
        await tx.execute(sql`
          insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status)
          values ${sql.join(
            groupIds.map(
              (id, index) => sql`(
                ${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
                ${`Synthetic group ${index + 1}`}, 40, 'active'
              )`
            ),
            sql`, `
          )}
        `);
        await tx.execute(sql`
          insert into zaltyko.class_templates (
            id, organization_id, location_id, name, capacity, status, effective_from
          ) values ${sql.join(
            classTemplateIds.map(
              (id, index) => sql`(
                ${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
                ${`Synthetic class ${index + 1}`}, 40, 'active',
                (current_timestamp at time zone 'Europe/Madrid')::date - 30
              )`
            ),
            sql`, `
          )}
        `);
        await tx.execute(sql`
          insert into zaltyko.group_memberships (
            id, organization_id, group_id, athlete_id, status, starts_on, ends_on
          ) values
            (
              ${historicalMembershipId}::uuid, ${organizationId}::uuid,
              ${groupIds[0]}::uuid, ${targetAthleteId}::uuid, 'active',
              (current_timestamp at time zone 'Europe/Madrid')::date - 10,
              (current_timestamp at time zone 'Europe/Madrid')::date - 3
            ),
            (
              ${futureMembershipId}::uuid, ${organizationId}::uuid,
              ${groupIds[1]}::uuid, ${targetAthleteId}::uuid, 'pending',
              (current_timestamp at time zone 'Europe/Madrid')::date + 14,
              null
            )
        `);
        await tx.execute(sql`
          insert into zaltyko.enrollments (
            id, organization_id, location_id, athlete_id, class_template_id,
            status, starts_on, ends_on, source
          ) values
            (
              ${historicalEnrollmentId}::uuid, ${organizationId}::uuid,
              ${locationId}::uuid, ${targetAthleteId}::uuid,
              ${classTemplateIds[0]}::uuid, 'active',
              (current_timestamp at time zone 'Europe/Madrid')::date - 10,
              (current_timestamp at time zone 'Europe/Madrid')::date - 3,
              'owner'
            ),
            (
              ${futureEnrollmentId}::uuid, ${organizationId}::uuid,
              ${locationId}::uuid, ${targetAthleteId}::uuid,
              ${classTemplateIds[1]}::uuid, 'pending',
              (current_timestamp at time zone 'Europe/Madrid')::date + 14,
              null, 'owner'
            )
        `);

        const beforeUsage = await getOrganizationUsage(tx, organizationId);
        expect(beforeUsage).toMatchObject({ planCode: "free", readOnly: true });
        expect(beforeUsage.resources.find((resource) => resource.resource === "athletes"))
          .toMatchObject({ current: 31, limit: 30, excess: 1 });
        const historicalDatesBefore = await tx.execute(sql`
          select
            (select ends_on::text from zaltyko.group_memberships where organization_id = ${organizationId}::uuid and id = ${historicalMembershipId}::uuid) as historical_membership_end,
            (select ends_on::text from zaltyko.enrollments where organization_id = ${organizationId}::uuid and id = ${historicalEnrollmentId}::uuid) as historical_enrollment_end,
            (select ends_on < (current_timestamp at time zone 'Europe/Madrid')::date from zaltyko.group_memberships where organization_id = ${organizationId}::uuid and id = ${historicalMembershipId}::uuid) as membership_is_past,
            (select ends_on < (current_timestamp at time zone 'Europe/Madrid')::date from zaltyko.enrollments where organization_id = ${organizationId}::uuid and id = ${historicalEnrollmentId}::uuid) as enrollment_is_past
        `);
        expect(historicalDatesBefore.rows[0]).toMatchObject({
          membership_is_past: true,
          enrollment_is_past: true,
        });
        const before = await snapshot(organizationId, tx);

        await expect(
          archiveResourceInTransaction(tx, {
            userId: randomUUID(),
            organizationId,
            resource: "athletes",
            resourceId: targetAthleteId,
            idempotencyKey: `ci-denied-regularization-${randomUUID()}`,
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
        expect(await snapshot(organizationId, tx)).toEqual(before);

        const archived = await archiveResourceInTransaction(tx, {
          userId: ownerUserId,
          organizationId,
          resource: "athletes",
          resourceId: targetAthleteId,
          idempotencyKey: `ci-regularization-${randomUUID()}`,
        });
        expect(archived.readOnly).toBe(false);
        expect(archived.resources.find((resource) => resource.resource === "athletes"))
          .toMatchObject({ current: 30, limit: 30, excess: 0 });

        const rows = await tx.execute(sql`
          select
            (select ends_on::text from zaltyko.group_memberships where organization_id = ${organizationId}::uuid and id = ${historicalMembershipId}::uuid) as historical_membership_end,
            (select ends_on::text from zaltyko.group_memberships where organization_id = ${organizationId}::uuid and id = ${futureMembershipId}::uuid) as future_membership_end,
            (select starts_on::text from zaltyko.group_memberships where organization_id = ${organizationId}::uuid and id = ${futureMembershipId}::uuid) as future_membership_start,
            (select effective_on::text from zaltyko.group_membership_history where organization_id = ${organizationId}::uuid and membership_id = ${historicalMembershipId}::uuid and to_status = 'ended') as historical_membership_effective_on,
            (select effective_on::text from zaltyko.group_membership_history where organization_id = ${organizationId}::uuid and membership_id = ${futureMembershipId}::uuid and to_status = 'ended') as future_membership_effective_on,
            (select ends_on::text from zaltyko.enrollments where organization_id = ${organizationId}::uuid and id = ${historicalEnrollmentId}::uuid) as historical_enrollment_end,
            (select ends_on::text from zaltyko.enrollments where organization_id = ${organizationId}::uuid and id = ${futureEnrollmentId}::uuid) as future_enrollment_end,
            (select starts_on::text from zaltyko.enrollments where organization_id = ${organizationId}::uuid and id = ${futureEnrollmentId}::uuid) as future_enrollment_start,
            (select effective_on::text from zaltyko.enrollment_status_history where organization_id = ${organizationId}::uuid and enrollment_id = ${historicalEnrollmentId}::uuid and to_status = 'cancelled') as historical_enrollment_effective_on,
            (select effective_on::text from zaltyko.enrollment_status_history where organization_id = ${organizationId}::uuid and enrollment_id = ${futureEnrollmentId}::uuid and to_status = 'cancelled') as future_enrollment_effective_on
        `);
        expect(rows.rows[0]?.historical_membership_end).toBe(
          historicalDatesBefore.rows[0]?.historical_membership_end
        );
        expect(rows.rows[0]?.historical_enrollment_end).toBe(
          historicalDatesBefore.rows[0]?.historical_enrollment_end
        );
        expect(rows.rows[0]?.historical_membership_effective_on).toBe(
          historicalDatesBefore.rows[0]?.historical_membership_end
        );
        expect(rows.rows[0]?.historical_enrollment_effective_on).toBe(
          historicalDatesBefore.rows[0]?.historical_enrollment_end
        );
        expect(rows.rows[0]?.future_membership_end).toBe(
          rows.rows[0]?.future_membership_start
        );
        expect(rows.rows[0]?.future_membership_effective_on).toBe(
          rows.rows[0]?.future_membership_start
        );
        expect(rows.rows[0]?.future_enrollment_end).toBe(
          rows.rows[0]?.future_enrollment_start
        );
        expect(rows.rows[0]?.future_enrollment_effective_on).toBe(
          rows.rows[0]?.future_enrollment_start
        );

        const activity = await tx.execute(sql`
          select
            (select count(*)::int from zaltyko.group_membership_history where organization_id = ${organizationId}::uuid and membership_id in (${historicalMembershipId}::uuid, ${futureMembershipId}::uuid) and to_status = 'ended') as membership_history_count,
            (select count(*)::int from zaltyko.enrollment_status_history where organization_id = ${organizationId}::uuid and enrollment_id in (${historicalEnrollmentId}::uuid, ${futureEnrollmentId}::uuid) and to_status = 'cancelled') as enrollment_history_count,
            (select count(*)::int from zaltyko.audit_log where organization_id = ${organizationId}::uuid and action = 'saas.resource_archived' and target_id = ${targetAthleteId}::uuid) as audit_count,
            (select count(*)::int from zaltyko.outbox_events where organization_id = ${organizationId}::uuid and event_name = 'saas.resource_archived' and aggregate_id = ${targetAthleteId}::uuid) as outbox_count
        `);
        expect(activity.rows[0]).toEqual({
          membership_history_count: 2,
          enrollment_history_count: 2,
          audit_count: 1,
          outbox_count: 1,
        });

        throw rollback;
      })
      .catch((error: unknown) => error);

    expect(outcome).toBe(rollback);
    const afterRollback = await snapshot(organizationId);
    expect(Object.values(afterRollback).every((row) => row.count === 0)).toBe(true);
    const leakedRows = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.organizations where id = ${organizationId}::uuid) as organizations,
        (select count(*)::int from auth.users where id = ${ownerUserId}::uuid) as users
    `);
    expect(leakedRows.rows[0]).toEqual({ organizations: 0, users: 0 });
  });
});
