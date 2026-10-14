import { describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

import { createMonthlyPricePlan } from "@/modules/billing/application/monthly-price-plan-service";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction } }));

const coverage = {
  classTemplateIds: ["10000000-0000-4000-8000-000000000005"],
  startsOn: "2026-10-01",
  endsOn: null,
};

describe("servicio de tarifas mensuales", () => {
  it("rechaza un importe que desborda integer antes de abrir transacción", async () => {
    await expect(
      createMonthlyPricePlan({
        organizationId: "10000000-0000-4000-8000-000000000001",
        locationId: "10000000-0000-4000-8000-000000000002",
        name: "Cuota mensual",
        amountCents: 2_147_483_648,
        coverage,
        idempotencyKey: "monthly-price-overflow",
        actor: {
          userId: "10000000-0000-4000-8000-000000000003",
          memberId: "10000000-0000-4000-8000-000000000004",
        },
      })
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "rechaza cobertura vacía",
      value: { ...coverage, classTemplateIds: [] },
    },
    {
      name: "rechaza IDs de plantilla repetidos",
      value: {
        ...coverage,
        classTemplateIds: [
          coverage.classTemplateIds[0],
          coverage.classTemplateIds[0],
        ],
      },
    },
    {
      name: "rechaza fechas invertidas",
      value: { ...coverage, startsOn: "2026-10-02", endsOn: "2026-10-01" },
    },
    {
      name: "rechaza una fecha de calendario inexistente",
      value: { ...coverage, startsOn: "2026-02-30" },
    },
  ])("$name antes de abrir transacción", async ({ value }) => {
    await expect(
      createMonthlyPricePlan({
        organizationId: "10000000-0000-4000-8000-000000000001",
        locationId: "10000000-0000-4000-8000-000000000002",
        name: "Cuota mensual",
        amountCents: 12500,
        coverage: value,
        idempotencyKey: "monthly-price-invalid-coverage",
        actor: {
          userId: "10000000-0000-4000-8000-000000000003",
          memberId: "10000000-0000-4000-8000-000000000004",
        },
      })
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
