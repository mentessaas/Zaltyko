// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPlanUsage } from "@/components/owner-dashboard/OwnerPlanUsage";
import { persistArchiveIntent, readStoredArchiveIntent, type StoredArchiveIntent } from "@/components/owner-dashboard/owner-archive-intent-storage";

const organizationId = "10000000-0000-4000-8000-000000000001";
const usage = { readOnly: true, planCode: "free", resources: [
  { resource: "athletes", current: 31, limit: 30, excess: 1 },
  { resource: "groups", current: 3, limit: 3, excess: 0 },
  { resource: "classes", current: 10, limit: 10, excess: 0 },
], items: [{ id: "20000000-0000-4000-8000-000000000001", name: "Ficha A" }, { id: "20000000-0000-4000-8000-000000000002", name: "Ficha B" }], next: "20000000-0000-4000-8000-000000000003" };
const fetchMock = vi.fn();
function response(payload: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => payload }; }
const acknowledged = () => response({ ok: true, data: usage });
function posts() { return fetchMock.mock.calls.filter(([, options]) => options.method === "POST"); }
function leavingPageIsPrevented() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
async function selectAndConfirm() {
  const choose = await screen.findByRole("button", { name: "Elegir para archivar: Ficha A" });
  await waitFor(() => expect(choose).toBeEnabled());
  fireEvent.click(choose);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));
}
beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => acknowledged());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("archivo explícito con resultado incierto, solo solicitudes simuladas", () => {
  it("proyecta una intención con item al contrato almacenado, sin nombre y sin sobrescribir otra operación", () => {
    const candidate: StoredArchiveIntent & { item: { id: string; name: string } } = {
      organizationId,
      resource: "athletes",
      resourceId: "20000000-0000-4000-8000-000000000001",
      key: "archive-30000000-0000-4000-8000-000000000001",
      item: { id: "20000000-0000-4000-8000-000000000001", name: "Nombre privado de ficha" },
    };

    expect(persistArchiveIntent(window.sessionStorage, candidate)).toBe(true);
    const raw = window.sessionStorage.getItem("zaltyko:owner-plan-archive-intent:v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({
      version: 1,
      organizationId,
      resource: "athletes",
      resourceId: candidate.resourceId,
      key: candidate.key,
    });
    expect(raw).not.toContain("item");
    expect(raw).not.toContain("Nombre privado de ficha");
    expect(readStoredArchiveIntent(window.sessionStorage)).toEqual({
      status: "pending",
      intent: {
        organizationId,
        resource: "athletes",
        resourceId: candidate.resourceId,
        key: candidate.key,
      },
    });

    const otherCandidate = { ...candidate, key: "archive-30000000-0000-4000-8000-000000000002" };
    expect(persistArchiveIntent(window.sessionStorage, otherCandidate)).toBe(false);
    expect(window.sessionStorage.getItem("zaltyko:owner-plan-archive-intent:v1")).toBe(raw);
  });

  it("mantiene unavailable cerrado y no intenta escribir si no se puede leer el almacenamiento", () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("storage unavailable"); }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const candidate: StoredArchiveIntent = {
      organizationId,
      resource: "athletes",
      resourceId: "20000000-0000-4000-8000-000000000001",
      key: "archive-30000000-0000-4000-8000-000000000001",
    };

    expect(readStoredArchiveIntent(storage)).toEqual({ status: "unavailable" });
    expect(persistArchiveIntent(storage, candidate)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    [404, "NOT_FOUND", "La ficha ya no está disponible."],
    [409, "RESOURCE_NOT_OVER_LIMIT", "El excedente ya no está disponible."],
  ])("actualiza la lista tras un cambio concurrente confirmado (%s/%s)", async (status, code, message) => {
    const withinLimit = { ...usage, readOnly: false, resources: usage.resources.map(item => ({ ...item, current: item.limit, excess: 0 })), items: [], next: null };
    let changed = false;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method === "POST") {
        changed = true;
        return response({ ok: false, error: code, code, message }, Number(status));
      }
      return response({ ok: true, data: changed ? withinLimit : usage });
    });
    render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();

    const notice = await screen.findByText("El servidor indica que la ficha o el excedente ya cambió. Comprueba de nuevo el uso y la lista antes de elegir otra ficha.");
    expect(notice).toHaveAttribute("role", "status");
    expect(await screen.findByText(/No hay excedente que archivar en esta academia/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Elegir para archivar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Confirmar archivo de Ficha A" })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it("retira la ficha elegida cuando una lectura confirma que el archivo consumió el excedente", async () => {
    const withinLimit = { ...usage, readOnly: false, resources: usage.resources.map(item => ({ ...item, current: item.limit, excess: 0 })), items: [], next: null };
    let archived = false;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method === "POST") { archived = true; return response({ ok: true, data: withinLimit }); }
      return response({ ok: true, data: archived ? withinLimit : usage });
    });
    render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    await waitFor(() => expect(screen.queryByRole("group", { name: "Confirmar archivo de Ficha A" })).not.toBeInTheDocument());
    expect(await screen.findByText(/No hay excedente que archivar en esta academia/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Elegir para archivar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tipo de ficha" })).toBeDisabled();
    expect(posts()).toHaveLength(1);
  });

  it.each([
    [401, { ok: false, error: "UNAUTHENTICATED", code: "UNAUTHENTICATED", message: "Accede de nuevo" }],
    [403, { ok: false, error: "FORBIDDEN", code: "FORBIDDEN", message: "Sin permiso" }],
    [404, { ok: false, error: "NOT_FOUND", code: "NOT_FOUND", message: "No encontrada" }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: "Espera" }],
  ])("un rechazo posterior %s no libera un archivo previamente incierto", async (status, rejection) => {
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method !== "POST") return acknowledged();
      if (++count === 1) throw new Error("Synthetic lost acknowledgement");
      return count === 2 ? response(rejection, Number(status)) : acknowledged();
    });
    render(<OwnerPlanUsage organizationId={organizationId} />); await selectAndConfirm();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el mismo archivo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar el mismo archivo" })).toBeEnabled());
    expect(leavingPageIsPrevented()).toBe(true);
    expect(screen.getByRole("button", { name: "Cancelar selección" })).toBeDisabled();
    expect(posts()).toHaveLength(2); expect(posts()[1]).toEqual(posts()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el mismo archivo" }));
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    expect(posts()[2]).toEqual(posts()[0]); expect(leavingPageIsPrevented()).toBe(false);
  });

  it("avisa durante el envío y deja de avisar al recibir un acuse válido", async () => {
    let finish!: (value: ReturnType<typeof acknowledged>) => void;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST" ? new Promise(resolve => { finish = resolve; }) : acknowledged());
    render(<OwnerPlanUsage organizationId={organizationId} />);
    expect(leavingPageIsPrevented()).toBe(false);
    await selectAndConfirm();
    expect(leavingPageIsPrevented()).toBe(true);
    expect(posts()).toHaveLength(1);
    await act(async () => { finish(acknowledged()); });
    expect(leavingPageIsPrevented()).toBe(false);
    expect(posts()).toHaveLength(1);
  });

  it("conserva el aviso del archivo incierto aunque cambie la academia y limpia al desmontar", async () => {
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method === "POST") throw new Error("lost");
      return acknowledged();
    });
    const view = render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    await screen.findByRole("button", { name: "Reintentar el mismo archivo" });
    expect(leavingPageIsPrevented()).toBe(true);
    view.rerender(<OwnerPlanUsage organizationId="10000000-0000-4000-8000-000000000002" />);
    expect(leavingPageIsPrevented()).toBe(true);
    expect(posts()).toHaveLength(1);
    view.unmount();
    expect(leavingPageIsPrevented()).toBe(false);
  });

  it("si se pierde el acuse tras aplicar, reenvía exactamente clave y cuerpo", async () => {
    const applied = new Set<string>();
    let effects = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method !== "POST") return acknowledged();
      const key = options.headers["idempotency-key"];
      if (!applied.has(key)) { applied.add(key); effects += 1; throw new Error("response lost after mock commit"); }
      return acknowledged();
    });
    render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("No podemos confirmar");
    expect(screen.getByRole("button", { name: "Cancelar selección" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Tipo de ficha" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Elegir para archivar: Ficha B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Siguientes fichas" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText(/La intención mínima quedó guardada en esta pestaña/)).toBeVisible();
    fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
    expect(screen.getByRole("group")).toBeVisible();
    expect(posts()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el mismo archivo" }));
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    expect(posts()).toHaveLength(2);
    expect(posts()[1]).toEqual(posts()[0]);
    expect(JSON.parse(posts()[0][1].body)).toEqual({ organizationId, resource: "athletes", resourceId: "20000000-0000-4000-8000-000000000001", confirmArchive: true });
    expect(effects).toBe(1);
  });

  it.each([
    () => Promise.resolve(response({ ok: false, code: "UNAVAILABLE" }, 503)),
    () => Promise.resolve(response({ ok: true, data: usage, error: "OTHER_ERROR" }, 200)),
    () => Promise.resolve(response({ ok: false, code: "TIMEOUT" }, 408)),
    () => Promise.resolve(response({ ok: true }, 200)),
    () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error("invalid json"); } }),
    () => Promise.resolve(response(null, 403)),
    () => Promise.resolve(response({ ok: false, error: "IDEMPOTENCY_CONFLICT", code: "IDEMPOTENCY_CONFLICT", message: "Conflicto" }, 409)),
    () => Promise.resolve(response({ ok: false, error: "NEW_ERROR", code: "NEW_ERROR", message: "Error" }, 403)),
    () => Promise.resolve(response({ ok: false, error: "VALIDATION_ERROR", code: "VALIDATION_ERROR", message: "Error" }, 403)),
  ])("conserva una sola intención ante un resultado no concluyente %#", async failure => {
    let attempts = 0;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST" && ++attempts === 1 ? failure() : acknowledged());
    render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar el mismo archivo" }));
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    expect(posts()).toHaveLength(2);
    expect(posts()[1]).toEqual(posts()[0]);
  });

  it("un rechazo canónico permite corregir, pero exige nueva confirmación humana", async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST" && ++attempts === 1
      ? response({ ok: false, error: "NOT_FOUND", code: "NOT_FOUND", message: "Ficha no encontrada" }, 404) : acknowledged());
    render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Ficha no encontrada");
    expect(leavingPageIsPrevented()).toBe(false);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmar archivo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar selección" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    expect(posts()).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    expect(posts()).toHaveLength(2);
    expect(posts()[1][1].headers["idempotency-key"]).not.toEqual(posts()[0][1].headers["idempotency-key"]);
  });

  it("recupera tras recargar la misma ficha y clave sin guardar su nombre", async () => {
    const withinLimit = { ...usage, readOnly: false, resources: usage.resources.map(item => ({ ...item, current: item.limit, excess: 0 })), items: [], next: null };
    let archived = false;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method === "POST") {
        if (!archived) { archived = true; throw new Error("applied but response lost"); }
        return response({ ok: true, data: withinLimit });
      }
      return response({ ok: true, data: archived ? withinLimit : usage });
    });
    const firstView = render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    await screen.findByRole("button", { name: "Reintentar el mismo archivo" });
    const firstPost = posts()[0];
    const stored = window.sessionStorage.getItem("zaltyko:owner-plan-archive-intent:v1");
    expect(stored).not.toContain("Ficha A");
    expect(stored).not.toContain("given_name");

    firstView.unmount();
    render(<OwnerPlanUsage organizationId={organizationId} />);
    expect(await screen.findByRole("group", { name: "Confirmar archivo de Gimnasta seleccionada antes de recargar" })).toBeVisible();
    expect(await screen.findByText(/No hay excedente que archivar en esta academia/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el mismo archivo" }));
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    expect(posts()).toHaveLength(2);
    expect(posts()[1]).toEqual(firstPost);
    expect(window.sessionStorage.getItem("zaltyko:owner-plan-archive-intent:v1")).toBeNull();
  });

  it("no envía el archivo si el navegador no puede persistir la intención primero", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage disabled"); });
    render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("no se ha enviado ninguna solicitud");
    expect(posts()).toHaveLength(0);
    expect(leavingPageIsPrevented()).toBe(false);
  });

  it("un refresco GET no pierde la intención ni la ficha si ya no aparece en la lista", async () => {
    let postCount = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method === "POST") { postCount += 1; if (postCount === 1) throw new Error("network"); return acknowledged(); }
      return response({ ok: true, data: { ...usage, items: postCount ? [] : usage.items } });
    });
    render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    expect(await screen.findByRole("button", { name: "Reintentar el mismo archivo" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar el uso" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Elegir para archivar/ })).not.toBeInTheDocument());
    expect(screen.getByRole("group", { name: "Confirmar archivo de Ficha A" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el mismo archivo" }));
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    expect(posts()[1]).toEqual(posts()[0]);
  });

  it("una intención incierta no se envía bajo otra academia", async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST" && ++attempts === 1 ? Promise.reject(new Error("lost")) : acknowledged());
    const view = render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    expect(await screen.findByRole("button", { name: "Reintentar el mismo archivo" })).toBeVisible();
    view.rerender(<OwnerPlanUsage organizationId="10000000-0000-4000-8000-000000000002" />);
    expect(await screen.findByRole("button", { name: "Elegir para archivar: Ficha B" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reintentar el mismo archivo" })).not.toBeInTheDocument();
    expect(screen.getByText(/archivo pendiente de confirmar en otra academia/)).toBeVisible();
    expect(posts()).toHaveLength(1);
    view.rerender(<OwnerPlanUsage organizationId={organizationId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar el mismo archivo" }));
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    expect(posts()[1]).toEqual(posts()[0]);
  });

  it("dos activaciones sin ceder el render solo lanzan un POST", async () => {
    let resolve!: (value: ReturnType<typeof acknowledged>) => void;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST" ? new Promise(done => { resolve = done; }) : acknowledged());
    render(<OwnerPlanUsage organizationId={organizationId} />);
    const choose = await screen.findByRole("button", { name: "Elegir para archivar: Ficha A" });
    await waitFor(() => expect(choose).toBeEnabled());
    fireEvent.click(choose);
    fireEvent.click(screen.getByRole("checkbox"));
    const button = screen.getByRole("button", { name: "Confirmar archivo" });
    act(() => { button.click(); button.click(); });
    expect(posts()).toHaveLength(1);
    await act(async () => { resolve(acknowledged()); });
  });

  it("si no se puede preparar la clave no afirma un envío ni deja la ficha bloqueada", async () => {
    vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => { throw new Error("unavailable"); });
    render(<OwnerPlanUsage organizationId={organizationId} />);
    await selectAndConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha enviado ninguna solicitud");
    expect(leavingPageIsPrevented()).toBe(false);
    expect(posts()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Cancelar selección" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Reintentar el mismo archivo" })).not.toBeInTheDocument();
  });
});
