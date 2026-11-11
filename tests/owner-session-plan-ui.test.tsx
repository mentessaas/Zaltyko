// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P2 #17 (segunda parte): plan de la sesión en Pasar lista.
 * - Sin la prop de disponibilidad (candidato SQL sin aplicar) Pasar lista no
 *   muestra el plan ni hace su petición.
 * - Con ella, el panel aislado lee el plan; un 503 con su motivo es «no
 *   disponible», nunca un error.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { OwnerSessionPlanPanel } from "@/components/owner-dashboard/OwnerSessionPlanPanel";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const ORG = "91000000-0000-4000-8000-000000000001";
const SITE = "91000000-0000-4000-8000-000000000002";
const SESSION = "91000000-0000-4000-8000-000000000003";
const ENROLLMENT = "91000000-0000-4000-8000-000000000004";
const PLAN = "91000000-0000-4000-8000-000000000005";
const BLOCK_A = "91000000-0000-4000-8000-000000000006";
const BLOCK_B = "91000000-0000-4000-8000-000000000007";
const CLASS = "91000000-0000-4000-8000-000000000008";
const OBJECTIVE = "91000000-0000-4000-8000-000000000009";
const ATHLETE = "91000000-0000-4000-8000-000000000010";
const REQUEST_ID = "91000000-0000-4000-8000-000000000011";

const fetchMock = vi.fn();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function pageView(overrides: Record<string, unknown> = {}) {
  return {
    session: {
      id: SESSION,
      classTemplateId: CLASS,
      startsAt: "2026-11-11T16:00:00.000Z",
      started: false,
      cancelled: false,
      canMarkBlocks: false,
    },
    plan: null,
    template: { exists: false, revision: null },
    canManageTemplate: false,
    objectiveOptions: [
      { objectiveId: OBJECTIVE, athleteId: ATHLETE, athleteName: "Lúa Pérez", title: "Rueda sin manos", status: "in_progress" },
    ],
    ...overrides,
  };
}

const plan = {
  id: PLAN,
  revision: 3,
  focus: "Rondada",
  note: "Traer cinta",
  fromTemplateRevision: null,
  blocks: [
    { id: BLOCK_A, position: 1, kind: "warmup", discipline: null, apparatus: null, content: "Movilidad", durationMinutes: 10, done: true, doneAt: "2026-11-11T16:10:00.000Z" },
    { id: BLOCK_B, position: 2, kind: "technique", discipline: "gr", apparatus: "hoop", content: "Lanzamientos", durationMinutes: 20, done: false, doneAt: null },
  ],
  objectives: [
    { objectiveId: OBJECTIVE, athleteId: ATHLETE, athleteName: "Lúa Pérez", title: "Rueda sin manos", status: "in_progress" },
  ],
  updatedAt: "2026-11-11T15:00:00.000Z",
};

function renderPanel(readOnly = false) {
  return render(<OwnerSessionPlanPanel organizationId={ORG} locationId={SITE} sessionId={SESSION} readOnly={readOnly} />);
}

function calls(method: string) {
  return fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? "GET") === method);
}

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => REQUEST_ID });
  publishOwnerPlanUsage(ORG, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("Pasar lista: el plan depende de la disponibilidad que calcula el servidor", () => {
  function renderAttendance(sessionPlansAvailable?: boolean) {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/plan?")
        ? json(200, { ok: true, data: pageView() })
        : json(200, { ok: true, data: { items: [{ enrollmentId: ENROLLMENT, athleteName: "Lúa Pérez", attendanceStatus: null }] } })
    );
    return render(
      <OwnerAttendanceManager
        organizationId={ORG}
        locationId={SITE}
        sessions={[{ id: SESSION, className: "Base 3", startsAt: "2026-11-11T16:00:00.000Z", timezone: "Europe/Madrid" }]}
        initialSessionId={SESSION}
        {...(sessionPlansAvailable === undefined ? {} : { sessionPlansAvailable })}
      />
    );
  }

  it.each([
    ["false", false],
    ["omitida", undefined],
  ] as const)("con sessionPlansAvailable %s no muestra el plan ni lo pide", async (_label, value) => {
    renderAttendance(value);
    expect(await screen.findByRole("button", { name: "Presente: Lúa Pérez" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Plan de la sesión" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/plan?"))).toBe(false);
  });

  it("con sessionPlansAvailable=true muestra el plan de la sesión elegida", async () => {
    renderAttendance(true);
    expect(await screen.findByRole("heading", { name: "Plan de la sesión" })).toBeInTheDocument();
    expect(await screen.findByText("Esta sesión todavía no tiene plan.")).toBeInTheDocument();
    const planCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/plan?"));
    expect(String(planCall?.[0])).toBe(
      `/api/v1/owner/sessions/${SESSION}/plan?organizationId=${ORG}&locationId=${SITE}`
    );
  });
});

describe("panel del plan de la sesión", () => {
  it("un 503 del candidato sin aplicar se muestra como «no disponible», no como error", async () => {
    fetchMock.mockResolvedValue(
      json(503, { status: 503, detail: "No activado", errors: { reason: "session_plans_unavailable" } })
    );
    renderPanel();
    expect(await screen.findByText("La planificación de sesiones todavía no está disponible en tu academia.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("otro 503 es un error con opción de reintentar", async () => {
    fetchMock.mockResolvedValue(json(503, { status: 503, detail: "No se pudo comprobar el plan" }));
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo comprobar el plan");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("sin plan ofrece crearlo y, si hay plantilla, crearlo desde ella", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ template: { exists: true, revision: 2 } }) }));
    fetchMock.mockResolvedValueOnce(json(201, { ok: true, data: { id: PLAN, revision: 1, replayed: false } }));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ plan }) }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Crear desde la plantilla de la clase" }));
    expect(await screen.findByText("Plan creado desde la plantilla de la clase.")).toBeInTheDocument();
    const [url, init] = calls("PUT")[0]!;
    expect(url).toBe(`/api/v1/owner/sessions/${SESSION}/plan`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      organizationId: ORG,
      locationId: SITE,
      clientRequestId: REQUEST_ID,
      expectedRevision: null,
      source: "template",
      focus: null,
      note: null,
      blocks: [],
      objectiveIds: [],
    });
    expect(await screen.findByText("Movilidad")).toBeInTheDocument();
  });

  it("crea un plan con bloques, aparato de la disciplina y objetivos de la sesión", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView() }));
    fetchMock.mockResolvedValueOnce(json(201, { ok: true, data: { id: PLAN, revision: 1, replayed: false } }));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ plan }) }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Crear plan" }));
    expect(screen.queryByRole("button", { name: "Crear desde la plantilla de la clase" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Foco del día/), { target: { value: "Rondada" } });
    expect(screen.getByLabelText("Aparato")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Disciplina"), { target: { value: "gr" } });
    const apparatus = screen.getByLabelText("Aparato");
    expect(within(apparatus).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Sin aparato",
      "Manos libres",
      "Cuerda",
      "Aro",
      "Pelota",
      "Mazas",
      "Cinta",
    ]);
    fireEvent.change(apparatus, { target: { value: "hoop" } });
    expect(screen.getByRole("button", { name: "Guardar plan" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "Lanzamientos" } });
    fireEvent.change(screen.getByLabelText("Minutos aprox."), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Lúa Pérez: Rueda sin manos" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar plan" }));

    expect(await screen.findByText("Plan guardado.")).toBeInTheDocument();
    const body = JSON.parse(String((calls("PUT")[0]![1] as RequestInit).body));
    expect(body).toMatchObject({
      clientRequestId: REQUEST_ID,
      expectedRevision: null,
      source: "manual",
      focus: "Rondada",
      note: null,
      objectiveIds: [OBJECTIVE],
      blocks: [{ id: null, kind: "technique", discipline: "gr", apparatus: "hoop", content: "Lanzamientos", durationMinutes: 20 }],
    });
  });

  it("muestra el plan sin casillas antes de empezar la sesión y edita con la revisión actual", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ plan }) }));
    fetchMock.mockResolvedValueOnce(json(409, { status: 409, detail: "Alguien ha cambiado el plan mientras lo editabas." }));
    renderPanel();
    expect(await screen.findByText("Rondada")).toBeInTheDocument();
    expect(screen.getByText("2 bloques · unos 30 min")).toBeInTheDocument();
    expect(screen.getByText("Lúa Pérez: Rueda sin manos")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /plantilla de la clase/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editar plan" }));
    expect(screen.getAllByLabelText("Contenido")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Bajar el bloque 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Alguien ha cambiado el plan");
    const body = JSON.parse(String((calls("PUT")[0]![1] as RequestInit).body));
    expect(body.expectedRevision).toBe(3);
    expect(body.blocks.map((block: { id: string }) => block.id)).toEqual([BLOCK_B, BLOCK_A]);
  });

  it("desde que empieza la sesión marca bloques y recuerda la observación rápida", async () => {
    const started = { started: true, canMarkBlocks: true };
    fetchMock.mockResolvedValueOnce(
      json(200, { ok: true, data: pageView({ plan, session: { ...pageView().session, ...started } }) })
    );
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { id: BLOCK_B, done: true, replayed: false } }));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ plan, session: { ...pageView().session, ...started } }) }));
    renderPanel();
    const pending = await screen.findByRole("checkbox", { name: "Hecho: Técnica: Lanzamientos" });
    expect(screen.getByRole("checkbox", { name: "Hecho: Calentamiento: Movilidad" })).toBeChecked();
    expect(screen.getByText(/usa «Observación» en su fila/)).toBeInTheDocument();
    fireEvent.click(pending);
    expect(await screen.findByText("Bloque marcado como hecho.")).toBeInTheDocument();
    const [url, init] = calls("PUT")[0]!;
    expect(url).toBe(`/api/v1/owner/sessions/${SESSION}/plan/blocks/${BLOCK_B}`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ organizationId: ORG, locationId: SITE, done: true });
  });

  it("en solo lectura se ve el plan pero no se edita ni se marca", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        ok: true,
        data: pageView({ plan, canManageTemplate: true, session: { ...pageView().session, started: true, canMarkBlocks: true } }),
      })
    );
    renderPanel(true);
    expect(await screen.findByText("Movilidad")).toBeInTheDocument();
    expect(screen.getByText(/solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /plantilla/ })).not.toBeInTheDocument();
  });

  it("una sesión cancelada no admite cambios", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { ok: true, data: pageView({ session: { ...pageView().session, cancelled: true } }) })
    );
    renderPanel();
    expect(await screen.findByText("La sesión está cancelada: su plan es de solo lectura.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear plan" })).not.toBeInTheDocument();
  });

  it("la dirección guarda el plan como plantilla de la clase", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { ok: true, data: pageView({ plan, canManageTemplate: true, template: { exists: true, revision: 4 } }) })
    );
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { id: CLASS, revision: 5, replayed: false } }));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ plan, canManageTemplate: true, template: { exists: true, revision: 5 } }) }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Actualizar la plantilla de la clase" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    const [url, init] = calls("PUT")[0]!;
    expect(url).toBe(`/api/v1/owner/classes/${CLASS}/plan-template`);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ organizationId: ORG, locationId: SITE, expectedRevision: 4, focus: "Rondada" });
    expect(body.blocks[0]).toEqual({ kind: "warmup", discipline: null, apparatus: null, content: "Movilidad", durationMinutes: 10 });
    expect(await screen.findByText(/Plantilla de la clase guardada/)).toBeInTheDocument();
  });
});
