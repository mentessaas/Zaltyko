import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), get: vi.fn(), record: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/modules/product-discovery/application/product-discovery", () => ({ getProductDiscovery: mocks.get, recordProductDiscovery: mocks.record }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limit, rateLimitExceededResponse: () => new Response(null, { status: 429 }) }));
import { GET, POST } from "@/app/api/v1/owner/product-discovery/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";
const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const url = `https://example.invalid/api/v1/owner/product-discovery?organizationId=${organizationId}&locationId=${locationId}`;
const command = { featureId: "club-events", action: "interest", intent: "participate", pilot: true };
const post = (body: unknown = command, origin = "https://example.invalid") => new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.user.mockResolvedValue({ id: "existing-member" });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.get.mockResolvedValue({ features: [] });
  mocks.record.mockResolvedValue({ features: [] });
});
describe("canonical product discovery boundary", () => {
  it("authenticates before accepting selections", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(post())).status).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it.each(["https://other.invalid", "null", ""]) ("rejects cross-origin or absent origin %s before mutation", async origin => {
    expect((await POST(post(command, origin))).status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("passes only authenticated identity and canonical query scope to the service", async () => {
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith({ userId: "existing-member", organizationId, locationId }, command);
  });
  it.each([
    { ...command, userId: "forged" },
    { ...command, organizationId },
    { ...command, action: "create-competition" },
    { ...command, intent: "track" },
    { ...command, email: "not-collected@example.invalid" },
    { ...command, action: "withdraw" },
  ])("rejects forged identity, operations, unrelated intents and unexpected personal data", async body => {
    expect((await POST(post(body))).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("keeps withdrawal explicit and forwards no subscription or operational fields", async () => {
    const withdrawal = { featureId: "club-events", action: "withdraw" };
    expect((await POST(post(withdrawal))).status).toBe(200);
    expect(mocks.record.mock.calls[0][1]).toEqual(withdrawal);
  });
  it("rejects duplicate query keys and unknown fields instead of choosing one scope", async () => {
    expect((await GET(new Request(`${url}&organizationId=${organizationId}`))).status).toBe(400);
    expect((await GET(new Request(`${url}&tenantId=legacy`))).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("does not turn another academy or a denied location into an empty successful selection", async () => {
    mocks.record.mockRejectedValue(new OperationalError("LOCATION_SCOPE_DENIED", "Sede fuera de alcance", 403));
    expect((await POST(post())).status).toBe(403);
  });
  it("rate limits before persistence and never caches denials", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    const response = await POST(post());
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("GET is read only and scopes the visible selection", async () => {
    expect((await GET(new Request(url))).status).toBe(200);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith({ userId: "existing-member", organizationId, locationId });
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
