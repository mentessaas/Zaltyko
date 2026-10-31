import { describe, expect, it } from "vitest";

import { monthlyInvoicesHref } from "@/components/owner-dashboard/owner-enrollment-ui";

describe("navegación de inscripción a facturación mensual", () => {
  it("conserva academia y sede al completar familia y responsable", () => {
    const href = monthlyInvoicesHref(
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002"
    );
    const url = new URL(href, "https://synthetic.invalid");

    expect(url.pathname).toBe("/owner/monthly-invoices");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      organizationId: "10000000-0000-4000-8000-000000000001",
      locationId: "10000000-0000-4000-8000-000000000002",
    });
  });

  it("no inventa una sede cuando el Owner opera en todas sus sedes", () => {
    const href = monthlyInvoicesHref("10000000-0000-4000-8000-000000000001");
    const url = new URL(href, "https://synthetic.invalid");

    expect(Object.fromEntries(url.searchParams)).toEqual({
      organizationId: "10000000-0000-4000-8000-000000000001",
    });
  });
});
