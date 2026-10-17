import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { getManualPaymentOptions } from "@/modules/billing/application/manual-payments";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  resolveOwnerScope: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));

const organizationId = "10000000-0000-4000-8000-000000000001";
const authorizedLocationId = "10000000-0000-4000-8000-000000000002";
const otherAuthorizedLocationId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";

function ownerScope(input?: {
  role?: string;
  selectedLocationId?: string | null;
  locations?: Array<{ id: string; name: string }>;
}) {
  const locations = input?.locations ?? [
    { id: authorizedLocationId, name: "Sede autorizada" },
  ];
  return {
    organization: {
      id: organizationId,
      name: "Academia sintética",
      defaultCurrency: "EUR",
    },
    member: {
      id: "10000000-0000-4000-8000-000000000005",
      role: input?.role ?? "owner",
      locationScopeMode: "limited",
    },
    locations,
    selectedLocationId:
      input?.selectedLocationId === undefined
        ? authorizedLocationId
        : input.selectedLocationId,
    canViewOrganizationAggregate: false,
  };
}

function compileChargeQuery(): { sql: string; params: unknown[] } {
  const [query] = mocks.execute.mock.calls[0] as [SQL];
  return new PgDialect().sqlToQuery(query);
}

function monthlyChargeRow(overrides: Record<string, unknown> = {}) {
  return {
    chargeId: "10000000-0000-4000-8000-000000000006",
    familyId: "10000000-0000-4000-8000-000000000007",
    locationId: authorizedLocationId,
    locationName: "Sede autorizada",
    invoiceReference: "MENSUAL-202610-familia",
    payerName: "Tutora sintética",
    currency: "EUR",
    dueAt: "2026-10-31 22:00:00+00",
    totalCents: "3500",
    allocatedCents: "0",
    outstandingCents: "3500",
    // Monthly athlete invoice lines intentionally have enrollment_id = NULL.
    // The service projection does not depend on that legacy charge relation.
    ...overrides,
  };
}

describe("opciones de pagos manuales", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveOwnerScope.mockResolvedValue(ownerScope());
    mocks.execute.mockResolvedValue({ rows: [monthlyChargeRow()] });
  });

  it("mapea un cargo mensual de gimnasta pendiente sin enrollment_id", async () => {
    const result = await getManualPaymentOptions({
      userId,
      organizationId,
      locationId: authorizedLocationId,
    });

    expect(result.charges).toEqual([
      expect.objectContaining({
        chargeId: "10000000-0000-4000-8000-000000000006",
        locationId: authorizedLocationId,
        invoiceReference: "MENSUAL-202610-familia",
        totalCents: 3500,
        allocatedCents: 0,
        outstandingCents: 3500,
      }),
    ]);

    const query = compileChargeQuery();
    expect(query.sql).toContain("where c.organization_id = $1::uuid");
    expect(query.sql).toContain("and c.location_id in ($2::uuid)");
    expect(query.sql).toContain("and c.status in ('due', 'partially_paid')");
    expect(query.sql).toContain("and i.status not in ('draft', 'void')");
    expect(query.sql).toContain(
      "having coalesce(sum(pa.amount_cents), 0) < c.amount_cents"
    );
    expect(query.sql).not.toMatch(/enrollment_id|invoice_line_id/i);
    expect(query.params).toEqual([organizationId, authorizedLocationId]);
    expect(query.params).not.toContain(otherAuthorizedLocationId);
    expect(query.params).not.toContain("20000000-0000-4000-8000-000000000001");
  });

  it("incluye en el alcance multi-sede solo las sedes autorizadas", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(
      ownerScope({
        selectedLocationId: null,
        locations: [
          { id: authorizedLocationId, name: "Sede A" },
          { id: otherAuthorizedLocationId, name: "Sede B" },
        ],
      })
    );
    mocks.execute.mockResolvedValue({ rows: [] });

    await getManualPaymentOptions({ userId, organizationId });

    const query = compileChargeQuery();
    expect(query.sql).toContain("and c.location_id in ($2::uuid, $3::uuid)");
    expect(query.params).toEqual([
      organizationId,
      authorizedLocationId,
      otherAuthorizedLocationId,
    ]);
    expect(query.params).not.toContain("20000000-0000-4000-8000-000000000001");
  });

  it("devuelve el saldo pendiente tras asignar un pago parcial", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        monthlyChargeRow({
          totalCents: "3500",
          allocatedCents: "1200",
          outstandingCents: "2300",
        }),
      ],
    });

    const result = await getManualPaymentOptions({ userId, organizationId });

    expect(result.charges[0]).toMatchObject({
      totalCents: 3500,
      allocatedCents: 1200,
      outstandingCents: 2300,
    });
    expect(compileChargeQuery().sql).toContain(
      "and c.status in ('due', 'partially_paid')"
    );
  });

  it("deniega coaches antes de consultar cargos", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(ownerScope({ role: "coach" }));

    await expect(
      getManualPaymentOptions({ userId, organizationId })
    ).rejects.toMatchObject<Partial<OperationalError>>({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
