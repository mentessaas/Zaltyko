import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), scope: vi.fn(), limit: vi.fn(), usage: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({ getOrganizationUsage: mocks.usage }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (_r: Request, id: string) => id,
  rateLimit: mocks.limit,
  rateLimitExceededResponse: () => new Response(null, { status: 429 }),
}));
import { GET } from "@/app/api/v1/owner/operational-policy/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";
const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const tx = { execute: mocks.execute };
const request = (suffix = `organizationId=${organizationId}&locationId=${locationId}`) => new Request(`https://example.invalid/api/v1/owner/operational-policy?${suffix}`);
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.user.mockResolvedValue({ id: "qa-limited" });
  mocks.scope.mockResolvedValue({ organization: { id: organizationId }, member: { role: "manager" }, selectedLocationId: locationId });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.transaction.mockImplementation(fn => fn(tx));
  mocks.usage.mockResolvedValue({ readOnly: false, planCode: "free", resources: [{ current: 30 }], subscriptionId: "must-not-leak" });
});
describe("site-scoped operational policy without commercial access", () => {
  it("permits a scoped manager but projects no counts or subscription data", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.scope).toHaveBeenCalledWith({ userId: "qa-limited", organizationId, locationId });
    expect(mocks.usage).toHaveBeenCalledWith(tx, organizationId);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect((await response.json()).data).toEqual({ readOnly: false, planCode: "free" });
  });
  it("retains organization-wide read-only enforcement for a staff site", async () => {
    mocks.usage.mockResolvedValue({ readOnly: true, planCode: "free", resources: [{ current: 31 }] });
    expect((await (await GET(request())).json()).data).toEqual({ readOnly: true, planCode: "free" });
  });
  it.each(["membership_or_role", "location_scope", "no_assigned_locations"])("denies %s before reading organization usage", async reason => {
    mocks.scope.mockRejectedValue(new OperationalError("FORBIDDEN", reason, 403));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });
  it("requires authentication and rejects unknown query keys", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request(`organizationId=${organizationId}&resource=athletes`))).status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
  });
  it("stops at rate limiting without reading usage", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    expect((await GET(request())).status).toBe(429);
    expect(mocks.usage).not.toHaveBeenCalled();
  });
});
