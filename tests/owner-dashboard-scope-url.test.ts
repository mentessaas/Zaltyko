import { describe, expect, it } from "vitest";
import { ownerDashboardScopeHref } from "@/components/owner-dashboard/owner-dashboard-scope-url";

const organizationId = "40000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000002";

describe("enlaces del Owner respetan el ámbito del panel", () => {
  it("conserva academia y sede seleccionada", () => {
    expect(
      ownerDashboardScopeHref("/owner/groups", organizationId, locationId)
    ).toBe(
      `/owner/groups?organizationId=${organizationId}&locationId=${locationId}`
    );
  });

  it("omite la sede cuando se ve el agregado de toda la academia", () => {
    expect(
      ownerDashboardScopeHref("/owner/classes", organizationId, null)
    ).toBe(`/owner/classes?organizationId=${organizationId}`);
  });
});
