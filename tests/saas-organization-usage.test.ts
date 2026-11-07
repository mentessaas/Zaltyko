import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TransactionClient } from "@/lib/db-transactions";

const mocks = vi.hoisted(() => ({ lock: vi.fn(), resolve: vi.fn() }));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({ lockOrganizationForSaasMutation: mocks.lock, resolveEffectiveOrganizationEntitlement: mocks.resolve }));
import { getOrganizationUsage, assertOrganizationOperationalWritable, assertOrganizationResourceCapacity } from "@/modules/saas-billing/application/organization-usage";
const org = "10000000-0000-4000-8000-000000000001";
const limits = { athleteLimit: 30, groupLimit: 3, classLimit: 10, academyLimit: 1 };
let tx: TransactionClient;
let execute: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ planCode: "free", limits });
  execute = vi.fn(async () => ({ rows: [{ athletes: "30", groups: "3", classes: "10" }] }));
  tx = { execute } as unknown as TransactionClient;
});

describe("organization usage / post-downgrade policy", () => {
  it("counts active canonical records across all sites, not memberships", async () => {
    await getOrganizationUsage(tx, org);
    const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(rendered.params).toEqual([org, org, org]);
    expect(rendered.sql).toContain("is_active");
    expect(rendered.sql).toContain("status = 'active'");
    expect(rendered.sql).not.toMatch(/group_memberships|location_id|sessions/);
  });
  it("allows operational writes exactly at all three limits", async () => {
    await expect(assertOrganizationOperationalWritable(tx, org)).resolves.toBeUndefined();
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.resolve.mock.invocationCallOrder[0]);
  });
  it.each(["athletes", "groups", "classes"])("over-limit %s freezes operations, without deleting", async resource => {
    execute.mockResolvedValue({ rows: [{ athletes: "30", groups: "3", classes: "10", [resource]: resource === "athletes" ? "31" : resource === "groups" ? "4" : "11" }] });
    await expect(assertOrganizationOperationalWritable(tx, org)).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409, details: { readOnly: true } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(new PgDialect().sqlToQuery(execute.mock.calls[0][0]).sql.trim().startsWith("select")).toBe(true);
  });
  it.each([["groups",3],["groups",5],["groups",10],["classes",10],["classes",20],["classes",40]] as const)("blocks %s at %i, permits last slot below", async (resource, limit) => {
    mocks.resolve.mockResolvedValue({ planCode: "starter", limits: { ...limits, [resource === "groups" ? "groupLimit" : "classLimit"]: limit } });
    execute.mockResolvedValueOnce({ rows: [{ athletes: "0", groups: "0", classes: "0", [resource]: String(limit) }] });
    await expect(assertOrganizationResourceCapacity(tx, org, resource)).rejects.toMatchObject({ code: "CAPACITY_FULL", status: 409 });
    execute.mockResolvedValueOnce({ rows: [{ athletes: "0", groups: "0", classes: "0", [resource]: String(limit - 1) }] });
    await expect(assertOrganizationResourceCapacity(tx, org, resource)).resolves.toBeUndefined();
  });
  it("unlimited is explicit, not a missing limit", async () => {
    mocks.resolve.mockResolvedValue({ planCode: "network", limits: { athleteLimit: null, groupLimit: null, classLimit: null } });
    execute.mockResolvedValue({ rows: [{ athletes: "999", groups: "999", classes: "999" }] });
    await expect(assertOrganizationOperationalWritable(tx, org)).resolves.toBeUndefined();
    await expect(assertOrganizationResourceCapacity(tx, org, "classes")).resolves.toBeUndefined();
  });
  it.each([undefined, null, "", "invalid", "-1", "1.5", "9007199254740992"])("fails closed with corrupt usage %s", async value => {
    execute.mockResolvedValue({ rows: [{ athletes: value, groups: "0", classes: "0" }] });
    await expect(getOrganizationUsage(tx, org)).rejects.toMatchObject({ status: 503 });
  });
  it("allows a sufficient paid entitlement without rewriting the athlete data", async () => {
    mocks.resolve.mockResolvedValue({ planCode: "growth", limits: { athleteLimit: 200, groupLimit: 10, classLimit: 40 } });
    execute.mockResolvedValue({ rows: [{ athletes: "76", groups: "6", classes: "21" }] });
    await expect(assertOrganizationOperationalWritable(tx, org)).resolves.toBeUndefined();
  });
});
