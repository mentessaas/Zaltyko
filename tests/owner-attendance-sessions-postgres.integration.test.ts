import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getOwnerAttendanceSessionOptions } from "@/modules/attendance/application/owner-attendance-sessions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

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

function getSessionId(prefix: string, sequence: number) {
  return `${prefix}${sequence.toString(16).padStart(12, "0")}`;
}

async function seedFixture() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationIds = [randomUUID(), randomUUID()];
  const classTemplateIds = [randomUUID(), randomUUID(), randomUUID()];
  const sessionPrefix = `${randomUUID().slice(0, 24)}`;
  const sessionIds = Array.from({ length: 105 }, (_, index) =>
    getSessionId(sessionPrefix, index + 1)
  );
  const outOfWindowSessionId = randomUUID();
  const cancelledSessionId = randomUUID();
  const otherLocationSessionId = randomUUID();

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-attendance-sessions-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${`CI attendance sessions ${organizationId}`})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (
      id, organization_id, code, name, timezone
    ) values
      (${locationIds[0]}::uuid, ${organizationId}::uuid, 'qa-main', 'QA Main', 'Europe/Madrid'),
      (${locationIds[1]}::uuid, ${organizationId}::uuid, 'qa-other', 'QA Other', 'Europe/Madrid')
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid,
      'owner', 'active', 'all'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    ) values
      (${classTemplateIds[0]}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid,
       'CI attendance template A', 30, 'active', current_date),
      (${classTemplateIds[1]}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid,
       'CI attendance template B', 30, 'active', current_date),
      (${classTemplateIds[2]}::uuid, ${organizationId}::uuid, ${locationIds[1]}::uuid,
       'CI attendance template other site', 30, 'active', current_date)
  `);

  const base = new Date(Date.now() + 60_000);
  base.setUTCMilliseconds(0);
  const baseSecond = base.toISOString().slice(0, 19);
  const scheduledRows = sessionIds.map((id, index) => {
    // Two templates intentionally share microsecond 50 at the page boundary;
    // the primary key is the deterministic tie breaker.
    const microsecond =
      index === 49 || index === 50 ? 50 : index < 49 ? index + 1 : index;
    const startsAt = `${baseSecond}.${String(microsecond).padStart(6, "0")}Z`;
    const endsAt = new Date(Date.parse(startsAt) + 60 * 60 * 1000).toISOString();
    return {
      id,
      classTemplateId: classTemplateIds[index === 50 ? 1 : 0]!,
      startsAt,
      endsAt,
    };
  });
  const scheduledValues = sql.join(
    scheduledRows.map((row) => sql`(
      ${row.id}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid,
      ${row.classTemplateId}::uuid, 'scheduled',
      ${row.startsAt}::timestamptz, ${row.endsAt}::timestamptz
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.sessions (
      id, organization_id, location_id, class_template_id, status, starts_at, ends_at
    ) values ${scheduledValues}
  `);

  const oldStart = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const oldEnd = new Date(oldStart.getTime() + 60 * 60 * 1000);
  const cancelledStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const cancelledEnd = new Date(cancelledStart.getTime() + 60 * 60 * 1000);
  const otherLocationStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const otherLocationEnd = new Date(otherLocationStart.getTime() + 60 * 60 * 1000);
  await db.execute(sql`
    insert into zaltyko.sessions (
      id, organization_id, location_id, class_template_id, status, starts_at, ends_at
    ) values
      (${outOfWindowSessionId}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid,
       ${classTemplateIds[0]}::uuid, 'scheduled', ${oldStart.toISOString()}::timestamptz,
       ${oldEnd.toISOString()}::timestamptz),
      (${cancelledSessionId}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid,
       ${classTemplateIds[1]}::uuid, 'cancelled', ${cancelledStart.toISOString()}::timestamptz,
       ${cancelledEnd.toISOString()}::timestamptz),
      (${otherLocationSessionId}::uuid, ${organizationId}::uuid, ${locationIds[1]}::uuid,
       ${classTemplateIds[2]}::uuid, 'scheduled', ${otherLocationStart.toISOString()}::timestamptz,
       ${otherLocationEnd.toISOString()}::timestamptz)
  `);

  return {
    organizationId,
    userId,
    locationId: locationIds[0]!,
    otherLocationId: locationIds[1]!,
    sessionIds,
    outOfWindowSessionId,
    cancelledSessionId,
    otherLocationSessionId,
  };
}

describe("Owner attendance session keyset pagination on disposable PostgreSQL", () => {
  it("returns every authorized scheduled session once across pages and keeps direct retry sessions separate", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();

    const first = await getOwnerAttendanceSessionOptions({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
    });
    expect(first.sessions).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    expect(first.selectedSession).toBeNull();

    const cursorPayload = JSON.parse(
      Buffer.from(first.nextCursor!, "base64url").toString("utf8")
    ) as { startsAt: string; id: string };
    expect(cursorPayload.startsAt).toMatch(/\.000050Z$/);
    expect(cursorPayload.id).toBe(fixture.sessionIds[49]);

    const second = await getOwnerAttendanceSessionOptions({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      cursor: first.nextCursor!,
      sessionId: fixture.outOfWindowSessionId,
    });
    expect(second.sessions).toHaveLength(50);
    expect(second.nextCursor).toBeTruthy();
    expect(second.selectedSession).toMatchObject({
      id: fixture.outOfWindowSessionId,
      retryOnly: true,
    });

    const third = await getOwnerAttendanceSessionOptions({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      cursor: second.nextCursor!,
    });
    expect(third.sessions).toHaveLength(5);
    expect(third.nextCursor).toBeNull();

    const receivedIds = [
      ...first.sessions.map((session) => session.id),
      ...second.sessions.map((session) => session.id),
      ...third.sessions.map((session) => session.id),
    ];
    expect(receivedIds).toEqual(fixture.sessionIds);
    expect(new Set(receivedIds).size).toBe(105);
    expect(receivedIds).not.toContain(fixture.outOfWindowSessionId);
    expect(receivedIds).not.toContain(fixture.cancelledSessionId);
    expect(receivedIds).not.toContain(fixture.otherLocationSessionId);

    const separateLocationPage = await getOwnerAttendanceSessionOptions({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.otherLocationId,
    });
    expect(separateLocationPage.sessions.map((session) => session.id)).toEqual([
      fixture.otherLocationSessionId,
    ]);
    // UUID-isolated fixtures remain until the runner destroys the whole
    // disposable database; append-only entitlement history must not be deleted.
  });

  it("rejects a valid position cursor when replayed under a different authorized site", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();

    const first = await getOwnerAttendanceSessionOptions({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
    });
    expect(first.nextCursor).toBeTruthy();

    await expect(
      getOwnerAttendanceSessionOptions({
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        locationId: fixture.otherLocationId,
        cursor: first.nextCursor!,
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION" });
    // UUID-isolated fixtures remain until the runner destroys the whole
    // disposable database; append-only entitlement history must not be deleted.
  });
});
