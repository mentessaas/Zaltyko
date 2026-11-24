import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  retrieve: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/modules/saas-billing/application/saas-billing-config", () => ({
  getSaasStripeConfig: () => ({
    environment: "test", secretKey: "sk_test_synthetic", webhookSecret: "whsec_synthetic",
    providerAccountReference: "acct_synthetic", portalEnabled: false,
    prices: { starter: { month: "price_club_month", year: "price_club_year" }, growth: { month: null, year: null } },
    locationPrices: { month: "price_location_month", year: "price_location_year" },
  }),
  priceForLocation: (_config: unknown, interval: "month" | "year") => `price_location_${interval}`,
  createSaasStripeClient: () => ({
    subscriptions: { retrieve: mocks.retrieve },
    subscriptionItems: { create: mocks.create, update: mocks.update, del: mocks.del },
  }),
}));

import { syncOrganizationLocationAddon } from "@/modules/saas-billing/application/location-addon-service";

const orgA = "10000000-0000-4000-8000-000000000001";
const subscription = { subscription_reference: "sub_synthetic", billing_interval: "month", environment: "test",
  provider_account_reference: "acct_synthetic", provider_status: "active" };

describe("sincronización de sedes adicionales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValueOnce({ rows: [subscription] }).mockResolvedValueOnce({ rows: [{ count: 3 }] });
    mocks.retrieve.mockResolvedValue({ items: { data: [] } });
    mocks.create.mockResolvedValue({ id: "si_synthetic" });
    mocks.update.mockResolvedValue({ id: "si_synthetic" });
    mocks.del.mockResolvedValue({ id: "si_synthetic", deleted: true });
  });

  it("crea el segundo concepto con una unidad por cada sede activa que exceda la incluida", async () => {
    await syncOrganizationLocationAddon({ organizationId: orgA, idempotencyKey: "location-added-123" });
    expect(mocks.create).toHaveBeenCalledWith({
      subscription: "sub_synthetic", price: "price_location_month", quantity: 2,
      proration_behavior: "create_prorations",
    }, { idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("actualiza el concepto existente al reducir la cantidad", async () => {
    mocks.execute.mockReset().mockResolvedValueOnce({ rows: [subscription] }).mockResolvedValueOnce({ rows: [{ count: 2 }] });
    mocks.retrieve.mockResolvedValue({ items: { data: [{ id: "si_existing", price: { id: "price_location_month" } }] } });
    await syncOrganizationLocationAddon({ organizationId: orgA, idempotencyKey: "location-removed-123" });
    expect(mocks.update).toHaveBeenCalledWith("si_existing", {
      quantity: 1, proration_behavior: "create_prorations",
    }, { idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("elimina el concepto cuando queda una sola sede activa", async () => {
    mocks.execute.mockReset().mockResolvedValueOnce({ rows: [subscription] }).mockResolvedValueOnce({ rows: [{ count: 1 }] });
    mocks.retrieve.mockResolvedValue({ items: { data: [{ id: "si_existing", price: { id: "price_location_month" } }] } });
    await syncOrganizationLocationAddon({ organizationId: orgA, idempotencyKey: "last-location-123" });
    expect(mocks.del).toHaveBeenCalledWith("si_existing", { proration_behavior: "create_prorations" }, {
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
