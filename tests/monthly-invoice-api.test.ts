import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getOptions } from "@/app/api/v1/owner/billing/monthly-invoices/options/route";
import { POST as issueInvoice } from "@/app/api/v1/owner/billing/monthly-invoices/issue/route";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import {
  getMonthlyInvoiceOptions,
  issueMonthlyInvoice,
} from "@/modules/billing/application/monthly-invoice-service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({ limit: 20, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "tenant"),
  rateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/billing/application/monthly-invoice-service", () => ({
  getMonthlyInvoiceOptions: vi.fn(),
  issueMonthlyInvoice: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const familyId = "10000000-0000-4000-8000-000000000005";
const payerId = "10000000-0000-4000-8000-000000000006";

describe("API Owner de facturación mensual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
    vi.mocked(resolveOwnerScope).mockResolvedValue({
      member: { id: memberId },
      organization: { id: organizationId },
    } as never);
    vi.mocked(rateLimit).mockResolvedValue({ success: true } as never);
  });

  afterEach(() => vi.clearAllMocks());

  it("devuelve opciones sin caché y deriva el actor del usuario autenticado", async () => {
    vi.mocked(getMonthlyInvoiceOptions).mockResolvedValue({
      families: [],
      unassignedEnrollments: [],
    } as never);
    const response = await getOptions(
      new Request(
        `https://zaltyko.test/api/v1/owner/billing/monthly-invoices/options?organizationId=${organizationId}&locationId=${locationId}&servicePeriod=2026-10`
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getMonthlyInvoiceOptions).toHaveBeenCalledWith({
      organizationId,
      locationId,
      servicePeriod: "2026-10",
      actor: { userId, memberId },
    });
  });

  it("emite el conjunto confirmado con Idempotency-Key y devuelve fecha local y UTC", async () => {
    vi.mocked(issueMonthlyInvoice).mockResolvedValue({
      invoice: {
        id: "10000000-0000-4000-8000-000000000007",
        reference: "INV-2026-001",
        status: "issued",
        totalAmountCents: 12000,
        currency: "EUR",
        dueAt: new Date("2026-10-31T22:59:59.999Z"),
      },
      replayed: false,
      lines: [],
      chargeStatus: "due",
      collectionMode: "manual",
    } as never);
    const response = await issueInvoice(
      new Request(
        "https://zaltyko.test/api/v1/owner/billing/monthly-invoices/issue",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "monthly-issue-001",
          },
          body: JSON.stringify({
            organizationId,
            locationId,
            familyId,
            familyPayerId: payerId,
            servicePeriod: "2026-10",
            dueDate: "2026-10-31",
            quoteHash: "a".repeat(64),
          }),
        }
      )
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(issueMonthlyInvoice).toHaveBeenCalledWith({
      organizationId,
      locationId,
      familyId,
      familyPayerId: payerId,
      servicePeriod: "2026-10",
      dueDate: "2026-10-31",
      quoteHash: "a".repeat(64),
      idempotencyKey: "monthly-issue-001",
      actor: { userId, memberId },
    });
    await expect(response.json()).resolves.toMatchObject({
      data: {
        dueDate: "2026-10-31",
        dueAt: "2026-10-31T22:59:59.999Z",
        chargeStatus: "due",
        collectionMode: "manual",
      },
    });
  });

  it("rechaza IDs o importes de líneas aportados por el cliente", async () => {
    const response = await issueInvoice(
      new Request(
        "https://zaltyko.test/api/v1/owner/billing/monthly-invoices/issue",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "monthly-issue-002",
          },
          body: JSON.stringify({
            organizationId,
            locationId,
            familyId,
            familyPayerId: payerId,
            servicePeriod: "2026-10",
            dueDate: "2026-10-31",
            quoteHash: "a".repeat(64),
            enrollmentIds: ["10000000-0000-4000-8000-000000000008"],
            amountCents: 1,
          }),
        }
      )
    );
    expect(response.status).toBe(400);
    expect(issueMonthlyInvoice).not.toHaveBeenCalled();
  });
});
