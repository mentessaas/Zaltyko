import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  archiveOwnerStaffProfile,
  createOwnerStaffProfile,
  listOwnerStaffProfiles,
  reactivateOwnerStaffProfile,
  updateOwnerStaffProfile,
} from "@/modules/staff/application/owner-staff-profiles";

const enabled = process.env.ZALTYKO_PG_INTEGRATION === "1";
const describeDisposablePg = describe.skipIf(!enabled);

const snapshotTables = [
  "athletes",
  "audit_log",
  "guardians",
  "organization_members",
  "outbox_events",
  "people",
  "staff_profiles",
] as const;

function assertDisposableTarget() {
  if (
    process.env.ZALTYKO_PG_INTEGRATION !== "1" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_OS !== "Linux" ||
    process.env.NODE_ENV !== "test"
  ) {
    throw new Error("Staff PostgreSQL tests require disposable GitHub Linux PostgreSQL");
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
    throw new Error("The disposable staff PostgreSQL target is invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" ||
    !parsed.port ||
    !parsed.password ||
    parsed.pathname !== "/postgres" ||
    parsed.search !== "?sslmode=disable" ||
    configuredUrls.some((value) => value !== connectionString)
  ) {
    throw new Error("Staff integration tests refuse an unexpected PostgreSQL target");
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
  const present = forbidden.filter((name) => Boolean(process.env[name]));
  if (present.length > 0) {
    throw new Error(`Staff integration tests refuse external credential variables: ${present.join(", ")}`);
  }
}

async function snapshot(organizationId: string) {
  const queries = sql.join(
    snapshotTables.map((table) => sql`
      select ${table}::text as table_name,
        count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
      from ${sql.identifier("zaltyko")}.${sql.identifier(table)} as row_data
      where row_data.organization_id = ${organizationId}::uuid
    `),
    sql` union all `
  );
  const result = await db.execute(sql`select * from (${queries}) rows order by table_name`);
  return result.rows.map((row) => [String(row.table_name), Number(row.count), String(row.content_hash)]);
}

async function snapshotPair(firstOrganizationId: string, secondOrganizationId: string) {
  const [first, second] = await Promise.all([
    snapshot(firstOrganizationId),
    snapshot(secondOrganizationId),
  ]);
  return { first, second };
}

function expectDeniedWithoutResourceDetails(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  expect([403, 404]).toContain(status);
  expect(String(error)).not.toContain("Synthetic B");
}

async function seedFixture() {
  const organizationId = randomUUID();
  const ownerUserId = randomUUID();
  const selectedOwnerUserId = randomUUID();
  const managerUserId = randomUUID();
  const ownerMemberId = randomUUID();
  const selectedOwnerMemberId = randomUUID();
  const managerMemberId = randomUUID();
  const locationId = randomUUID();

  await db.execute(sql`
    insert into auth.users (id, email)
    values
      (${ownerUserId}::uuid, ${`ci-staff-owner-${ownerUserId}@example.invalid`}),
      (${selectedOwnerUserId}::uuid, ${`ci-staff-selected-${selectedOwnerUserId}@example.invalid`}),
      (${managerUserId}::uuid, ${`ci-staff-manager-${managerUserId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${`CI staff profile ${organizationId}`})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name)
    values (
      ${locationId}::uuid, ${organizationId}::uuid,
      ${`ci-staff-${locationId.slice(0, 8)}`}, 'CI staff site'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values
      (${ownerMemberId}::uuid, ${organizationId}::uuid, ${ownerUserId}::uuid, 'owner', 'active', 'all'),
      (${selectedOwnerMemberId}::uuid, ${organizationId}::uuid, ${selectedOwnerUserId}::uuid, 'owner', 'active', 'selected'),
      (${managerMemberId}::uuid, ${organizationId}::uuid, ${managerUserId}::uuid, 'manager', 'active', 'all')
  `);
  await db.execute(sql`
    insert into zaltyko.member_location_scopes (organization_id, member_id, location_id)
    values (${organizationId}::uuid, ${selectedOwnerMemberId}::uuid, ${locationId}::uuid)
  `);

  return {
    organizationId,
    owner: { userId: ownerUserId, memberId: ownerMemberId },
    selectedOwner: { userId: selectedOwnerUserId, memberId: selectedOwnerMemberId },
    manager: { userId: managerUserId, memberId: managerMemberId },
    ownerMemberId,
  };
}

describeDisposablePg("Owner canonical staff profile service on disposable PostgreSQL", () => {
  it("isolates Owner-all profiles and preserves atomic, versioned, idempotent history", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const linkedPersonId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (${linkedPersonId}::uuid, ${fixture.organizationId}::uuid, 'Synthetic', 'Account')
    `);
    await db.execute(sql`
      insert into zaltyko.staff_profiles (organization_id, person_id, member_id)
      values (${fixture.organizationId}::uuid, ${linkedPersonId}::uuid, ${fixture.ownerMemberId}::uuid)
    `);
    const initial = {
      organizationId: fixture.organizationId,
      actor: fixture.owner,
      idempotencyKey: "staff-create-0001",
      givenName: "  Ana   María ",
      familyName: " López ",
      preferredName: "Ani",
    };
    const concurrentCreates = await Promise.all([
      createOwnerStaffProfile(initial),
      createOwnerStaffProfile(initial),
    ]);
    expect(concurrentCreates.map((item) => item.replayed).sort()).toEqual([false, true]);
    expect(concurrentCreates[0]?.receipt).toEqual(concurrentCreates[1]?.receipt);
    const created = concurrentCreates.find((item) => !item.replayed)!;
    expect(created).toMatchObject({ replayed: false, receipt: { isActive: true } });
    expect(created.receipt.version).toMatch(/^v1_[a-f0-9]{64}$/u);

    const replay = await createOwnerStaffProfile(initial);
    expect(replay).toEqual({ ...created, replayed: true });
    const conflictingRetry = await createOwnerStaffProfile({
      ...initial,
      preferredName: "Different",
    }).then(() => null, (error: unknown) => error);
    expect(conflictingRetry).toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    const active = await listOwnerStaffProfiles({
      organizationId: fixture.organizationId,
      actor: fixture.owner,
    });
    expect(active.items).toHaveLength(1);
    expect(active.items[0]).toMatchObject({ givenName: "Ana María", familyName: "López", preferredName: "Ani", isActive: true });
    expect(Object.keys(active.items[0] ?? {}).sort()).toEqual([
      "familyName", "givenName", "id", "isActive", "preferredName", "version",
    ]);
    expect(Object.keys(created.receipt).sort()).toEqual(["isActive", "staffProfileId", "version"]);
    const membershipCount = await db.execute(sql<{ count: number }>`
      select count(*)::int as count from zaltyko.organization_members
      where organization_id = ${fixture.organizationId}::uuid
    `);
    expect(Number(membershipCount.rows[0]?.count)).toBe(3);
    const eventText = await db.execute(sql<{ stored_text: string }>`
      select coalesce(string_agg(payload::text, ' '), '') as stored_text
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'staff.profile_command_recorded'
    `);
    expect(String(eventText.rows[0]?.stored_text)).not.toMatch(/Ana María|López|Ani/u);
    const auditText = await db.execute(sql<{ stored_text: string }>`
      select coalesce(string_agg(coalesce(before::text, '') || coalesce(after::text, ''), ' '), '') as stored_text
      from zaltyko.audit_log
      where organization_id = ${fixture.organizationId}::uuid and action = 'staff.profile_command_recorded'
    `);
    expect(String(auditText.rows[0]?.stored_text)).not.toMatch(/Ana María|López|Ani/u);

    const deniedSelectedOwner = await listOwnerStaffProfiles({
      organizationId: fixture.organizationId,
      actor: fixture.selectedOwner,
    }).then(() => null, (error: unknown) => error);
    expect(deniedSelectedOwner).toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    const deniedManager = await listOwnerStaffProfiles({
      organizationId: fixture.organizationId,
      actor: fixture.manager,
    }).then(() => null, (error: unknown) => error);
    expect(deniedManager).toMatchObject({ code: "FORBIDDEN", status: 403 });
    const deniedOtherOrganization = await listOwnerStaffProfiles({
      organizationId: randomUUID(),
      actor: fixture.owner,
    }).then(() => null, (error: unknown) => error);
    expect(deniedOtherOrganization).toMatchObject({ code: "FORBIDDEN", status: 403 });

    const profileId = created.receipt.staffProfileId;
    const updateCommand = {
      organizationId: fixture.organizationId,
      staffProfileId: profileId,
      actor: fixture.owner,
      idempotencyKey: "staff-update-0001",
      givenName: "Ana María",
      familyName: "López",
      preferredName: "Anita",
      version: created.receipt.version,
    };
    const updated = await updateOwnerStaffProfile(updateCommand);
    expect(updated.receipt.version).not.toBe(created.receipt.version);
    const staleUpdate = await updateOwnerStaffProfile({
      organizationId: fixture.organizationId,
      staffProfileId: profileId,
      actor: fixture.owner,
      idempotencyKey: "staff-update-stale-1",
      givenName: "Other",
      familyName: "Name",
      version: created.receipt.version,
    }).then(() => null, (error: unknown) => error);
    expect(staleUpdate).toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    const archived = await archiveOwnerStaffProfile({
      organizationId: fixture.organizationId,
      staffProfileId: profileId,
      actor: fixture.owner,
      idempotencyKey: "staff-archive-0001",
      version: updated.receipt.version,
    });
    expect(archived.receipt.isActive).toBe(false);
    const activeAfterArchive = await listOwnerStaffProfiles({
      organizationId: fixture.organizationId,
      actor: fixture.owner,
    });
    expect(activeAfterArchive.items.map((item) => item.id)).not.toContain(profileId);
    const archivedPage = await listOwnerStaffProfiles({
      organizationId: fixture.organizationId,
      actor: fixture.owner,
      status: "archived",
    });
    expect(archivedPage.items.map((item) => item.id)).toContain(profileId);
    const reactivated = await reactivateOwnerStaffProfile({
      organizationId: fixture.organizationId,
      staffProfileId: profileId,
      actor: fixture.owner,
      idempotencyKey: "staff-reactivate-001",
      version: archived.receipt.version,
    });
    expect(reactivated.receipt.isActive).toBe(true);
    const historicalArchiveReplay = await archiveOwnerStaffProfile({
      organizationId: fixture.organizationId,
      staffProfileId: profileId,
      actor: fixture.owner,
      idempotencyKey: "staff-archive-0001",
      version: updated.receipt.version,
    });
    expect(historicalArchiveReplay).toEqual({ ...archived, replayed: true });
    expect(await updateOwnerStaffProfile(updateCommand)).toEqual({ ...updated, replayed: true });

    const personResult = await db.execute(sql<{ person_id: string }>`
      select person_id::text as person_id from zaltyko.staff_profiles
      where organization_id = ${fixture.organizationId}::uuid and id = ${profileId}::uuid
    `);
    const personId = String(personResult.rows[0]?.person_id);
    const athleteId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values (${athleteId}::uuid, ${fixture.organizationId}::uuid, ${personId}::uuid)
    `);
    const beforeSharedEdit = await snapshot(fixture.organizationId);
    const sharedEdit = await updateOwnerStaffProfile({
      organizationId: fixture.organizationId,
      staffProfileId: profileId,
      actor: fixture.owner,
      idempotencyKey: "staff-shared-edit-01",
      givenName: "Refused",
      familyName: "Change",
      preferredName: "No",
      version: reactivated.receipt.version,
    }).then(() => null, (error: unknown) => error);
    expect(sharedEdit).toMatchObject({ code: "INVALID_RELATION", status: 409 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeSharedEdit);
  }, 60_000);

  it("rolls back both profile rows and the outbox when the audit idempotency key collides", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const rawKey = `staff-rollback-${randomUUID()}`;
    const persistedKey = `staff_${createHash("sha256").update(rawKey, "utf8").digest("hex")}`;
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, actor_user_id, action, target_type, idempotency_key, metadata
      ) values (
        ${fixture.organizationId}::uuid, ${fixture.owner.userId}::uuid,
        'staff.test.audit_collision', 'staff_profile', ${persistedKey}, '{}'::jsonb
      )
    `);
    const before = await snapshot(fixture.organizationId);
    const failedCreate = await createOwnerStaffProfile({
      organizationId: fixture.organizationId,
      actor: fixture.owner,
      idempotencyKey: rawKey,
      givenName: "Synthetic",
      familyName: "Rollback",
      preferredName: null,
    }).then(() => null, (error: unknown) => error);
    expect(failedCreate).not.toBeNull();
    expect(await snapshot(fixture.organizationId)).toEqual(before);
  }, 30_000);

  it("keeps reads and all four mutations inside each academy boundary", async () => {
    assertDisposableTarget();
    const academyA = await seedFixture();
    const academyB = await seedFixture();
    const ownerBResource = await createOwnerStaffProfile({
      organizationId: academyB.organizationId,
      actor: academyB.owner,
      idempotencyKey: "staff-owner-b-create-01",
      givenName: "Synthetic B",
      familyName: "Coach",
      preferredName: null,
    });
    const profileId = ownerBResource.receipt.staffProfileId;
    const deniedActors = [
      academyA.manager,
      academyA.selectedOwner,
      academyA.owner,
      academyB.manager,
      academyB.selectedOwner,
    ];
    const beforeDeniedActions = await snapshotPair(
      academyA.organizationId,
      academyB.organizationId
    );

    for (const actor of deniedActors) {
      const deniedList = await listOwnerStaffProfiles({
        organizationId: academyB.organizationId,
        actor,
        status: "all",
      }).then(() => null, (error: unknown) => error);
      expectDeniedWithoutResourceDetails(deniedList);

      const deniedCreate = await createOwnerStaffProfile({
        organizationId: academyB.organizationId,
        actor,
        idempotencyKey: `staff-cross-create-${randomUUID()}`,
        givenName: "Unauthorized",
        familyName: "Create",
        preferredName: null,
      }).then(() => null, (error: unknown) => error);
      expectDeniedWithoutResourceDetails(deniedCreate);

      const deniedUpdate = await updateOwnerStaffProfile({
        organizationId: academyB.organizationId,
        staffProfileId: profileId,
        actor,
        idempotencyKey: `staff-cross-update-${randomUUID()}`,
        givenName: "Unauthorized",
        familyName: "Update",
        preferredName: null,
        version: ownerBResource.receipt.version,
      }).then(() => null, (error: unknown) => error);
      expectDeniedWithoutResourceDetails(deniedUpdate);

      const deniedArchive = await archiveOwnerStaffProfile({
        organizationId: academyB.organizationId,
        staffProfileId: profileId,
        actor,
        idempotencyKey: `staff-cross-archive-${randomUUID()}`,
        version: ownerBResource.receipt.version,
      }).then(() => null, (error: unknown) => error);
      expectDeniedWithoutResourceDetails(deniedArchive);

      const deniedReactivate = await reactivateOwnerStaffProfile({
        organizationId: academyB.organizationId,
        staffProfileId: profileId,
        actor,
        idempotencyKey: `staff-cross-reactivate-${randomUUID()}`,
        version: ownerBResource.receipt.version,
      }).then(() => null, (error: unknown) => error);
      expectDeniedWithoutResourceDetails(deniedReactivate);
    }

    expect(await snapshotPair(academyA.organizationId, academyB.organizationId)).toEqual(
      beforeDeniedActions
    );

    const ownerBPage = await listOwnerStaffProfiles({
      organizationId: academyB.organizationId,
      actor: academyB.owner,
    });
    expect(ownerBPage.items.map((item) => item.id)).toContain(profileId);
    const updated = await updateOwnerStaffProfile({
      organizationId: academyB.organizationId,
      staffProfileId: profileId,
      actor: academyB.owner,
      idempotencyKey: "staff-owner-b-update-01",
      givenName: "Synthetic B Updated",
      familyName: "Coach",
      preferredName: null,
      version: ownerBResource.receipt.version,
    });
    const archived = await archiveOwnerStaffProfile({
      organizationId: academyB.organizationId,
      staffProfileId: profileId,
      actor: academyB.owner,
      idempotencyKey: "staff-owner-b-archive-01",
      version: updated.receipt.version,
    });
    const reactivated = await reactivateOwnerStaffProfile({
      organizationId: academyB.organizationId,
      staffProfileId: profileId,
      actor: academyB.owner,
      idempotencyKey: "staff-owner-b-reactivate-01",
      version: archived.receipt.version,
    });
    expect(updated.receipt.isActive).toBe(true);
    expect(archived.receipt.isActive).toBe(false);
    expect(reactivated.receipt.isActive).toBe(true);

    const ownerBListingAcademyA = await listOwnerStaffProfiles({
      organizationId: academyA.organizationId,
      actor: academyB.owner,
    }).then(() => null, (error: unknown) => error);
    expectDeniedWithoutResourceDetails(ownerBListingAcademyA);
    expect(await snapshot(academyA.organizationId)).toEqual(beforeDeniedActions.first);
  }, 60_000);
});
