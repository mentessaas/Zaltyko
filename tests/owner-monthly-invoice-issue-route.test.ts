import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  issueMonthlyInvoice: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (
    _request: Request,
    organizationId: string
  ) => `verified:${organizationId}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () =>
    new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.ownerScope,
}));
vi.mock("@/modules/billing/application/monthly-invoice-service", () => ({
  issueMonthlyInvoice: mocks.issueMonthlyInvoice,
}));

import { POST } from "@/app/api/v1/owner/billing/monthly-invoices/issue/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const familyId = "30000000-0000-4000-8000-000000000003";
const familyPayerId = "40000000-0000-4000-8000-000000000004";
const userId = "50000000-0000-4000-8000-000000000005";
const memberId = "60000000-0000-4000-8000-000000000006";
const idempotencyKey = "monthly-invoice-qa-01";
const payload = {
  organizationId,
  locationId,
  familyId,
  familyPayerId,
  servicePeriod: "2026-10",
  dueDate: "2026-11-05",
  quoteHash: "a".repeat(64),
};

function request(body: unknown = payload, key = idempotencyKey) {
  return new Request(
    "https://example.invalid/api/v1/owner/billing/monthly-invoices/issue",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.issueMonthlyInvoice.mockResolvedValue({
    invoice: {
      id: "70000000-0000-4000-8000-000000000007",
      reference: "QA-2026-10-01",
      status: "issued",
      totalAmountCents: 3200,
      currency: "EUR",
      dueAt: new Date("2026-11-05T00:00:00.000Z"),
    },
    chargeStatus: "due",
    collectionMode: "manual",
    charges: [],
    lines: [],
    replayed: false,
  });
});

describe("Owner monthly-invoice issue HTTP boundary", () => {
  it("requires a session before parsing or resolving scope", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request(
      "https://example.invalid/api/v1/owner/billing/monthly-invoices/issue",
      { method: "POST", body: "{" }
    );

    const response = await POST(malformed);

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.issueMonthlyInvoice).not.toHaveBeenCalled();
  });

  it("rejects browser-controlled actor, role, or processor fields", async () => {
    const response = await POST(
      request({
        ...payload,
        actor: { userId, memberId },
        role: "owner",
        processor: "stripe",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.issueMonthlyInvoice).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before issuing", async () => {
    const response = await POST(request(payload, ""));

    expect(response.status).toBe(400);
    expect(mocks.issueMonthlyInvoice).not.toHaveBeenCalled();
  });

  it("stops before invoice issuance when site scope is denied", async () => {
    mocks.ownerScope.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Site denied", 403)
    );

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.issueMonthlyInvoice).not.toHaveBeenCalled();
  });

  it("stops before invoice issuance when the verified tenant is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.issueMonthlyInvoice).not.toHaveBeenCalled();
  });

  it("derives the tenant and actor from the authenticated scope and returns manual billing", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
    expect(mocks.issueMonthlyInvoice).toHaveBeenCalledWith({
      ...payload,
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        invoiceId: "70000000-0000-4000-8000-000000000007",
        reference: "QA-2026-10-01",
        status: "issued",
        chargeStatus: "due",
        collectionMode: "manual",
        currency: "EUR",
        servicePeriod: payload.servicePeriod,
        dueDate: payload.dueDate,
      },
    });
  });

  it("returns an idempotent replay as success rather than a second creation", async () => {
    mocks.issueMonthlyInvoice.mockResolvedValueOnce({
      invoice: {
        id: "70000000-0000-4000-8000-000000000007",
        reference: "QA-2026-10-01",
        status: "issued",
        totalAmountCents: 3200,
        currency: "EUR",
        dueAt: new Date("2026-11-05T00:00:00.000Z"),
      },
      chargeStatus: "due",
      collectionMode: "manual",
      charges: [],
      lines: [],
      replayed: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.issueMonthlyInvoice).toHaveBeenCalledTimes(1);
  });
});
