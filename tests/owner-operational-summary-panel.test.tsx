// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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
  it("groups current activity, period records and money into named sections", () => {
    render(<OwnerOperationalSummaryPanel summary={summary} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Tu academia en marcha" })
    ).toBeTruthy();
    const current = screen.getByRole("region", { name: "Ahora" });
    const period = screen.getByRole("region", { name: "En este periodo" });
    const payments = screen.getByRole("region", {
      name: "Cobros recibidos en este periodo",
    });
    expect(within(current).getByText("Gimnastas activos hoy")).toBeTruthy();
    expect(within(current).getByText("Grupos activos hoy")).toBeTruthy();
    expect(within(period).getByText("Registros de asistencia")).toBeTruthy();
    expect(within(payments).getByText("Cobros")).toBeTruthy();
    expect(within(payments).getByText("Total bruto en EUR")).toBeTruthy();
    expect(within(payments).getByText("Total bruto en USD")).toBeTruthy();
    expect(screen.getByText("Gimnastas activos hoy")).toBeTruthy();
    expect(screen.getByText(/Todos los programas y grupos/)).toBeTruthy();
    expect(screen.getByText(/1 oct 2026\s*–\s*14 oct 2026/i)).toBeTruthy();
    expect(screen.getByText(/no es beneficio ni saldo/)).toBeTruthy();
    expect(within(payments).getByText(/50,00/)).toBeTruthy();
    expect(within(payments).getByText(/60,00/)).toBeTruthy();
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
    expect(
      screen.getByText("Tu rol no permite ver los cobros de este periodo.")
    ).toBeTruthy();
    expect(screen.queryByText(/50,00/)).toBeNull();
    expect(screen.queryByText(/Total bruto en/)).toBeNull();
  });
  it("shows unavailable rather than an empty academy after query failure", () => {
    render(<OwnerOperationalSummaryPanel summary={null} />);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Resumen operativo no disponible",
      })
    ).toBeTruthy();
    expect(screen.getByText(/No significa que no haya datos/)).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
