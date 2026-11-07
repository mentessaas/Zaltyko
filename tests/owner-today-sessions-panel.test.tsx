// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerTodaySessionsPanel } from "@/components/owner-dashboard/OwnerTodaySessionsPanel";
import type { OwnerTodaySession } from "@/modules/owner-dashboard/application/today-sessions";

afterEach(cleanup);

const organizationId = "00000000-0000-4000-8000-000000000001";
const madrid = "00000000-0000-4000-8000-000000000002";
const cdmx = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-11-10T16:45:00Z");

function session(overrides: Partial<OwnerTodaySession>): OwnerTodaySession {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    status: "scheduled",
    startsAt: "2026-11-10T15:00:00Z",
    endsAt: "2026-11-10T16:30:00Z",
    timezone: "Europe/Madrid",
    locationId: madrid,
    locationName: "Sede Centro",
    className: "Artística base",
    programName: "Gimnasia artística",
    capacity: 16,
    expectedAthletes: 15,
    recordedAttendance: 0,
    ...overrides,
  };
}

function renderPanel(sessions: OwnerTodaySession[] | null, truncated = false) {
  render(
    <OwnerTodaySessionsPanel
      organizationId={organizationId}
      classesHref={`/owner/classes?organizationId=${organizationId}`}
      today={sessions === null ? null : { sessions, truncated }}
      now={now}
    />
  );
  return screen.getByRole("region", { name: "Hoy en el club" });
}

describe("OwnerTodaySessionsPanel", () => {
  it("muestra cada sesión con hora local de su sede, estado y acceso a la sesión exacta", () => {
    const region = renderPanel([
      session({ id: "00000000-0000-4000-8000-0000000000a1", recordedAttendance: 14 }),
      session({
        id: "00000000-0000-4000-8000-0000000000a2",
        className: "Rítmica iniciación",
        programName: "Gimnasia rítmica",
        startsAt: "2026-11-10T16:30:00Z",
        endsAt: "2026-11-10T18:00:00Z",
        expectedAthletes: 9,
        capacity: 12,
      }),
      session({
        id: "00000000-0000-4000-8000-0000000000a3",
        className: "Competición GAF",
        status: "cancelled",
        startsAt: "2026-11-10T17:00:00Z",
        endsAt: "2026-11-10T19:00:00Z",
      }),
      session({
        id: "00000000-0000-4000-8000-0000000000a4",
        className: "Preparación física",
        programName: null,
        timezone: "America/Mexico_City",
        locationId: cdmx,
        locationName: "Sede Polanco",
        startsAt: "2026-11-10T23:00:00Z",
        endsAt: "2026-11-11T00:00:00Z",
      }),
    ]);

    expect(within(region).getByText("4 sesiones · 1 lista pendiente")).toBeInTheDocument();

    const done = within(region).getByRole("link", { name: "14/15, lista pasada en Artística base. Revisar" });
    expect(done).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}&locationId=${madrid}&sessionId=00000000-0000-4000-8000-0000000000a1`
    );

    const live = within(region).getByRole("link", { name: "Pasar lista en Rítmica iniciación" });
    expect(live.closest("li")).toHaveTextContent("Ahora");
    expect(live.closest("li")).toHaveTextContent("17:30");
    expect(live.closest("li")).toHaveTextContent("9 de 12 plazas");

    const cancelled = within(region).getByText("Competición GAF").closest("li") as HTMLElement;
    expect(within(cancelled).getByText("Cancelada")).toBeInTheDocument();
    expect(within(cancelled).queryByRole("link")).toBeNull();

    const mexico = within(region).getByRole("link", { name: "Pasar lista en Preparación física" });
    expect(mexico).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}&locationId=${cdmx}&sessionId=00000000-0000-4000-8000-0000000000a4`
    );
    expect(mexico.closest("li")).toHaveTextContent("17:00");
    expect(mexico.closest("li")).toHaveTextContent("Actividad sin clasificar · Sede Polanco");
    expect(mexico.closest("li")).not.toHaveTextContent("Ahora");
  });

  it("no muestra la sede cuando todas las sesiones son de la misma", () => {
    const region = renderPanel([session({})]);
    expect(within(region).queryByText(/Sede Centro/)).toBeNull();
  });

  it("invita a revisar clases cuando hoy no hay sesiones", () => {
    const region = renderPanel([]);
    expect(within(region).getByText("Hoy no hay sesiones programadas en tus sedes.")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Ver clases" })).toHaveAttribute(
      "href",
      `/owner/classes?organizationId=${organizationId}`
    );
  });

  it("distingue una consulta fallida de un día sin sesiones", () => {
    const region = renderPanel(null);
    expect(within(region).getByRole("status")).toHaveTextContent("No significa que no haya ninguna");
    expect(within(region).queryByText("Hoy no hay sesiones programadas en tus sedes.")).toBeNull();
  });

  it("avisa cuando la lista del día está recortada", () => {
    const region = renderPanel([session({})], true);
    expect(within(region).getByText(/Consulta el resto en Asistencia/)).toBeInTheDocument();
  });
});
