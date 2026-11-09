import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));

import { getOwnerSetupProgress } from "@/modules/owner-dashboard/application/setup-checklist";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const organizationId = "30000000-0000-4000-8000-000000000001";
const centro = "30000000-0000-4000-8000-000000000010";
const norte = "30000000-0000-4000-8000-000000000011";

function scope(all: boolean, selectedLocationId: string | null = all ? null : centro): OwnerScope {
  return {
    organization: { id: organizationId, name: "Academia", defaultCurrency: "EUR" },
    member: { id: "member-1", role: all ? "owner" : "manager", locationScopeMode: all ? "all" : "selected" },
    locations: all
      ? [{ id: centro, name: "Sede Centro" }, { id: norte, name: "Sede Norte" }]
      : [{ id: centro, name: "Sede Centro" }],
    selectedLocationId,
    canViewOrganizationAggregate: all,
  };
}

function lastQuery() {
  const query = mocks.execute.mock.calls.at(-1)?.[0];
  return new PgDialect().sqlToQuery(query as never);
}

const row = {
  active_locations: "1",
  has_scheduled_class: true,
  has_athletes: true,
  has_enrolled_athletes: false,
  has_attendance: false,
};

describe("getOwnerSetupProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ rows: [row] });
  });

  it("maps the canonical counts into step facts", async () => {
    await expect(getOwnerSetupProgress({ scope: scope(true) })).resolves.toEqual({
      activeLocations: 1,
      hasScheduledClass: true,
      hasAthletes: true,
      hasEnrolledAthletes: false,
      hasAttendance: false,
    });
  });

  it("reads only zaltyko.* tables filtered by organization, with no writes", async () => {
    await getOwnerSetupProgress({ scope: scope(true) });
    const { sql, params } = lastQuery();
    for (const table of [
      "zaltyko.locations",
      "zaltyko.class_templates",
      "zaltyko.class_template_weekdays",
      "zaltyko.athletes",
      "zaltyko.enrollments",
      "zaltyko.attendance_records",
    ]) {
      expect(sql).toContain(table);
    }
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(params.filter((param) => param === organizationId).length).toBeGreaterThanOrEqual(5);
  });

  it("uses every authorized site for the organization aggregate", async () => {
    await getOwnerSetupProgress({ scope: scope(true) });
    const { params } = lastQuery();
    expect(params).toEqual(expect.arrayContaining([centro, norte]));
  });

  it("narrows to the selected site", async () => {
    await getOwnerSetupProgress({ scope: scope(true, norte), locationId: norte });
    const { params } = lastQuery();
    expect(params).toContain(norte);
    expect(params).not.toContain(centro);
  });

  it("keeps a site-scoped manager on their site even without a requested location", async () => {
    await getOwnerSetupProgress({ scope: scope(false) });
    const { params } = lastQuery();
    expect(params).toContain(centro);
    expect(params).not.toContain(norte);
  });

  it("returns an empty academy without querying when no site is in scope", async () => {
    const result = await getOwnerSetupProgress({
      scope: { ...scope(true), locations: [] },
    });
    expect(result).toEqual({
      activeLocations: 0,
      hasScheduledClass: false,
      hasAthletes: false,
      hasEnrolledAthletes: false,
      hasAttendance: false,
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("propagates query failures so the page can omit the checklist", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("Synthetic database failure"));
    await expect(getOwnerSetupProgress({ scope: scope(true) })).rejects.toThrow("Synthetic database failure");
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    await expect(getOwnerSetupProgress({ scope: scope(true) })).rejects.toThrow("no row");
  });
});
