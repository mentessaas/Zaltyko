// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerClassCoaches } from "@/components/owner-dashboard/OwnerClassCoaches";
import { OwnerSessionCoaches } from "@/components/owner-dashboard/OwnerSessionCoaches";
import { OwnerTodaySessionsPanel } from "@/components/owner-dashboard/OwnerTodaySessionsPanel";
import type { OwnerTodaySession } from "@/modules/owner-dashboard/application/today-sessions";

const ORG = "00000000-0000-4000-8000-000000000001";
const SITE = "00000000-0000-4000-8000-000000000002";
const CLASS = "00000000-0000-4000-8000-000000000003";
const SESSION = "00000000-0000-4000-8000-000000000004";
const ANA = "00000000-0000-4000-8000-00000000000a";
const BEA = "00000000-0000-4000-8000-00000000000b";

const ana = { staffProfileId: ANA, name: "Ana Ruiz" };
const bea = { staffProfileId: BEA, name: "Bea Gil" };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function sessionView(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION,
    classTemplateId: CLASS,
    locationId: SITE,
    coaches: [ana],
    titulars: [ana],
    substitution: null,
    eligible: [ana, bea],
    canWrite: true,
    assignedToViewer: false,
    ...overrides,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: () => "00000000-0000-4000-8000-0000000000ff" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("titulares en la ficha de clase", () => {
  it("muestra los titulares y guarda la nueva lista con la lista esperada", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: { classTemplateId: CLASS, locationId: SITE, titulars: [ana], eligible: [ana, bea], canWrite: true } }))
      .mockResolvedValueOnce(
        json(200, {
          data: { classTemplateId: CLASS, locationId: SITE, titulars: [ana, bea], eligible: [ana, bea], canWrite: true, updatedSessionCount: 8, replayed: false },
        })
      );
    render(
      <OwnerClassCoaches
        organizationId={ORG}
        locationId={SITE}
        classTemplateId={CLASS}
        className="Base 3 GAF"
        initialTitulars={[ana]}
        writesBlocked={false}
      />
    );
    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar titulares de Base 3 GAF" }));
    const group = await screen.findByRole("group", { name: "Titulares de Base 3 GAF" });
    fireEvent.click(within(group).getByLabelText("Bea Gil"));
    fireEvent.click(within(group).getByRole("button", { name: "Guardar titulares" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Se actualizaron 8 sesiones futuras");
    expect(screen.getByText("Ana Ruiz y Bea Gil")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`/api/v1/owner/classes/${CLASS}/coaches`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      organizationId: ORG,
      locationId: SITE,
      clientRequestId: "00000000-0000-4000-8000-0000000000ff",
      staffProfileIds: [ANA, BEA].sort(),
      expectedStaffProfileIds: [ANA],
    });
  });

  it("en solo lectura se consulta, pero el botón está desactivado", () => {
    render(
      <OwnerClassCoaches
        organizationId={ORG}
        locationId={SITE}
        classTemplateId={CLASS}
        className="Base 3 GAF"
        initialTitulars={[]}
        writesBlocked
      />
    );
    expect(screen.getByText("sin titular asignado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asignar titulares de Base 3 GAF" })).toBeDisabled();
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explica que nadie del equipo tiene acceso a la sede", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: { classTemplateId: CLASS, locationId: SITE, titulars: [], eligible: [], canWrite: true } }));
    render(
      <OwnerClassCoaches organizationId={ORG} locationId={SITE} classTemplateId={CLASS} className="Base" initialTitulars={[]} writesBlocked={false} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Asignar titulares de Base" }));
    expect(await screen.findByText(/Nadie del equipo con rol Entrenador\/a tiene acceso a esta sede/)).toBeInTheDocument();
  });

  it("sin el candidato aplicado (503) dice que no está disponible", async () => {
    fetchMock.mockResolvedValueOnce(
      json(503, { detail: "No activada", errors: { reason: "coach_assignment_storage_unavailable" } })
    );
    render(
      <OwnerClassCoaches organizationId={ORG} locationId={SITE} classTemplateId={CLASS} className="Base" initialTitulars={[]} writesBlocked={false} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Asignar titulares de Base" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("todavía no está disponible");
  });

  it("muestra el conflicto si otra persona cambió la lista", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: { classTemplateId: CLASS, locationId: SITE, titulars: [], eligible: [ana], canWrite: true } }))
      .mockResolvedValueOnce(json(409, { detail: "Otra persona cambió las entrenadoras mientras editabas." }));
    render(
      <OwnerClassCoaches organizationId={ORG} locationId={SITE} classTemplateId={CLASS} className="Base" initialTitulars={[]} writesBlocked={false} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Asignar titulares de Base" }));
    fireEvent.click(await screen.findByLabelText("Ana Ruiz"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar titulares" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Otra persona cambió");
  });
});

describe("quién entrena en Pasar lista", () => {
  it("la dirección cambia la sesión con un motivo, sin tocar la clase", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: sessionView() }))
      .mockResolvedValueOnce(
        json(200, {
          data: sessionView({
            coaches: [bea],
            substitution: { reason: "absence", changedAt: "2026-11-11T09:00:00.000Z", changedByName: "Dirección de la academia" },
            replayed: false,
          }),
        })
      );
    render(<OwnerSessionCoaches organizationId={ORG} locationId={SITE} sessionId={SESSION} coachMode={false} writesBlocked={false} />);
    expect(await screen.findByText("Ana Ruiz")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar en esta sesión" }));
    const group = screen.getByRole("group", { name: "Quién entrena en esta sesión" });
    fireEvent.click(within(group).getByLabelText("Ana Ruiz"));
    fireEvent.click(within(group).getByLabelText("Bea Gil"));
    fireEvent.change(within(group).getByLabelText("Motivo (opcional)"), { target: { value: "absence" } });
    fireEvent.click(within(group).getByRole("button", { name: "Guardar para esta sesión" }));

    expect(await screen.findByRole("status")).toHaveTextContent("La clase mantiene sus titulares");
    expect(screen.getByText("Sustitución")).toBeInTheDocument();
    expect(screen.getByText(/Motivo: Ausencia/)).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      staffProfileIds: [BEA],
      expectedStaffProfileIds: [ANA],
      reason: "absence",
    });
  });

  it("la entrenadora ve quién entrena y si es suya, sin botones para cambiarlo", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        data: sessionView({
          coaches: [bea],
          substitution: { reason: null, changedAt: "2026-11-11T09:00:00.000Z", changedByName: "Coordinador/a" },
          eligible: null,
          canWrite: false,
          assignedToViewer: true,
        }),
      })
    );
    render(<OwnerSessionCoaches organizationId={ORG} locationId={SITE} sessionId={SESSION} coachMode writesBlocked={false} />);
    expect(await screen.findByText("Bea Gil")).toBeInTheDocument();
    expect(screen.getByText("Tienes esta sesión asignada.")).toBeInTheDocument();
    expect(screen.getByText("Sustitución")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar en esta sesión" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar la sustitución" })).not.toBeInTheDocument();
  });

  it("en solo lectura la dirección consulta pero no cambia", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: sessionView() }));
    render(<OwnerSessionCoaches organizationId={ORG} locationId={SITE} sessionId={SESSION} coachMode={false} writesBlocked />);
    expect(await screen.findByRole("button", { name: "Cambiar en esta sesión" })).toBeDisabled();
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
  });

  it("sin el candidato aplicado no rompe Pasar lista", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { errors: { reason: "coach_assignment_storage_unavailable" } }));
    render(<OwnerSessionCoaches organizationId={ORG} locationId={SITE} sessionId={SESSION} coachMode={false} writesBlocked={false} />);
    expect(await screen.findByText(/todavía no está disponible/)).toBeInTheDocument();
  });
});

describe("Hoy con titulares", () => {
  function session(id: string, className: string, overrides: Partial<OwnerTodaySession> = {}): OwnerTodaySession {
    return {
      id,
      status: "scheduled",
      startsAt: "2026-11-11T16:00:00Z",
      endsAt: "2026-11-11T17:30:00Z",
      timezone: "Europe/Madrid",
      locationId: SITE,
      locationName: "Norte",
      className,
      programName: null,
      capacity: 12,
      expectedAthletes: 8,
      recordedAttendance: 0,
      ...overrides,
    };
  }

  it("la entrenadora ve primero sus sesiones y después el resto de la sede, sin perder ninguna", () => {
    render(
      <OwnerTodaySessionsPanel
        organizationId={ORG}
        classesHref={null}
        now={new Date("2026-11-11T10:00:00Z")}
        prioritizeViewerSessions
        today={{
          truncated: false,
          sessions: [
            session("s1", "Iniciación", { coachNames: ["Ana Ruiz"], assignedToViewer: false }),
            session("s2", "Base 3 GAF", { coachNames: ["Bea Gil"], assignedToViewer: true, substitution: true }),
          ],
        }}
      />
    );
    const mine = screen.getByRole("list", { name: "Tus sesiones" });
    const rest = screen.getByRole("list", { name: "Resto de la sede" });
    expect(within(mine).getByText("Base 3 GAF")).toBeInTheDocument();
    expect(within(mine).getByText("Sustitución")).toBeInTheDocument();
    expect(within(rest).getByText("Iniciación")).toBeInTheDocument();
    expect(within(rest).getByText("Entrena: Ana Ruiz")).toBeInTheDocument();
  });

  it("sin datos de titulares Hoy se pinta como antes", () => {
    render(
      <OwnerTodaySessionsPanel
        organizationId={ORG}
        classesHref={null}
        now={new Date("2026-11-11T10:00:00Z")}
        prioritizeViewerSessions
        today={{ truncated: false, sessions: [session("s1", "Iniciación")] }}
      />
    );
    expect(screen.queryByRole("list", { name: "Tus sesiones" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Entrena:/)).not.toBeInTheDocument();
    expect(screen.getByText("Iniciación")).toBeInTheDocument();
  });

  it("muestra «Nadie asignado» cuando hay datos pero la sesión no tiene a nadie", async () => {
    render(
      <OwnerTodaySessionsPanel
        organizationId={ORG}
        classesHref="/owner/classes"
        now={new Date("2026-11-11T10:00:00Z")}
        today={{ truncated: false, sessions: [session("s1", "Iniciación", { coachNames: [], assignedToViewer: false })] }}
      />
    );
    await waitFor(() => expect(screen.getByText("Nadie asignado")).toBeInTheDocument());
  });
});
