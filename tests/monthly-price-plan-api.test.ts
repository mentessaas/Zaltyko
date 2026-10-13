import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createPricePlan } from "@/app/api/v1/owner/billing/price-plans/route";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { createMonthlyPricePlan } from "@/modules/billing/application/monthly-price-plan-service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

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
vi.mock("@/modules/billing/application/monthly-price-plan-service", () => ({
  createMonthlyPricePlan: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const pricePlanId = "10000000-0000-4000-8000-000000000005";

function request(
  overrides: Record<string, unknown> = {},
  key = "price-plan-001"
) {
  return new Request("https://zaltyko.test/api/v1/owner/billing/price-plans", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({
      organizationId,
      locationId,
      name: "Cuota mensual",
      amountCents: 12500,
      ...overrides,
    }),
  });
}

describe("API Owner para crear tarifas mensuales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
    vi.mocked(resolveOwnerScope).mockResolvedValue({
      member: { id: memberId },
      organization: { id: organizationId },
    } as never);
    vi.mocked(rateLimit).mockResolvedValue({ success: true } as never);
    vi.mocked(createMonthlyPricePlan).mockResolvedValue({
      pricePlan: {
        id: pricePlanId,
        name: "Cuota mensual",
        amountCents: 12500,
        currency: "EUR",
        cadence: "monthly",
        isActive: true,
      },
      replayed: false,
    } as never);
  });

  afterEach(() => vi.clearAllMocks());

  it("crea con cadence mensual fija, actor server-side, idempotencia y sin caché", async () => {
    const response = await createPricePlan(request());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createMonthlyPricePlan).toHaveBeenCalledWith({
      organizationId,
      locationId,
      name: "Cuota mensual",
      amountCents: 12500,
      idempotencyKey: "price-plan-001",
      actor: { userId, memberId },
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        id: pricePlanId,
        currency: "EUR",
        cadence: "monthly",
        isActive: true,
      },
    });
  });

  it("devuelve 200 al reintentar la misma orden ya aplicada", async () => {
    vi.mocked(createMonthlyPricePlan).mockResolvedValue({
      pricePlan: {
        id: pricePlanId,
        name: "Cuota mensual",
        amountCents: 12500,
        currency: "EUR",
        cadence: "monthly",
        isActive: true,
      },
      replayed: true,
    } as never);

    const response = await createPricePlan(request());
    expect(response.status).toBe(200);
  });

  it("rechaza campos de organización/tarifa no admitidos por el contrato", async () => {
    const response = await createPricePlan(request({ cadence: "annual" }));
    expect(response.status).toBe(400);
    expect(createMonthlyPricePlan).not.toHaveBeenCalled();
  });

  it("acepta el máximo integer de PostgreSQL y rechaza el valor siguiente", async () => {
    const maximumResponse = await createPricePlan(
      request({ amountCents: 2_147_483_647 })
    );
    expect(maximumResponse.status).toBe(201);
    expect(createMonthlyPricePlan).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 2_147_483_647 })
    );

    vi.mocked(createMonthlyPricePlan).mockClear();
    const overflowResponse = await createPricePlan(
      request({ amountCents: 2_147_483_648 })
    );
    expect(overflowResponse.status).toBe(400);
    expect(createMonthlyPricePlan).not.toHaveBeenCalled();
  });

  it("mantiene el rechazo de manager para escrituras financieras", async () => {
    vi.mocked(createMonthlyPricePlan).mockRejectedValue(
      new OperationalError("FORBIDDEN", "Forbidden", 403)
    );

    const response = await createPricePlan(request());
    expect(response.status).toBe(403);
  });
});
