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

function compileChargeQuery(callIndex = 0): { sql: string; params: unknown[] } {
  const [query] = mocks.execute.mock.calls[callIndex] as [SQL];
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
    cursorDueAt: "2026-10-31T22:00:00.000000Z",
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
    expect(query.params.slice(0, 2)).toEqual([organizationId, authorizedLocationId]);
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
    expect(query.params.slice(0, 3)).toEqual([
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

  it("página más de 50 cargos con cursor estable y conserva el alcance autorizado", async () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      monthlyChargeRow({
        chargeId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        invoiceReference: `MENSUAL-202610-${String(index + 1).padStart(3, "0")}`,
        cursorDueAt: `2026-10-31T22:00:00.${String(index + 1).padStart(6, "0")}Z`,
      })
    );
    mocks.execute.mockResolvedValueOnce({ rows });

    const firstPage = await getManualPaymentOptions({
      userId,
      organizationId,
      locationId: authorizedLocationId,
    });

    expect(firstPage.charges).toHaveLength(50);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(firstPage.selectedLocationId).toBe(authorizedLocationId);
    const firstQuery = compileChargeQuery();
    expect(firstQuery.sql).toContain("order by c.due_at asc, i.reference asc, c.id asc");
    expect(firstQuery.sql).toMatch(/limit \$\d+/);
    expect(firstQuery.params.at(-1)).toBe(51);

    mocks.execute.mockResolvedValueOnce({ rows: [rows[50]] });
    const secondPage = await getManualPaymentOptions({
      userId,
      organizationId,
      locationId: authorizedLocationId,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.charges).toHaveLength(1);
    expect(secondPage.charges[0]?.chargeId).toBe(rows[50]?.chargeId);
    expect(secondPage.nextCursor).toBeNull();
    const secondQuery = compileChargeQuery(1);
    expect(secondQuery.sql).toContain("(c.due_at, i.reference, c.id) > (");
    expect(secondQuery.params).toContain(authorizedLocationId);
    expect(secondQuery.params).toContain(rows[49]?.chargeId);
    expect(secondQuery.params).toContain(rows[49]?.cursorDueAt);
  });

  it("permite recorrer más de 250 cargos sin un tope silencioso", async () => {
    const rows = Array.from({ length: 251 }, (_, index) =>
      monthlyChargeRow({
        chargeId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        invoiceReference: `MENSUAL-202610-${String(index + 1).padStart(3, "0")}`,
      })
    );
    let offset = 0;
    const seenChargeIds: string[] = [];
    let cursor: string | null = null;

    do {
      mocks.execute.mockResolvedValueOnce({ rows: rows.slice(offset, offset + 51) });
      const page = await getManualPaymentOptions({
        userId,
        organizationId,
        locationId: authorizedLocationId,
        ...(cursor ? { cursor } : {}),
      });
      seenChargeIds.push(...page.charges.map((charge) => charge.chargeId));
      offset += page.charges.length;
      cursor = page.nextCursor;
    } while (cursor);

    expect(seenChargeIds).toHaveLength(251);
    expect(new Set(seenChargeIds).size).toBe(251);
    expect(seenChargeIds.at(-1)).toBe(rows.at(-1)?.chargeId);
    expect(mocks.execute).toHaveBeenCalledTimes(6);
  });

  it("rechaza un cursor de otro actor antes de consultar cargos", async () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      monthlyChargeRow({
        chargeId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        invoiceReference: `MENSUAL-202610-${String(index + 1).padStart(3, "0")}`,
      })
    );
    mocks.execute.mockResolvedValueOnce({ rows });
    const firstPage = await getManualPaymentOptions({
      userId,
      organizationId,
      locationId: authorizedLocationId,
    });

    await expect(
      getManualPaymentOptions({
        userId: "20000000-0000-4000-8000-000000000009",
        organizationId,
        locationId: authorizedLocationId,
        cursor: firstPage.nextCursor ?? undefined,
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 400 });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("rechaza un cursor cuando cambia el conjunto de sedes autorizadas", async () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      monthlyChargeRow({
        chargeId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        invoiceReference: `MENSUAL-202610-${String(index + 1).padStart(3, "0")}`,
      })
    );
    mocks.resolveOwnerScope.mockResolvedValueOnce(
      ownerScope({
        selectedLocationId: null,
        locations: [
          { id: authorizedLocationId, name: "Sede A" },
          { id: otherAuthorizedLocationId, name: "Sede B" },
        ],
      })
    );
    mocks.execute.mockResolvedValueOnce({ rows });
    const firstPage = await getManualPaymentOptions({ userId, organizationId });

    mocks.resolveOwnerScope.mockResolvedValueOnce(
      ownerScope({
        selectedLocationId: null,
        locations: [{ id: authorizedLocationId, name: "Sede A" }],
      })
    );
    await expect(
      getManualPaymentOptions({
        userId,
        organizationId,
        cursor: firstPage.nextCursor ?? undefined,
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 400 });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("mantiene filtros de organización y sede aunque se altere la posición del cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      monthlyChargeRow({
        chargeId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        invoiceReference: `MENSUAL-202610-${String(index + 1).padStart(3, "0")}`,
      })
    );
    mocks.execute.mockResolvedValueOnce({ rows });
    const firstPage = await getManualPaymentOptions({
      userId,
      organizationId,
      locationId: authorizedLocationId,
    });
    const cursorPayload = JSON.parse(
      Buffer.from(firstPage.nextCursor ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;
    cursorPayload.lastDueAt = "2999-12-31T23:59:59.000000Z";
    const alteredCursor = Buffer.from(
      JSON.stringify(cursorPayload),
      "utf8"
    ).toString("base64url");
    mocks.execute.mockResolvedValueOnce({ rows: [] });

    await getManualPaymentOptions({
      userId,
      organizationId,
      locationId: authorizedLocationId,
      cursor: alteredCursor,
    });

    const query = compileChargeQuery(1);
    expect(query.sql).toContain("where c.organization_id = $1::uuid");
    expect(query.sql).toContain("and c.location_id in ($2::uuid)");
    expect(query.params.slice(0, 2)).toEqual([organizationId, authorizedLocationId]);
    expect(query.params).not.toContain(otherAuthorizedLocationId);
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
