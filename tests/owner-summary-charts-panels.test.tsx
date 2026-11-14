// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// La carga diferida se sustituye por marcadores: aquí se comprueba qué panel
// monta la gráfica y cuál pinta el estado vacío. Las gráficas se prueban
// directamente más abajo.
vi.mock("@/components/owner-dashboard/charts/owner-charts-lazy", () => ({
  LazyAttendanceWeeksChart: () => <div data-testid="lazy-attendance" />,
  LazyClassOccupancyChart: () => <div data-testid="lazy-occupancy" />,
  LazyMonthlyFeesChart: () => <div data-testid="lazy-fees" />,
  LazyAthleteSignupsChart: () => <div data-testid="lazy-signups" />,
}));

import { OwnerSummaryCharts } from "@/components/owner-dashboard/charts/OwnerChartPanels";
import { AttendanceWeeksChart } from "@/components/owner-dashboard/charts/AttendanceWeeksChart";
import { ClassOccupancyChart } from "@/components/owner-dashboard/charts/ClassOccupancyChart";
import { MonthlyFeesChart } from "@/components/owner-dashboard/charts/MonthlyFeesChart";
import { AthleteSignupsChart } from "@/components/owner-dashboard/charts/AthleteSignupsChart";
import { OwnerListSkeleton, OwnerSuccessNotice } from "@/components/owner-dashboard/OwnerFeedback";
import type { OwnerSummaryCharts as OwnerSummaryChartsData } from "@/modules/owner-dashboard/application/summary-charts";
import {
  buildAthleteSignups,
  buildAttendanceWeeks,
  buildClassOccupancy,
  buildMonthlyFees,
} from "@/modules/owner-dashboard/domain/summary-charts-model";

const TODAY = "2026-11-14";

const links = {
  attendance: "/owner/attendance?organizationId=org",
  classes: "/owner/classes?organizationId=org",
  enrollments: "/owner/enrollments?organizationId=org",
  "monthly-invoices": "/owner/monthly-invoices?organizationId=org",
  athletes: "/owner/athletes?organizationId=org",
};

function emptyCharts(overrides: Partial<OwnerSummaryChartsData> = {}): OwnerSummaryChartsData {
  return {
    today: TODAY,
    timezone: "Europe/Madrid",
    attendance: buildAttendanceWeeks([], TODAY),
    occupancy: buildClassOccupancy([]),
    fees: buildMonthlyFees([], TODAY),
    signups: buildAthleteSignups([], TODAY),
    ...overrides,
  };
}

afterEach(cleanup);

describe("Cómo va la academia: paneles del Resumen", () => {
  it("sin datos explica qué aparecerá y ofrece una sola acción por panel, sin montar gráficas", () => {
    render(<OwnerSummaryCharts charts={emptyCharts()} links={links} canManageAthletes />);

    expect(screen.getByRole("heading", { level: 2, name: "Cómo va la academia" })).toBeInTheDocument();
    expect(screen.queryByTestId(/^lazy-/)).not.toBeInTheDocument();

    const attendance = screen.getByRole("region", { name: "Asistencia por semana" });
    expect(within(attendance).getByText("Aún no hay listas pasadas")).toBeInTheDocument();
    expect(within(attendance).getByRole("link", { name: "Pasar lista" })).toHaveAttribute("href", links.attendance);

    const occupancy = screen.getByRole("region", { name: "Ocupación por clase" });
    expect(within(occupancy).getByRole("link", { name: "Crear una clase" })).toHaveAttribute("href", links.classes);

    const fees = screen.getByRole("region", { name: "Cuotas de noviembre" });
    expect(within(fees).getByText("Sin cuotas de noviembre")).toBeInTheDocument();
    expect(within(fees).getByRole("link", { name: "Emitir cuotas del mes" })).toHaveAttribute(
      "href",
      links["monthly-invoices"]
    );

    const signups = screen.getByRole("region", { name: "Altas de gimnastas" });
    expect(within(signups).getByRole("link", { name: "Añadir gimnasta" })).toHaveAttribute("href", links.athletes);
  });

  it("con clases pero sin inscritas pide inscribir, no crear otra clase", () => {
    render(
      <OwnerSummaryCharts
        charts={emptyCharts({ occupancy: buildClassOccupancy([
          { classTemplateId: "a", className: "Base", locationName: "Centro", capacity: 8, enrolled: 0 },
        ]) })}
        links={links}
        canManageAthletes
      />
    );
    const occupancy = screen.getByRole("region", { name: "Ocupación por clase" });
    expect(within(occupancy).getByText("Tus clases aún no tienen inscritas")).toBeInTheDocument();
    expect(within(occupancy).getByRole("link", { name: "Inscribir gimnastas" })).toHaveAttribute(
      "href",
      links.enrollments
    );
  });

  it("con datos monta cada gráfica en carga diferida", () => {
    render(
      <OwnerSummaryCharts
        charts={emptyCharts({
          attendance: buildAttendanceWeeks([{ weekStart: "2026-11-09", present: 3, late: 0, excused: 0, absent: 1, sessions: 1 }], TODAY),
          occupancy: buildClassOccupancy([{ classTemplateId: "a", className: "Base", locationName: "Centro", capacity: 8, enrolled: 5 }]),
          fees: buildMonthlyFees([{ currency: "EUR", charges: 1, billedCents: 4000, collectedCents: 4000, pendingCents: 0, overdueCents: 0 }], TODAY),
          signups: buildAthleteSignups([{ month: "2026-11-01", created: 2 }], TODAY),
        })}
        links={links}
        canManageAthletes
      />
    );
    for (const id of ["lazy-attendance", "lazy-occupancy", "lazy-fees", "lazy-signups"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("sin acceso a finanzas no enseña las cuotas y sin permiso de fichas no ofrece añadirlas", () => {
    render(
      <OwnerSummaryCharts
        charts={emptyCharts({ fees: buildMonthlyFees(null, TODAY) })}
        links={{ attendance: links.attendance, classes: links.classes, enrollments: links.enrollments }}
        canManageAthletes={false}
      />
    );
    expect(screen.queryByRole("region", { name: /Cuotas de/ })).not.toBeInTheDocument();
    const signups = screen.getByRole("region", { name: "Altas de gimnastas" });
    expect(within(signups).queryByRole("link")).not.toBeInTheDocument();
  });

  it("si la consulta falla avisa sin decir que no hay datos", () => {
    render(<OwnerSummaryCharts charts={null} links={links} canManageAthletes />);
    expect(screen.getByRole("status")).toHaveTextContent("No pudimos cargar las gráficas");
    expect(screen.getByRole("status")).toHaveTextContent("No significa que no haya datos");
  });
});

describe("gráficas (sin movimiento en el entorno de pruebas)", () => {
  it("asistencia: una columna por semana con su detalle accesible y el porcentaje final", () => {
    const chart = buildAttendanceWeeks(
      [
        { weekStart: "2026-09-28", present: 6, late: 0, excused: 1, absent: 3, sessions: 2 },
        { weekStart: "2026-11-09", present: 7, late: 1, excused: 0, absent: 2, sessions: 3 },
      ],
      TODAY
    );
    render(<AttendanceWeeksChart chart={chart} />);
    const list = screen.getByRole("list", { name: "Asistencia por semana" });
    const weeks = within(list).getAllByRole("listitem");
    expect(weeks).toHaveLength(8);
    expect(weeks[7]).toHaveAttribute(
      "aria-label",
      "Semana del 9 nov: 8 presencias, 2 ausencias, 80 % de asistencia."
    );
    expect(weeks[3]).toHaveAttribute("aria-label", "Semana del 12 oct: sin lista pasada.");
    expect(weeks[7]).toHaveAttribute("tabindex", "0");
    // Cifra visible y su copia para el lector de pantalla.
    expect(screen.getAllByText("70 %")).toHaveLength(2);
    expect(screen.getByText(/\+20 puntos frente a las cuatro semanas anteriores/)).toBeInTheDocument();
  });

  it("ocupación: cada clase es un medidor con su cifra real", () => {
    const chart = buildClassOccupancy([
      { classTemplateId: "a", className: "Avanzada", locationName: "Centro", capacity: 6, enrolled: 6 },
      { classTemplateId: "b", className: "Iniciación", locationName: "Centro", capacity: 10, enrolled: 12 },
      { classTemplateId: "c", className: "Base", locationName: "Centro", capacity: 8, enrolled: 3 },
    ]);
    render(<ClassOccupancyChart chart={chart} />);
    const meters = screen.getAllByRole("meter");
    expect(meters.map((meter) => meter.getAttribute("aria-label"))).toEqual([
      "Ocupación de Iniciación",
      "Ocupación de Avanzada",
      "Ocupación de Base",
    ]);
    expect(meters[0]).toHaveAttribute("aria-valuenow", "10");
    expect(meters[0]).toHaveAttribute("aria-valuetext", "12 de 10 plazas. 2 por encima de las plazas.");
    expect(screen.getByText("Completa")).toBeInTheDocument();
    expect(screen.getByText("5 plazas libres")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 de 3 clases completas" })).toBeInTheDocument();
  });

  it("cuotas: importes por estado y enlace para registrar un pago si queda algo por cobrar", () => {
    const chart = buildMonthlyFees(
      [{ currency: "EUR", charges: 4, billedCents: 20000, collectedCents: 12000, pendingCents: 5000, overdueCents: 3000 }],
      TODAY
    );
    render(<MonthlyFeesChart chart={chart} registerPaymentHref="/owner/payments?organizationId=org" />);
    const amounts = screen.getAllByRole("definition").map((node) => node.textContent?.replace(/\s/g, " "));
    expect(amounts).toEqual(["120,00 €", "50,00 €", "30,00 €"]);
    expect(screen.getByRole("img", { name: /cobrado 120,00\s€, por vencer 50,00\s€, vencido sin cobrar 30,00\s€/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrar un pago" })).toHaveAttribute(
      "href",
      "/owner/payments?organizationId=org"
    );
    expect(screen.getByText(/4 cuotas con periodo en noviembre/)).toBeInTheDocument();
  });

  it("cuotas cobradas del todo no ofrecen registrar otro pago", () => {
    const chart = buildMonthlyFees(
      [{ currency: "EUR", charges: 1, billedCents: 4000, collectedCents: 4000, pendingCents: 0, overdueCents: 0 }],
      TODAY
    );
    render(<MonthlyFeesChart chart={chart} registerPaymentHref="/owner/payments?organizationId=org" />);
    expect(screen.queryByRole("link", { name: "Registrar un pago" })).not.toBeInTheDocument();
  });

  it("altas: una columna por mes con el mes en curso señalado", () => {
    const chart = buildAthleteSignups(
      [
        { month: "2026-09-01", created: 1 },
        { month: "2026-11-01", created: 3 },
      ],
      TODAY
    );
    render(<AthleteSignupsChart chart={chart} />);
    const months = within(screen.getByRole("list", { name: "Altas de gimnastas por mes" })).getAllByRole("listitem");
    expect(months).toHaveLength(6);
    expect(months[5]).toHaveAttribute("aria-label", "noviembre de 2026: 3 fichas nuevas (mes en curso).");
    expect(months[3]).toHaveAttribute("aria-label", "septiembre de 2026: 1 ficha nueva.");
  });
});

describe("respuestas del panel", () => {
  it("la confirmación es un estado anunciado con su texto", () => {
    render(<OwnerSuccessNotice>Pago guardado y asignado al cargo.</OwnerSuccessNotice>);
    expect(screen.getByRole("status")).toHaveTextContent("Pago guardado y asignado al cargo.");
  });

  it("el esqueleto conserva el texto de carga para el lector de pantalla", () => {
    render(<OwnerListSkeleton label="Cargando lista…" rows={2} />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando lista…");
  });
});
