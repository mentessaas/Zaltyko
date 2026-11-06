import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/lib/db-transactions";

const mocks = vi.hoisted(() => ({ assertWritable: vi.fn() }));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));

import { memberLocationScopes, organizationMembers } from "@/db/zaltyko-schema";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const actor = {
  userId: "10000000-0000-4000-8000-000000000003",
  memberId: "10000000-0000-4000-8000-000000000004",
};

function database(options: {
  member?: { role: string; locationScopeMode: string } | null;
  scopedLocation?: boolean;
} = {}) {
  const member = options.member === undefined
    ? { role: "owner", locationScopeMode: "all" }
    : options.member;
  const select = vi.fn(() => {
    let selectedTable: unknown;
    const query = {
      from(table: unknown) {
        selectedTable = table;
        return query;
      },
      where() {
        return query;
      },
      async limit() {
        if (selectedTable === organizationMembers) return member ? [member] : [];
        if (selectedTable === memberLocationScopes && options.scopedLocation) {
          return [{ id: "synthetic-location-scope" }];
        }
        return [];
      },
    };
    return query;
  });
  return { tx: { select } as unknown as TransactionClient, select };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertWritable.mockResolvedValue(undefined);
});

describe("operational access and the post-downgrade read-only gate", () => {
  it("checks the organization write gate after resolving an active authorized member", async () => {
    const { tx, select } = database();
    const member = await assertOperationalAccess(tx, {
      organizationId,
      locationId,
      actor,
      intent: "write",
      allowedRoles: ["owner"],
    });

    expect(member).toMatchObject({ role: "owner", locationScopeMode: "all" });
    expect(select).toHaveBeenCalledTimes(1);
    expect(mocks.assertWritable).toHaveBeenCalledExactlyOnceWith(tx, organizationId);
  });

  it("keeps authorized reads available without invoking the write gate", async () => {
    const { tx } = database();

    await expect(assertOperationalAccess(tx, {
      organizationId,
      locationId,
      actor,
      allowedRoles: ["owner"],
    })).resolves.toMatchObject({ role: "owner" });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
  });

  it("checks a scoped location before evaluating a write", async () => {
    const { tx, select } = database({
      member: { role: "manager", locationScopeMode: "limited" },
      scopedLocation: true,
    });

    await assertOperationalAccess(tx, {
      organizationId,
      locationId,
      actor,
      intent: "write",
      allowedRoles: ["manager"],
    });

    expect(select).toHaveBeenCalledTimes(2);
    expect(mocks.assertWritable).toHaveBeenCalledExactlyOnceWith(tx, organizationId);
  });

  it("does not run the write gate for a member without access to the requested location", async () => {
    const { tx } = database({
      member: { role: "manager", locationScopeMode: "limited" },
      scopedLocation: false,
    });

    await expect(assertOperationalAccess(tx, {
      organizationId,
      locationId,
      actor,
      intent: "write",
      allowedRoles: ["manager"],
    })).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
  });

  it("does not evaluate capacity for an inactive or unauthorized member", async () => {
    const { tx } = database({ member: { role: "coach", locationScopeMode: "all" } });

    await expect(assertOperationalAccess(tx, {
      organizationId,
      locationId,
      actor,
      intent: "write",
      allowedRoles: ["owner", "manager"],
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
  });

  it("fails closed when over-capacity cannot be verified", async () => {
    const { tx } = database();
    const unavailable = new Error("capacity unavailable");
    mocks.assertWritable.mockRejectedValueOnce(unavailable);

    await expect(assertOperationalAccess(tx, {
      organizationId,
      locationId,
      actor,
      intent: "write",
      allowedRoles: ["owner"],
    })).rejects.toBe(unavailable);
  });
});
