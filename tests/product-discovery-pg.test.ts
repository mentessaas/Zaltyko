import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getProductDiscovery, recordProductDiscovery } from "@/modules/product-discovery/application/product-discovery";
import { exportCanonicalAcademyData } from "@/modules/data-rights/application/canonical-academy-return";

function assertDisposableTarget() {
  if (process.env.ZALTYKO_PG_INTEGRATION !== "1" || process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_OS !== "Linux" || process.env.NODE_ENV !== "test") throw new Error("Disposable GitHub Linux Postgres is required");
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const target = new URL(connection ?? "");
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !["127.0.0.1", "localhost", "::1"].includes(target.hostname) || target.username !== "supabase_admin" || !target.password || !target.port || target.pathname !== "/postgres" || target.search || [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(value => value !== connection)) throw new Error("Unexpected PostgreSQL target refused");
  for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY", "E2E_TARGET_SUPABASE_PROJECT_REF", "STRIPE_SAAS_TEST_SECRET_KEY", "STRIPE_SAAS_LIVE_SECRET_KEY", "VERCEL_TOKEN"]) {
    if (process.env[name]) throw new Error("External credentials are forbidden in the disposable runner");
  }
}

const organizationA = randomUUID(), organizationB = randomUUID();
const ownerA = randomUUID(), ownerB = randomUUID(), manager = randomUUID();
const memberA = randomUUID(), memberB = randomUUID(), memberManager = randomUUID();
const siteA = randomUUID(), siteB = randomUUID();
const inputA = { userId: ownerA, organizationId: organizationA };
const operationalTables = ["people", "athletes", "families", "guardians", "family_members", "family_guardians", "groups", "group_memberships", "class_templates", "sessions", "enrollments", "payments", "payment_allocations", "outbox_events"];

async function operationalSnapshot() {
  const queries = operationalTables.map(table => sql`
    select ${table}::text as table_name, count(*)::int as count,
      md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
    from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r
    where r.organization_id in (${organizationA}::uuid, ${organizationB}::uuid)
  `);
  return (await db.execute(sql`select * from (${sql.join(queries, sql` union all `)}) snapshot order by table_name`)).rows;
}
async function counts() {
  return (await db.execute(sql`select
    (select count(*)::int from zaltyko.product_discovery_interests where organization_id in (${organizationA}::uuid,${organizationB}::uuid)) as interests,
    (select count(*)::int from zaltyko.product_discovery_signals where organization_id in (${organizationA}::uuid,${organizationB}::uuid)) as signals`)).rows[0];
}

describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1")("discovery SQL candidate on disposable Postgres only", () => {
  beforeAll(async () => {
    assertDisposableTarget();
    await db.execute(sql`insert into auth.users(id,email) values (${ownerA}::uuid,${`ci-discovery-a-${ownerA}@example.invalid`}),(${ownerB}::uuid,${`ci-discovery-b-${ownerB}@example.invalid`}),(${manager}::uuid,${`ci-discovery-manager-${manager}@example.invalid`})`);
    await db.execute(sql`insert into zaltyko.organizations(id,name) values (${organizationA}::uuid,'Discovery A'),(${organizationB}::uuid,'Discovery B')`);
    await db.execute(sql`insert into zaltyko.locations(id,organization_id,code,name,timezone) values (${siteA}::uuid,${organizationA}::uuid,'discovery-a','Assigned site','Europe/Madrid'),(${siteB}::uuid,${organizationA}::uuid,'discovery-b','Other site','Atlantic/Canary')`);
    await db.execute(sql`insert into zaltyko.organization_members(id,organization_id,user_id,role,status,location_scope_mode) values (${memberA}::uuid,${organizationA}::uuid,${ownerA}::uuid,'owner','active','all'),(${memberB}::uuid,${organizationB}::uuid,${ownerB}::uuid,'owner','active','all'),(${memberManager}::uuid,${organizationA}::uuid,${manager}::uuid,'manager','active','selected')`);
    await db.execute(sql`insert into zaltyko.member_location_scopes(organization_id,member_id,location_id) values (${organizationA}::uuid,${memberManager}::uuid,${siteA}::uuid)`);
    // The absence path must work against the pre-candidate baseline too.
    expect((await getProductDiscovery(inputA)).measurementAvailable).toBe(false);
    const before = await operationalSnapshot();
    await expect(recordProductDiscovery(inputA, { featureId: "club-events", action: "interest", intent: "organize" })).rejects.toMatchObject({ status: 503 });
    expect(await operationalSnapshot()).toEqual(before);
    // Guarded disposable test setup, not a hosted migration or CLI project link.
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261104120000_product_discovery_preferences.sql"), "utf8");
    await db.execute(sql.raw(migration));
  }, 30_000);

  it("deduplicates concurrent academy signals and choices without operational side effects", async () => {
    const before = await operationalSnapshot();
    await Promise.all(Array.from({ length: 8 }, () => recordProductDiscovery(inputA, { featureId: "club-events", action: "exposure" })));
    await Promise.all(Array.from({ length: 8 }, () => recordProductDiscovery(inputA, { featureId: "club-events", action: "interest", intent: "organize", pilot: true })));
    expect(await counts()).toEqual({ interests: 1, signals: 1 });
    expect((await getProductDiscovery(inputA)).features.find(feature => feature.id === "club-events")?.interest).toEqual({ intent: "organize", pilot: true });
    expect(await operationalSnapshot()).toEqual(before);
  });

  it("retains separate member/site choices and really deletes a withdrawn choice", async () => {
    const managerInput = { userId: manager, organizationId: organizationA, locationId: siteA };
    const before = await operationalSnapshot();
    await recordProductDiscovery(managerInput, { featureId: "club-events", action: "interest", intent: "participate" });
    expect((await getProductDiscovery(managerInput)).features.find(feature => feature.id === "club-events")?.interest.intent).toBe("participate");
    expect((await getProductDiscovery(inputA)).features.find(feature => feature.id === "club-events")?.interest.intent).toBe("organize");
    await recordProductDiscovery(managerInput, { featureId: "club-events", action: "withdraw" });
    await recordProductDiscovery(managerInput, { featureId: "club-events", action: "withdraw" });
    expect((await counts()).interests).toBe(1);
    expect((await getProductDiscovery(managerInput)).features.find(feature => feature.id === "club-events")?.interest).toEqual({ intent: null, pilot: false });
    expect(await operationalSnapshot()).toEqual(before);
  });

  it.each([
    { input: { userId: ownerA, organizationId: organizationB }, featureId: "club-events" as const, intent: "organize" },
    { input: { userId: manager, organizationId: organizationA, locationId: siteB }, featureId: "club-events" as const, intent: "participate" },
    { input: { userId: manager, organizationId: organizationA, locationId: siteA }, featureId: "club-acquisition" as const, intent: "capture" },
  ])("rejects another academy, site or role without partial records", async command => {
    const before = await operationalSnapshot(), discoveryBefore = await counts();
    await expect(recordProductDiscovery(command.input, { featureId: command.featureId, action: "interest", intent: command.intent })).rejects.toMatchObject({ status: 403 });
    expect(await operationalSnapshot()).toEqual(before);
    expect(await counts()).toEqual(discoveryBefore);
  });

  it("does not leak one academy's choices into another's response", async () => {
    const result = await getProductDiscovery({ userId: ownerB, organizationId: organizationB });
    expect(result.features.every(feature => feature.interest.intent === null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(memberA);
  });

  it("denies direct authenticated/anon table access and enforces the cross-academy member FK", async () => {
    const before = await counts();
    const grants = await db.execute(sql`select
      has_table_privilege('authenticated','zaltyko.product_discovery_interests','SELECT') as authenticated_read,
      has_table_privilege('anon','zaltyko.product_discovery_interests','INSERT') as anon_write,
      has_table_privilege('authenticated','zaltyko.product_discovery_signals','SELECT') as authenticated_signals,
      has_table_privilege('anon','zaltyko.product_discovery_signals','INSERT') as anon_signals,
      has_table_privilege('service_role','zaltyko.product_discovery_signals','INSERT') as service_signal_insert,
      has_table_privilege('service_role','zaltyko.product_discovery_signals','UPDATE') as service_signal_update,
      has_table_privilege('service_role','zaltyko.product_discovery_signals','TRUNCATE') as service_signal_truncate,
      has_table_privilege('service_role','zaltyko.product_discovery_interests','TRUNCATE') as service_interest_truncate`);
    expect(grants.rows[0]).toEqual({ authenticated_read: false, anon_write: false, authenticated_signals: false, anon_signals: false,
      service_signal_insert: true, service_signal_update: false, service_signal_truncate: false, service_interest_truncate: false });
    await expect(db.execute(sql`insert into zaltyko.product_discovery_interests(organization_id,member_id,scope_key,feature_id,intent) values (${organizationB}::uuid,${memberA}::uuid,'organization','club-events','organize')`)).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });

  it("keeps staff interest private in the bounded academy export and reports coverage honestly", async () => {
    const exported = JSON.parse((await exportCanonicalAcademyData(inputA)).body);
    expect(exported.coverage.complete).toBe(false);
    expect(exported.data).not.toHaveProperty("product_discovery_interests");
    expect(exported.coverage.excludedTables).toEqual(expect.arrayContaining([expect.objectContaining({ table: "product_discovery_interests", valuesExported: false, rowCount: 1 })]));
  });
});
