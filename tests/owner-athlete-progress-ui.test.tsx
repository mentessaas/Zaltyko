// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerAthleteProgressPanel } from "@/components/owner-dashboard/OwnerAthleteProgressPanel";
import { OwnerSessionObservationForm } from "@/components/owner-dashboard/OwnerSessionObservationForm";

const ORG = "00000000-0000-4000-8000-000000000001";
const SITE = "00000000-0000-4000-8000-000000000002";
const ATHLETE = "00000000-0000-4000-8000-000000000003";
const OBJECTIVE = "00000000-0000-4000-8000-000000000004";
const OBSERVATION = "00000000-0000-4000-8000-000000000005";
const SESSION = "00000000-0000-4000-8000-000000000006";
const ENROLLMENT = "00000000-0000-4000-8000-000000000007";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function progress(overrides: Record<string, unknown> = {}) {
  return {
    athlete: { id: ATHLETE, name: "Lúa Pérez", archived: false },
    objectives: [
      {
        id: OBJECTIVE,
        title: "Rueda sin manos",
        discipline: "gaf",
        apparatus: "beam",
        targetDate: "2027-03-01",
        status: "in_progress",
        revision: 1,
        createdByName: "Marta Ruiz",
        createdAt: "2026-11-10T09:00:00.000Z",
        statusChangedAt: "2026-11-10T09:00:00.000Z",
        canChangeStatus: true,
        history: [
          { revision: 1, fromStatus: null, toStatus: "in_progress", changedByName: "Marta Ruiz", changedAt: "2026-11-10T09:00:00.000Z" },
        ],
      },
    ],
    observations: [
      {
        id: OBSERVATION,
        body: "Buena entrada en barra",
        visibility: "family",
        observedOn: "2026-11-10",
        sessionId: null,
        objectiveId: OBJECTIVE,
        authorName: "Marta Ruiz",
        createdAt: "2026-11-10T09:00:00.000Z",
        updatedAt: "2026-11-10T09:00:00.000Z",
        revision: 1,
        canEdit: false,
      },
    ],
    canWrite: true,
    ...overrides,
  };
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel(readOnly = false) {
  return render(
    <OwnerAthleteProgressPanel
      organizationId={ORG}
      locationId={SITE}
      athleteId={ATHLETE}
      athleteName="Lúa Pérez"
      readOnly={readOnly}
    />
  );
}

describe("OwnerAthleteProgressPanel", () => {
  it("muestra «no disponible» si la migración candidata no está aplicada (503)", async () => {
    fetchMock.mockResolvedValue(json(503, { detail: "no" }));
    renderPanel();
    expect(await screen.findByText(/todavía no están disponibles en tu academia/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir objetivo" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/owner/athletes/${ATHLETE}/progress?organizationId=${ORG}&locationId=${SITE}`,
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("pinta objetivos con historial y observaciones con su visibilidad", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, data: progress() }));
    renderPanel();
    expect(await screen.findByText("Rueda sin manos", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/GAF · Barra de equilibrio/)).toBeInTheDocument();
    expect(screen.getByText("Historial (1)")).toBeInTheDocument();
    expect(screen.getByText("Buena entrada en barra")).toBeInTheDocument();
    expect(screen.getByText("Compartible con la familia", { selector: "span" })).toBeInTheDocument();
    // canEdit=false: la observación de otra persona no se puede editar.
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar conseguido: Rueda sin manos" })).toBeEnabled();
  });

  it("en solo lectura del plan permite consultar pero no escribir", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, data: progress() }));
    renderPanel(true);
    expect(await screen.findByText(/La academia está en solo lectura/)).toBeInTheDocument();
    expect(screen.getByText("Rueda sin manos", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir objetivo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir observación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Marcar conseguido/ })).not.toBeInTheDocument();
  });

  it("una ficha archivada se muestra como solo lectura", async () => {
    fetchMock.mockResolvedValue(
      json(200, { ok: true, data: progress({ athlete: { id: ATHLETE, name: "Lúa Pérez", archived: true }, canWrite: false }) })
    );
    renderPanel();
    expect(await screen.findByText(/Ficha archivada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir observación" })).not.toBeInTheDocument();
  });

  it("cambia el estado con la revisión leída y vuelve a cargar", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true, data: progress() }))
      .mockResolvedValueOnce(json(200, { ok: true, data: { id: OBJECTIVE, revision: 2, replayed: false } }))
      .mockResolvedValueOnce(json(200, { ok: true, data: progress() }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar conseguido: Rueda sin manos" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`/api/v1/owner/athletes/${ATHLETE}/objectives/${OBJECTIVE}/status`);
    expect(JSON.parse(String(init?.body))).toEqual({
      organizationId: ORG,
      locationId: SITE,
      expectedRevision: 1,
      status: "achieved",
    });
  });

  it("al crear una observación envía un identificador de petición y la visibilidad elegida", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true, data: progress({ objectives: [], observations: [] }) }))
      .mockResolvedValueOnce(json(201, { ok: true, data: { id: OBSERVATION, revision: 1, replayed: false } }))
      .mockResolvedValueOnce(json(200, { ok: true, data: progress() }));
    renderPanel();
    fireEvent.change(await screen.findByLabelText("Nueva observación"), { target: { value: "Llega cansada" } });
    fireEvent.click(screen.getByRole("radio", { name: "Compartible con la familia" }));
    expect(screen.getByText(/El portal de familias todavía no muestra observaciones/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Añadir observación" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const body = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    expect(body).toMatchObject({ organizationId: ORG, locationId: SITE, body: "Llega cansada", visibility: "family", objectiveId: null });
    expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("Observación añadida.")).toBeInTheDocument();
  });

  it("muestra el detalle del error del servidor", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true, data: progress() }))
      .mockResolvedValueOnce(json(409, { detail: "Otra persona ha cambiado este objetivo." }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Descartar: Rueda sin manos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Otra persona ha cambiado este objetivo.");
  });
});

describe("OwnerSessionObservationForm (Pasar lista)", () => {
  it("envía la inscripción de la sesión y queda desactivado en solo lectura", async () => {
    const { rerender } = render(
      <OwnerSessionObservationForm
        organizationId={ORG}
        locationId={SITE}
        sessionId={SESSION}
        enrollmentId={ENROLLMENT}
        athleteName="Lúa Pérez"
        disabled
      />
    );
    expect(screen.getByRole("button", { name: "Añadir observación a Lúa Pérez" })).toBeDisabled();

    rerender(
      <OwnerSessionObservationForm
        organizationId={ORG}
        locationId={SITE}
        sessionId={SESSION}
        enrollmentId={ENROLLMENT}
        athleteName="Lúa Pérez"
        disabled={false}
      />
    );
    fetchMock.mockResolvedValueOnce(json(201, { ok: true, data: { id: OBSERVATION, revision: 1, replayed: false, athleteId: ATHLETE } }));
    fireEvent.click(screen.getByRole("button", { name: "Añadir observación a Lúa Pérez" }));
    const form = screen.getByLabelText("Observación sobre Lúa Pérez").closest("form")!;
    fireEvent.change(within(form).getByLabelText("Observación sobre Lúa Pérez"), { target: { value: "Muy concentrada" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar observación" }));
    expect(await screen.findByText("Observación guardada para Lúa Pérez.")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/v1/owner/sessions/${SESSION}/observations`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      organizationId: ORG,
      locationId: SITE,
      enrollmentId: ENROLLMENT,
      body: "Muy concentrada",
      visibility: "team",
    });
  });

  it("muestra «no disponible» si la funcionalidad está dormida", async () => {
    render(
      <OwnerSessionObservationForm
        organizationId={ORG}
        locationId={SITE}
        sessionId={SESSION}
        enrollmentId={ENROLLMENT}
        athleteName="Lúa Pérez"
        disabled={false}
      />
    );
    fetchMock.mockResolvedValueOnce(json(503, {}));
    fireEvent.click(screen.getByRole("button", { name: "Añadir observación a Lúa Pérez" }));
    fireEvent.change(screen.getByLabelText("Observación sobre Lúa Pérez"), { target: { value: "Nota" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar observación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/todavía no están disponibles/);
  });
});
