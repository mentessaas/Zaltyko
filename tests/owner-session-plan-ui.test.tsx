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
    expect(screen.queryByRole("heading", { name: "Guion de la sesión" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/plan?"))).toBe(false);
  });

  it("con sessionPlansAvailable=true muestra el plan de la sesión elegida", async () => {
    renderAttendance(true);
    expect(await screen.findByRole("heading", { name: "Guion de la sesión" })).toBeInTheDocument();
    expect(await screen.findByText("Esta sesión todavía no tiene guion.")).toBeInTheDocument();
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
    expect(await screen.findByText("El guion de las sesiones todavía no está disponible en tu academia.")).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "Crear desde el modelo de la clase" }));
    expect(await screen.findByText("Guion creado desde el modelo de la clase.")).toBeInTheDocument();
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

  it("un reintento de «Crear desde el modelo» tras un fallo de red reutiliza la misma petición", async () => {
    let next = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `91000000-0000-4000-8000-00000000010${next++}` });
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ template: { exists: true, revision: 2 } }) }));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { id: PLAN, revision: 1, replayed: true } }));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ plan }) }));
    renderPanel();
    const button = await screen.findByRole("button", { name: "Crear desde el modelo de la clase" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Comprueba la conexión");
    fireEvent.click(screen.getByRole("button", { name: "Crear desde el modelo de la clase" }));
    expect(await screen.findByText("Guion creado desde el modelo de la clase.")).toBeInTheDocument();
    const ids = calls("PUT").map(([, init]) => JSON.parse(String((init as RequestInit).body)).clientRequestId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("crea un plan con bloques, aparato de la disciplina y objetivos de la sesión", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView() }));
    fetchMock.mockResolvedValueOnce(json(201, { ok: true, data: { id: PLAN, revision: 1, replayed: false } }));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ plan }) }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Crear guion" }));
    expect(screen.queryByRole("button", { name: "Crear desde el modelo de la clase" })).not.toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: "Guardar guion" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "Lanzamientos" } });
    fireEvent.change(screen.getByLabelText("Minutos aprox."), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Lúa Pérez: Rueda sin manos" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar guion" }));

    expect(await screen.findByText("Guion guardado.")).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /modelo de la clase/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editar guion" }));
    expect(screen.getAllByLabelText("Contenido")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Bajar el bloque 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar guion" }));
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
    expect(screen.queryByRole("button", { name: "Editar guion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /modelo/ })).not.toBeInTheDocument();
  });

  it("una sesión cancelada no admite cambios", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { ok: true, data: pageView({ session: { ...pageView().session, cancelled: true } }) })
    );
    renderPanel();
    expect(await screen.findByText("La sesión está cancelada: su guion es de solo lectura.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear guion" })).not.toBeInTheDocument();
  });

  it("la dirección guarda el plan como plantilla de la clase", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { ok: true, data: pageView({ plan, canManageTemplate: true, template: { exists: true, revision: 4 } }) })
    );
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { id: CLASS, revision: 5, replayed: false } }));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: pageView({ plan, canManageTemplate: true, template: { exists: true, revision: 5 } }) }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Actualizar el modelo de la clase" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    const [url, init] = calls("PUT")[0]!;
    expect(url).toBe(`/api/v1/owner/classes/${CLASS}/plan-template`);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ organizationId: ORG, locationId: SITE, expectedRevision: 4, focus: "Rondada" });
    expect(body.blocks[0]).toEqual({ kind: "warmup", discipline: null, apparatus: null, content: "Movilidad", durationMinutes: 10 });
    expect(await screen.findByText(/Modelo de la clase guardado/)).toBeInTheDocument();
  });
});

describe("bloques enlazados con la biblioteca de elementos (ADR-0029 §3.2 y §3.6)", () => {
  const CAT_BEAM = "91000000-0000-4000-8000-0000000000a1";
  const CAT_OLD = "91000000-0000-4000-8000-0000000000a2";
  const search = {
    edition: {
      id: "91000000-0000-4000-8000-0000000000e1",
      code: "fig-wag-2025-2028",
      discipline: "artistic_female",
      title: "Código de prueba",
      cycleStart: 2025,
      cycleEnd: 2028,
      coverDate: "2026-10-14",
      documentUrl: "https://www.gymnastics.sport/",
      attribution: "Pie de atribución de prueba.",
    },
    elements: [
      {
        id: CAT_BEAM,
        elementKey: "ci_beam",
        apparatus: "beam",
        group: "1",
        valueLetter: "A",
        valuePoints: null,
        figReference: null,
        name: "Equilibrio de prueba",
        shortName: "Equilibrio",
        hasNote: false,
      },
    ],
    truncated: false,
  };
  const linkedPlan = {
    ...plan,
    blocks: [
      {
        id: BLOCK_A,
        position: 1,
        kind: "technique",
        discipline: "gaf",
        apparatus: "beam",
        content: "Giros de la academia",
        durationMinutes: 15,
        done: false,
        doneAt: null,
        catalogLink: { id: CAT_BEAM, name: "Equilibrio de prueba", status: "current", replacementId: null },
      },
      {
        id: BLOCK_B,
        position: 2,
        kind: "technique",
        discipline: "gaf",
        apparatus: "vault",
        content: "Rondada",
        durationMinutes: 10,
        done: false,
        doneAt: null,
        catalogLink: { id: CAT_OLD, name: "Salto retirado", status: "withdrawn", replacementId: null },
      },
    ],
  };

  function route(view: ReturnType<typeof pageView>) {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") return json(200, { ok: true, data: { id: PLAN, revision: 4, replayed: false } });
      if (url.startsWith("/api/v1/owner/element-library?")) return json(200, { ok: true, data: search });
      if (url.includes("/plan?")) return json(200, { ok: true, data: view });
      return json(404, { detail: "No encontrado" });
    });
  }

  function putBody() {
    const put = calls("PUT")[0];
    expect(put).toBeDefined();
    return JSON.parse(String((put![1] as RequestInit).body)) as { blocks: Array<Record<string, unknown>> };
  }

  it("elige un elemento para un bloque de artística con aparato, rellena el contenido vacío y lo manda", async () => {
    route(pageView({ libraryAvailable: true }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Crear guion" }));
    const pick = { name: "Elegir elemento de la biblioteca (bloque 1)" };
    expect(screen.queryByRole("button", pick)).not.toBeInTheDocument();

    // Rítmica: sin catálogo, sin selector.
    fireEvent.change(screen.getByLabelText("Disciplina"), { target: { value: "gr" } });
    fireEvent.change(screen.getByLabelText("Aparato"), { target: { value: "hoop" } });
    expect(screen.queryByRole("button", pick)).not.toBeInTheDocument();

    // Artística sin aparato: todavía no.
    fireEvent.change(screen.getByLabelText("Disciplina"), { target: { value: "gaf" } });
    expect(screen.queryByRole("button", pick)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Aparato"), { target: { value: "beam" } });
    expect(screen.getByText("Elemento de la biblioteca")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", pick));

    const dialog = await screen.findByRole("dialog", { name: "Elegir elemento de la biblioteca" });
    expect(within(dialog).getByText(/Su texto solo se rellena si está vacío/)).toBeInTheDocument();
    await waitFor(() => {
      const searchCall = fetchMock.mock.calls.find(([input]) => String(input).startsWith("/api/v1/owner/element-library?"));
      expect(searchCall).toBeDefined();
      const params = new URL(String(searchCall![0]), "http://localhost").searchParams;
      expect(params.get("discipline")).toBe("artistic_female");
      expect(params.get("apparatus")).toBe("beam");
    });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Equilibrio de prueba/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(screen.getByText("De la biblioteca")).toBeInTheDocument();
    expect(screen.getByText("Equilibrio de prueba")).toBeInTheDocument();
    expect(screen.getByLabelText("Contenido")).toHaveValue("Equilibrio");
    // Con el enlace, disciplina y aparato quedan fijos hasta quitarlo, y se explica.
    expect(screen.getByLabelText("Disciplina")).toBeDisabled();
    expect(screen.getByLabelText("Aparato")).toBeDisabled();
    expect(screen.getByLabelText("Aparato")).toHaveAccessibleDescription("Quita el elemento para cambiar el aparato");
    expect(screen.getByLabelText("Disciplina")).toHaveAccessibleDescription("Quita el elemento para cambiar el aparato");

    fireEvent.click(screen.getByRole("button", { name: "Guardar guion" }));
    expect(await screen.findByText("Guion guardado.")).toBeInTheDocument();
    expect(putBody().blocks).toEqual([
      {
        id: null,
        kind: "technique",
        discipline: "gaf",
        apparatus: "beam",
        content: "Equilibrio",
        durationMinutes: null,
        catalogElementId: CAT_BEAM,
      },
    ]);
  });

  it("elegir no pisa un contenido ya escrito", async () => {
    route(pageView({ libraryAvailable: true }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Crear guion" }));
    fireEvent.change(screen.getByLabelText("Disciplina"), { target: { value: "gaf" } });
    fireEvent.change(screen.getByLabelText("Aparato"), { target: { value: "beam" } });
    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "Giros en barra baja" } });
    fireEvent.click(screen.getByRole("button", { name: "Elegir elemento de la biblioteca (bloque 1)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: /Equilibrio de prueba/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Contenido")).toHaveValue("Giros en barra baja");
  });

  it("muestra el enlace con su aviso, «Quitar» manda null y el bloque que no cambia no manda el campo", async () => {
    route(pageView({ plan: linkedPlan, libraryAvailable: true }));
    renderPanel();
    expect(await screen.findByText("Equilibrio de prueba")).toBeInTheDocument();
    expect(screen.getByText("Ya no está en la biblioteca")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editar guion" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar elemento de la biblioteca (bloque 1)" }));
    expect(screen.queryByText("Equilibrio de prueba")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir elemento de la biblioteca (bloque 1)" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Disciplina")[0]).not.toBeDisabled();
    expect(screen.getAllByText("Quita el elemento para cambiar el aparato")).toHaveLength(1);
    // El contenido del bloque se conserva.
    expect(screen.getAllByLabelText("Contenido")[0]).toHaveValue("Giros de la academia");

    fireEvent.click(screen.getByRole("button", { name: "Guardar guion" }));
    expect(await screen.findByText("Guion guardado.")).toBeInTheDocument();
    const [first, second] = putBody().blocks;
    expect(first).toMatchObject({ id: BLOCK_A, content: "Giros de la academia", catalogElementId: null });
    expect(second).toMatchObject({ id: BLOCK_B, content: "Rondada" });
    expect(second).not.toHaveProperty("catalogElementId");
  });

  it("sin la biblioteca activa se ve el enlace, pero no se elige ni se quita ni se manda", async () => {
    route(pageView({ plan: linkedPlan }));
    renderPanel();
    expect(await screen.findByText("Equilibrio de prueba")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar guion" }));
    expect(screen.queryByRole("button", { name: /elemento de la biblioteca/ })).not.toBeInTheDocument();
    // Aun sin la biblioteca, el aparato de un bloque enlazado no se cambia.
    for (const select of [...screen.getAllByLabelText("Disciplina"), ...screen.getAllByLabelText("Aparato")]) {
      expect(select).toBeDisabled();
    }
    fireEvent.click(screen.getByRole("button", { name: "Guardar guion" }));
    expect(await screen.findByText("Guion guardado.")).toBeInTheDocument();
    for (const block of putBody().blocks) expect(block).not.toHaveProperty("catalogElementId");
  });

  it("al guardar como modelo de la clase lleva el enlace vigente y deja sin enlace el retirado", async () => {
    route(pageView({ plan: linkedPlan, libraryAvailable: true, canManageTemplate: true, template: { exists: true, revision: 4 } }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Actualizar el modelo de la clase" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    expect(putBody().blocks.map((block) => block.catalogElementId)).toEqual([CAT_BEAM, null]);
  });
});
