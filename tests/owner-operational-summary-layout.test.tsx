// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerDashboardView } from "@/components/owner-dashboard/OwnerDashboardView";
import type { OwnerDashboardBundle } from "@/modules/owner-dashboard/application/get-owner-dashboard";
import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";

afterEach(cleanup);

const bundle: OwnerDashboardBundle = {
  state: "empty",
  organization: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Academia sintética",
  },
  scope: {
    locationId: null,
    locations: [],
    canViewOrganizationAggregate: true,
    canManageHealthScore: true,
  },
  period: null,
  availablePeriods: [],
  score: null,
  scoreComparison: null,
  dimensions: [],
  metrics: [],
  priorities: [],
  scoreTrend: [],
  freshness: {
    status: "current",
    pendingEventCount: 0,
    processingEventCount: 0,
    failedEventCount: 0,
    oldestUnsettledAt: null,
    oldestUnsettledAgeSeconds: null,
    slaSeconds: 900,
  },
};

const summary: OwnerOperationalSummary = {
  scope: {
    organizationId: "00000000-0000-4000-8000-000000000001",
    kind: "organization",
    label: "Academia sintética",
    locationId: null,
    locationIds: [],
    timezone: "Europe/Madrid",
    timezoneMode: "per_location",
  },
  period: {
    from: "2026-10-01",
    to: "2026-10-14",
    timezone: "Europe/Madrid",
    defaulted: true,
  },
  metrics: {
    activeAthletes: 1,
    activeGroups: 1,
    attendanceRecords: 0,
    paymentsReceived: {
      state: "unavailable",
      reason: "financial_access_required",
    },
  },
};

function headingSequence() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("main h1, main h2"),
    (heading) => ({ level: heading.tagName, text: heading.textContent?.trim() })
  );
}

describe("owner dashboard operational summary layout", () => {
  it("preserves the historical empty view when no summary prop is provided", () => {
    render(<OwnerDashboardView bundle={bundle} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Tu panel todavía está esperando datos",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Tu academia en marcha" })
    ).toBeNull();
  });

  it("puts one page title before the summary and the Health Score heading", () => {
    render(<OwnerDashboardView bundle={bundle} operationalSummary={summary} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(headingSequence()).toEqual([
      { level: "H1", text: "Tu academia" },
      { level: "H2", text: "Tu academia en marcha" },
      {
        level: "H2",
        text: "Tu Health Score todavía está esperando métricas",
      },
    ]);
  });

  it("keeps the same heading order when the operational summary is unavailable", () => {
    render(<OwnerDashboardView bundle={bundle} operationalSummary={null} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(headingSequence()).toEqual([
      { level: "H1", text: "Tu academia" },
      { level: "H2", text: "Resumen operativo no disponible" },
      {
        level: "H2",
        text: "Tu Health Score todavía está esperando métricas",
      },
    ]);
    expect(
      screen.getByText(/No significa que no haya datos/)
    ).toBeInTheDocument();
  });
});
