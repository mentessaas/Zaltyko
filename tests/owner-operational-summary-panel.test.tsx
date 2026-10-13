// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerOperationalSummaryPanel } from "@/components/owner-dashboard/OwnerOperationalSummaryPanel";
import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";

afterEach(cleanup);
const summary: OwnerOperationalSummary = {
  scope: {
    organizationId: "synthetic",
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
    activeGroups: 2,
    attendanceRecords: 3,
    paymentsReceived: {
      state: "available",
      count: 2,
      grossByCurrency: [
        { currency: "EUR", amountCents: 5000 },
        { currency: "USD", amountCents: 6000 },
      ],
      label: "Bruto recibido sin netear devoluciones",
    },
  },
};
describe("Owner operational summary panel", () => {
  it("distinguishes current activity, period records and currencies", () => {
    render(<OwnerOperationalSummaryPanel summary={summary} />);
    expect(screen.getByText("Gimnastas activos hoy")).toBeTruthy();
    expect(screen.getByText(/Todos los programas y grupos/)).toBeTruthy();
    expect(screen.getByText(/2026-10-01 a 2026-10-14/)).toBeTruthy();
    expect(screen.getByText(/no es beneficio ni saldo/)).toBeTruthy();
    expect(screen.getByText(/50,00/)).toBeTruthy();
    expect(screen.getByText(/60,00/)).toBeTruthy();
  });
  it("never renders financial zero when permission is missing", () => {
    render(
      <OwnerOperationalSummaryPanel
        summary={{
          ...summary,
          metrics: {
            ...summary.metrics,
            paymentsReceived: {
              state: "unavailable",
              reason: "financial_access_required",
            },
          },
        }}
      />
    );
    expect(screen.getByText("Necesitas permiso financiero")).toBeTruthy();
    expect(screen.queryByText(/50,00/)).toBeNull();
  });
  it("shows unavailable rather than an empty academy after query failure", () => {
    render(<OwnerOperationalSummaryPanel summary={null} />);
    expect(screen.getByText(/No significa que no haya datos/)).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
