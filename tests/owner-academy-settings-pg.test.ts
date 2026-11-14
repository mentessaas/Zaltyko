import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  createOwnerLocation,
  getOwnerAcademySettings,
  updateOwnerAcademyProfile,
} from "@/modules/organizations/application/owner-academy-settings";

function assertDisposableTarget() {
  if (process.env.ZALTYKO_PG_INTEGRATION !== "1" || process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_OS !== "Linux" || process.env.NODE_ENV !== "test") throw new Error("Disposable GitHub Linux Postgres is required");
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const target = new URL(connection ?? "");
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) || target.pathname !== "/postgres" || target.search !== "?sslmode=disable") throw new Error("Unexpected PostgreSQL target refused");
}

const free = randomUUID(), network = randomUUID(), other = randomUUID();
const ownerFree = randomUUID(), ownerNetwork = randomUUID(), ownerOther = randomUUID(), admin = randomUUID();
const memberFree = randomUUID(), memberNetwork = randomUUID(), memberOther = randomUUID(), memberAdmin = randomUUID();
const actor = (userId: string, memberId: string) => ({ userId, memberId });

describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1")("ajustes y sedes en Postgres desechable", () => {
  beforeAll(async () => {
    assertDisposableTarget();
    for (const id of [ownerFree, ownerNetwork, ownerOther, admin]) {
      await db.execute(sql`insert into auth.users(id,email) values (${id}::uuid,${`ci-settings-${id}@example.invalid`})`);
    }
    await db.execute(sql`insert into zaltyko.organizations(id,name) values (${free}::uuid,'Settings Free'),(${network}::uuid,'Settings Network'),(${other}::uuid,'Settings Other')`);
    await db.execute(sql`insert into zaltyko.locations(organization_id,code,name,timezone) values (${free}::uuid,'principal','Principal','Europe/Madrid'),(${network}::uuid,'principal','Principal','Europe/Madrid'),(${other}::uuid,'principal','Principal','Europe/Madrid')`);
    await db.execute(sql`insert into zaltyko.organization_members(id,organization_id,user_id,role,status,location_scope_mode) values
      (${memberFree}::uuid,${free}::uuid,${ownerFree}::uuid,'owner','active','all'),
      (${memberNetwork}::uuid,${network}::uuid,${ownerNetwork}::uuid,'owner','active','all'),
      (${memberOther}::uuid,${other}::uuid,${ownerOther}::uuid,'owner','active','all'),
      (${memberAdmin}::uuid,${free}::uuid,${admin}::uuid,'admin','active','all')`);
    await db.execute(sql`update zaltyko.organization_entitlements
      set plan_code = 'network', source = 'contract', source_reference = ${`contract:${network}`}
      where organization_id = ${network}::uuid`);
  }, 30_000);

  it("el plan Free solo permite una sede y no crea nada al rechazar", async () => {
    const before = await getOwnerAcademySettings({ organizationId: free, actor: actor(ownerFree, memberFree) });
    expect(before.locationCapacity).toMatchObject({ planCode: "free", activeLocations: 1, locationLimit: 1, canAddLocation: false, blockedReason: "plan_limit" });
    await expect(createOwnerLocation({ organizationId: free, actor: actor(ownerFree, memberFree), name: "Sede Norte", timezone: "Europe/Madrid", idempotencyKey: "pg-settings-free-1" })).rejects.toMatchObject({ code: "CAPACITY_FULL", status: 409 });
    const after = await getOrganizationLocations(free);
    expect(after).toBe(1);
  });

  it("Network crea una segunda sede, repite sin duplicar y asigna códigos únicos", async () => {
    const input = { organizationId: network, actor: actor(ownerNetwork, memberNetwork), name: "Sede Norte", timezone: "Atlantic/Canary", idempotencyKey: "pg-settings-net-1" };
    const first = await createOwnerLocation(input);
    const replay = await createOwnerLocation(input);
    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ id: first.id, replayed: true });
    expect(await getOrganizationLocations(network)).toBe(2);
    await expect(createOwnerLocation({ ...input, name: "Otra", idempotencyKey: "pg-settings-net-1" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(createOwnerLocation({ ...input, idempotencyKey: "pg-settings-net-2" })).rejects.toMatchObject({ status: 409 });
    const third = await createOwnerLocation({ ...input, name: "sede-norte!", timezone: "Europe/Madrid", idempotencyKey: "pg-settings-net-3" });
    expect(third.id).not.toBe(first.id);
    await expect(createOwnerLocation({ ...input, name: "Sede Sur", timezone: "America/Mexico_City", idempotencyKey: "pg-settings-net-4" })).rejects.toMatchObject({ code: "INVALID_RELATION" });
  });

  it("renombra con versión, repite sin duplicar y detecta conflictos", async () => {
    const actorFree = actor(ownerFree, memberFree);
    const current = await getOwnerAcademySettings({ organizationId: free, actor: actorFree });
    const input = { organizationId: free, actor: actorFree, expectedUpdatedAt: current.organization.updatedAt, name: "Club Renombrado", legalName: "Club Renombrado SL", idempotencyKey: "pg-settings-name-1" };
    const saved = await updateOwnerAcademyProfile(input);
    expect(saved).toMatchObject({ name: "Club Renombrado", legalName: "Club Renombrado SL", changed: true, replayed: false });
    expect(await updateOwnerAcademyProfile(input)).toMatchObject({ replayed: true });
    await expect(updateOwnerAcademyProfile({ ...input, name: "Otro", idempotencyKey: "pg-settings-name-2" })).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    const unchanged = await updateOwnerAcademyProfile({ ...input, expectedUpdatedAt: saved.updatedAt, idempotencyKey: "pg-settings-name-3" });
    expect(unchanged.changed).toBe(false);
  });

  it("niega a otro rol y a otra academia sin escribir", async () => {
    await expect(getOwnerAcademySettings({ organizationId: free, actor: actor(admin, memberAdmin) })).rejects.toMatchObject({ status: 403 });
    await expect(updateOwnerAcademyProfile({ organizationId: free, actor: actor(ownerOther, memberOther), expectedUpdatedAt: "2026-01-01T00:00:00.000000Z", name: "Intruso", legalName: null, idempotencyKey: "pg-settings-deny-1" })).rejects.toMatchObject({ status: 403 });
    const settings = await getOwnerAcademySettings({ organizationId: other, actor: actor(ownerOther, memberOther) });
    expect(settings.organization.name).toBe("Settings Other");
  });
});

async function getOrganizationLocations(organizationId: string): Promise<number> {
  const result = await db.execute(sql`select count(*)::int as n from zaltyko.locations where organization_id = ${organizationId}::uuid`);
  return (result.rows[0] as { n: number }).n;
}
