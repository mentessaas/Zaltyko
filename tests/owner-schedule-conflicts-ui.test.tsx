// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerClassCoaches } from "@/components/owner-dashboard/OwnerClassCoaches";
import { OwnerScheduleConflictList, OwnerUpcomingConflicts } from "@/components/owner-dashboard/OwnerScheduleConflicts";
import { OwnerSessionCoaches } from "@/components/owner-dashboard/OwnerSessionCoaches";
import type { ScheduleConflict } from "@/modules/schedule-conflicts/domain/schedule-conflicts";

const ORG = "00000000-0000-4000-8000-000000000001";
const SITE = "00000000-0000-4000-8000-000000000002";
const CLASS = "00000000-0000-4000-8000-000000000003";
const SESSION = "00000000-0000-4000-8000-000000000004";
const ANA = "00000000-0000-4000-8000-00000000000a";
const ana = { staffProfileId: ANA, name: "Ana Ruiz" };

const conflict: ScheduleConflict = {
  kind: "coach_overlap",
  subjectId: ANA,
  subjectName: "Ana Ruiz",
  first: {
    sessionId: "s1",
    classTemplateId: CLASS,
    className: "Base 3 GAF",
    locationId: SITE,
    locationName: "Sede Norte",
    timezone: "Europe/Madrid",
    startsAt: "2026-11-16T16:30:00Z",
    endsAt: "2026-11-16T18:00:00Z",
    status: "scheduled",
  },
  second: {
    sessionId: "s2",
    classTemplateId: "c2",
    className: "Iniciación",
    locationId: SITE,
    locationName: "Sede Norte",
    timezone: "Europe/Madrid",
    startsAt: "2026-11-16T17:00:00Z",
    endsAt: "2026-11-16T18:30:00Z",
    status: "scheduled",
  },
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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

describe("lista de avisos de choque", () => {
  it("dice quién, qué sesiones y cuándo, con su tipo", () => {
    render(<OwnerScheduleConflictList conflicts={[conflict]} variant="upcoming" />);
    const list = screen.getByRole("region", { name: "Choques próximos" });
    expect(within(list).getByText("Doble asignación")).toBeInTheDocument();
    const item = within(list).getByRole("listitem");
    expect(item).toHaveTextContent("Ana Ruiz está en dos sesiones a la vez");
    expect(item).toHaveTextContent("«Base 3 GAF»");
    expect(item).toHaveTextContent("17:30–19:00, Sede Norte");
    expect(item).toHaveTextContent("«Iniciación»");
  });

  it("sin choques no pinta nada", () => {
    const { container } = render(<OwnerUpcomingConflicts upcoming={{ conflicts: [], truncated: false }} coachMode={false} />);
    expect(container).toBeEmptyDOMElement();
    const { container: unavailable } = render(<OwnerUpcomingConflicts upcoming={null} coachMode />);
    expect(unavailable).toBeEmptyDOMElement();
  });

  it("la entrenadora ve «Tus choques próximos» y avisa si hay más", () => {
    render(<OwnerUpcomingConflicts upcoming={{ conflicts: [conflict], truncated: true }} coachMode />);
    expect(screen.getByRole("region", { name: "Tus choques próximos" })).toBeInTheDocument();
    expect(screen.getByText("Hay más choques; mostramos los primeros.")).toBeInTheDocument();
  });
});

describe("avisos al guardar (no bloquean)", () => {
  it("titulares: se guardan y se avisa del choque", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: { classTemplateId: CLASS, locationId: SITE, titulars: [], eligible: [ana], canWrite: true } }))
      .mockResolvedValueOnce(
        json(200, {
          data: {
            classTemplateId: CLASS,
            locationId: SITE,
            titulars: [ana],
            eligible: [ana],
            canWrite: true,
            updatedSessionCount: 3,
            clearedSubstitutionCount: 0,
            replayed: false,
            warnings: [conflict],
          },
        })
      );
    render(<OwnerClassCoaches organizationId={ORG} locationId={SITE} classTemplateId={CLASS} className="Base" initialTitulars={[]} writesBlocked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Asignar titulares de Base" }));
    fireEvent.click(await screen.findByLabelText("Ana Ruiz"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar titulares" }));
    const warning = await screen.findByRole("region", { name: "Guardado con aviso de choque" });
    expect(warning).toHaveTextContent("El cambio se ha guardado");
    expect(warning).toHaveTextContent("Ana Ruiz está en dos sesiones a la vez");
    expect(screen.getByRole("status")).toHaveTextContent("Titulares guardados");
  });

  it("sustitución: se guarda y se avisa; sin choques no aparece el aviso", async () => {
    const view = {
      sessionId: SESSION,
      classTemplateId: CLASS,
      locationId: SITE,
      coaches: [],
      titulars: [],
      substitution: null,
      eligible: [ana],
      canWrite: true,
      assignedToViewer: false,
    };
    fetchMock
      .mockResolvedValueOnce(json(200, { data: view }))
      .mockResolvedValueOnce(
        json(200, {
          data: {
            ...view,
            coaches: [ana],
            substitution: { reason: null, changedAt: "2026-11-11T09:00:00.000Z", changedByName: "Dirección de la academia" },
            replayed: false,
            warnings: [conflict],
          },
        })
      );
    render(<OwnerSessionCoaches organizationId={ORG} locationId={SITE} sessionId={SESSION} coachMode={false} writesBlocked={false} />);
    expect(screen.queryByRole("region", { name: "Guardado con aviso de choque" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar en esta sesión" }));
    fireEvent.click(screen.getByLabelText("Ana Ruiz"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar para esta sesión" }));
    expect(await screen.findByRole("region", { name: "Guardado con aviso de choque" })).toHaveTextContent("Ana Ruiz");
    expect(screen.getByRole("status")).toHaveTextContent("Sustitución guardada");
  });
});
