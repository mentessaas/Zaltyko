import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  resolveOwnerScope: vi.fn(),
}));

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

vi.mock("@/db", () => ({
  db: { execute: mocks.execute },
}));

vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));

import { getOwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const allowedLocation = "30000000-0000-4000-8000-000000000010";
const organizationId = "30000000-0000-4000-8000-000000000001";

function ownerScope(role: "owner" | "admin" | "manager", all = false) {
  return {
    organization: {
      id: organizationId,
      name: "Academia",
      defaultCurrency: "EUR",
    },
    member: {
      id: "member-1",
      role,
      locationScopeMode: all ? "all" : "selected",
    },
    locations: [
      { id: allowedLocation, name: "Sede Centro" },
      ...(all
        ? [{ id: "30000000-0000-4000-8000-000000000011", name: "Sede Norte" }]
        : []),
    ],
    selectedLocationId: all ? null : allowedLocation,
    canViewOrganizationAggregate: all,
  };
}

function compiledSql(query: { queryChunks: unknown[] }) {
  return new PgDialect().sqlToQuery(query as never);
}

describe("owner operational summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ default_timezone: "Europe/Madrid" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: allowedLocation,
            name: "Sede Centro",
            timezone: "Europe/Madrid",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ active_athletes: 0, active_groups: 0 }],
      })
      .mockResolvedValueOnce({ rows: [{ attendance_records: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
  });

  it("returns zero for valid empty results and does not expose finance to managers", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(ownerScope("manager"));

    const result = await getOwnerOperationalSummary({
      userId: "user-1",
      organizationId,
      from: "2026-10-01",
      to: "2026-10-14",
    });

    expect(result.metrics).toEqual({
      activeAthletes: 0,
      activeGroups: 0,
      attendanceRecords: 0,
      paymentsReceived: {
        state: "unavailable",
        reason: "financial_access_required",
      },
    });
    expect(mocks.execute).toHaveBeenCalledTimes(4);
    expect(result.scope).toMatchObject({
      kind: "location",
      locationId: allowedLocation,
      locationIds: [allowedLocation],
      timezoneMode: "location",
    });
  });

  it("returns owner payment totals by currency, including refunded receipts as gross", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(ownerScope("owner", true));
    mocks.execute.mockReset();
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ default_timezone: "Europe/Madrid" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: allowedLocation,
            name: "Sede Centro",
            timezone: "Europe/Madrid",
          },
          {
            id: "30000000-0000-4000-8000-000000000011",
            name: "Sede Norte",
            timezone: "Europe/Madrid",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ active_athletes: 4, active_groups: 2 }],
      })
      .mockResolvedValueOnce({ rows: [{ attendance_records: 9 }] })
      .mockResolvedValueOnce({
        rows: [
          { currency: "EUR", payment_count: 3, gross_amount_cents: 21000 },
          { currency: "USD", payment_count: 1, gross_amount_cents: 5000 },
        ],
      });

    const result = await getOwnerOperationalSummary({
      userId: "user-1",
      organizationId,
      from: "2026-10-01",
      to: "2026-10-14",
    });

    expect(result.scope).toMatchObject({
      kind: "organization",
      locationId: null,
      locationIds: [allowedLocation, "30000000-0000-4000-8000-000000000011"],
      timezoneMode: "per_location",
    });
    expect(result.metrics).toMatchObject({
      activeAthletes: 4,
      activeGroups: 2,
      attendanceRecords: 9,
      paymentsReceived: {
        state: "available",
        count: 4,
        grossByCurrency: [
          { currency: "EUR", amountCents: 21000 },
          { currency: "USD", amountCents: 5000 },
        ],
        label: "Bruto recibido sin netear devoluciones",
      },
    });
    expect(mocks.execute).toHaveBeenCalledTimes(5);
    const queries = mocks.execute.mock.calls.map(([query]) =>
      compiledSql(query)
    );
    expect(queries[2].sql).toContain("count(distinct athlete.id)");
    expect(queries[2].sql).toContain("membership.status = 'active'");
    expect(queries[2].sql).toContain("g.status = 'active'");
    expect(queries[2].params).toContain(organizationId);
    expect(queries[2].params).toContain(allowedLocation);
    expect(queries[2].params).toContain("30000000-0000-4000-8000-000000000011");
    expect(queries[3].sql).toContain("session.starts_at");
    expect(queries[4].sql).toContain(
      "payment.status in ('succeeded', 'partially_refunded', 'refunded')"
    );
    expect(queries[4].sql).toContain("group by payment.currency");
    expect(queries[4].sql).toContain("location.timezone");
  });

  it("rejects periods over one year before running aggregate queries", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(ownerScope("admin"));

    await expect(
      getOwnerOperationalSummary({
        userId: "user-1",
        organizationId,
        from: "2025-01-01",
        to: "2026-10-14",
      })
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["missing count row", { rows: [] }],
    [
      "malformed count values",
      { rows: [{ active_athletes: null, active_groups: 0 }] },
    ],
  ])("does not turn %s into zero", async (_label, countResult) => {
    mocks.resolveOwnerScope.mockResolvedValue(ownerScope("manager"));
    mocks.execute.mockReset();
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ default_timezone: "Europe/Madrid" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: allowedLocation,
            name: "Sede Centro",
            timezone: "Europe/Madrid",
          },
        ],
      })
      .mockResolvedValueOnce(countResult);

    await expect(
      getOwnerOperationalSummary({ userId: "user-1", organizationId })
    ).rejects.toMatchObject({ code: "INVALID_RELATION" });
    expect(mocks.execute).toHaveBeenCalledTimes(3);
  });

  it.each(["", " ", false, true, "1e2"])(
    "does not coerce malformed aggregate %s into a plausible count",
    async (value) => {
      mocks.resolveOwnerScope.mockResolvedValue(ownerScope("manager"));
      mocks.execute.mockReset();
      mocks.execute
        .mockResolvedValueOnce({
          rows: [{ default_timezone: "Europe/Madrid" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: allowedLocation,
              name: "Sede Centro",
              timezone: "Europe/Madrid",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ active_athletes: value, active_groups: 0 }],
        });
      await expect(
        getOwnerOperationalSummary({ userId: "user-1", organizationId })
      ).rejects.toMatchObject({ code: "INVALID_RELATION" });
      expect(mocks.execute).toHaveBeenCalledTimes(3);
    }
  );

  it("rejects an unexpectedly missing attendance aggregate row", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(ownerScope("manager"));
    mocks.execute.mockReset();
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ default_timezone: "Europe/Madrid" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: allowedLocation,
            name: "Sede Centro",
            timezone: "Europe/Madrid",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ active_athletes: 0, active_groups: 0 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      getOwnerOperationalSummary({ userId: "user-1", organizationId })
    ).rejects.toMatchObject({ code: "INVALID_RELATION" });
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it("rejects a currency-count sum that exceeds the safe integer range", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(ownerScope("owner"));
    mocks.execute.mockReset();
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ default_timezone: "Europe/Madrid" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: allowedLocation,
            name: "Sede Centro",
            timezone: "Europe/Madrid",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ active_athletes: 0, active_groups: 0 }],
      })
      .mockResolvedValueOnce({ rows: [{ attendance_records: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            currency: "EUR",
            payment_count: Number.MAX_SAFE_INTEGER,
            gross_amount_cents: 1,
          },
          { currency: "USD", payment_count: 1, gross_amount_cents: 1 },
        ],
      });

    await expect(
      getOwnerOperationalSummary({ userId: "user-1", organizationId })
    ).rejects.toMatchObject({ code: "INVALID_RELATION" });
  });

  it.each(["FORBIDDEN", "LOCATION_SCOPE_DENIED"] as const)(
    "propagates %s before reading operational data",
    async (code) => {
      mocks.resolveOwnerScope.mockRejectedValue(
        new OperationalError(code, "Alcance fuera de permiso", 403)
      );

      await expect(
        getOwnerOperationalSummary({
          userId: "user-1",
          organizationId,
          locationId: "30000000-0000-4000-8000-000000000099",
        })
      ).rejects.toMatchObject({ code });
      expect(mocks.execute).not.toHaveBeenCalled();
    }
  );
});
