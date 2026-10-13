import { describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

import { createMonthlyPricePlan } from "@/modules/billing/application/monthly-price-plan-service";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction } }));

describe("servicio de tarifas mensuales", () => {
  it("rechaza un importe que desborda integer antes de abrir transacción", async () => {
    await expect(
      createMonthlyPricePlan({
        organizationId: "10000000-0000-4000-8000-000000000001",
        locationId: "10000000-0000-4000-8000-000000000002",
        name: "Cuota mensual",
        amountCents: 2_147_483_648,
        idempotencyKey: "monthly-price-overflow",
        actor: {
          userId: "10000000-0000-4000-8000-000000000003",
          memberId: "10000000-0000-4000-8000-000000000004",
        },
      })
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
