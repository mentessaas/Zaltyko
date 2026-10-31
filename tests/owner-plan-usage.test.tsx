// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect } from "react";
import { OwnerPlanUsage } from "@/components/owner-dashboard/OwnerPlanUsage";
import { OwnerOperationalReadOnlyNotice } from "@/components/owner-dashboard/OwnerOperationalReadOnlyNotice";
import { beginOwnerPlanUsageRead, markOwnerPlanUsageUnavailable, publishOwnerPlanUsage, useOwnerPlanPolicy } from "@/components/owner-dashboard/owner-plan-usage-store";

const org = "10000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn();
const usage = {
  planCode: "free", readOnly: false,
  resources: [
    { resource: "athletes", current: 30, limit: 30, excess: 0 },
    { resource: "groups", current: 3, limit: 3, excess: 0 },
    { resource: "classes", current: 10, limit: 10, excess: 0 },
  ], items: [] as Array<{ id: string; name: string }>, next: null,
};
const athleteExcessUsage = { ...usage, readOnly: true, resources: usage.resources.map(item => item.resource === "athletes" ? { ...item, current: 31, excess: 1 } : item) };
const success = (data: unknown = usage) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });
function PolicyProbe() {
  const policy = useOwnerPlanPolicy(org);
  return <span data-testid="operational-policy">{policy.status === "ready" ? (policy.readOnly ? "read-only" : "editable") : policy.status}</span>;
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); publishOwnerPlanUsage(org, { readOnly: false, planCode: "free" }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("consulta del uso sin operaciones de negocio", () => {
  it("espera las lecturas concurrentes y al final conserva la respuesta válida más reciente", () => {
    render(<PolicyProbe />);
    let older!: number;
    let newer!: number;
    act(() => { older = beginOwnerPlanUsageRead(org); newer = beginOwnerPlanUsageRead(org); });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("loading");
    act(() => { expect(publishOwnerPlanUsage(org, { readOnly: true, planCode: "free" }, newer)).toBe(true); });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("loading");
    act(() => {
      expect(publishOwnerPlanUsage(org, { readOnly: false, planCode: "free" }, older)).toBe(true);
      expect(markOwnerPlanUsageUnavailable(org, older)).toBe(false);
    });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("read-only");
  });

  it("no convierte en error global el aborto más reciente mientras siga viva otra lectura", () => {
    render(<PolicyProbe />);
    let stale!: number;
    let active!: number;
    act(() => { stale = beginOwnerPlanUsageRead(org); active = beginOwnerPlanUsageRead(org); });
    act(() => { expect(markOwnerPlanUsageUnavailable(org, active, "cancelled")).toBe(true); });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("loading");
    act(() => { expect(publishOwnerPlanUsage(org, { readOnly: true, planCode: "free" }, stale)).toBe(true); });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("read-only");
  });

  it("no sustituye un fallo real más reciente por una política antigua", () => {
    render(<PolicyProbe />);
    let older!: number;
    let newer!: number;
    act(() => { older = beginOwnerPlanUsageRead(org); newer = beginOwnerPlanUsageRead(org); });
    act(() => { expect(markOwnerPlanUsageUnavailable(org, newer, "error")).toBe(true); });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("loading");
    act(() => { expect(publishOwnerPlanUsage(org, { readOnly: false, planCode: "free" }, older)).toBe(true); });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("error");
  });

  it("muestra error recuperable solo cuando todas las lecturas concurrentes fallan", () => {
    render(<PolicyProbe />);
    let first!: number;
    let second!: number;
    act(() => { first = beginOwnerPlanUsageRead(org); second = beginOwnerPlanUsageRead(org); });
    act(() => { expect(markOwnerPlanUsageUnavailable(org, second)).toBe(true); });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("loading");
    act(() => { expect(markOwnerPlanUsageUnavailable(org, first)).toBe(true); });
    expect(screen.getByTestId("operational-policy")).toHaveTextContent("error");
  });

  it("publica error recuperable al desmontar la lectura ganadora aún pendiente", async () => {
    fetchMock.mockImplementation((_url: string, options: RequestInit) => new Promise((_, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    render(<><OwnerOperationalReadOnlyNotice organizationId={org} /><PolicyProbe /></>);
    const usageView = render(<OwnerPlanUsage organizationId={org} compact />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    act(() => usageView.unmount());

    expect(screen.getByTestId("operational-policy")).toHaveTextContent("error");
    expect(screen.getByRole("button", { name: "Volver a comprobar límites" })).toBeEnabled();
  });

  it("propaga el estado confirmado de la respuesta de uso a la política Owner compartida", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "20000000-0000-4000-8000-000000000001", name: "Gimnasta de prueba A" }] }));
    render(<><OwnerPlanUsage organizationId={org} compact /><PolicyProbe /></>);
    await waitFor(() => expect(screen.getByTestId("operational-policy")).toHaveTextContent("read-only"));
    expect(screen.getByText(/Academia en solo lectura/)).toBeVisible();
  });

  it("publica error si falla la lectura de uso y permite solicitar otra comprobación", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<><OwnerPlanUsage organizationId={org} compact /><PolicyProbe /></>);
    await waitFor(() => expect(screen.getByTestId("operational-policy")).toHaveTextContent("error"));
    expect(screen.getByRole("button", { name: "Volver a consultar el uso" })).toBeEnabled();
  });

  it("distingue carga de error y permite reintentar solo la lectura", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(success());
    render(<OwnerPlanUsage organizationId={org} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha podido comprobar el uso");
    expect(screen.queryByText("Consultando el uso…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar el uso" }));
    expect(await screen.findByText("La academia está dentro de los límites del plan.")).toBeVisible();
    expect(screen.getAllByText(/Límite alcanzado/)).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toContain(`/api/v1/owner/saas/usage?organizationId=${org}`);
      expect(options.method).toBeUndefined();
      expect(options.cache).toBe("no-store");
      expect(options.body).toBeUndefined();
    }
  });
  it("el aviso compacto también permite recuperar una lectura fallida", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(success());
    render(<OwnerPlanUsage organizationId={org} compact />);
    expect(await screen.findByRole("status")).toHaveTextContent("No se ha podido comprobar");
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar el uso" }));
    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("refresca los límites al volver a la pestaña y agrupa el par focus/visibility", async () => {
    fetchMock.mockResolvedValue(success());
    render(<OwnerPlanUsage organizationId={org} compact />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      fireEvent.focus(window);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.every(([, options]) =>
      options.method === undefined && options.body === undefined && options.cache === "no-store"
    )).toBe(true);
  });
  it("muestra solo lectura del servidor sin seleccionar ni archivar el excedente", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...usage, readOnly: true, resources: usage.resources.map(item => ({ ...item, current: item.current + 1, excess: 1 })) }));
    render(<OwnerPlanUsage organizationId={org} />);
    expect(await screen.findByText(/Tus datos están guardados/)).toBeVisible();
    expect(screen.getAllByText(/Excedente: 1/)).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Confirmar archivo" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("solo ofrece tipos con excedente y consulta sus candidatos manuales", async () => {
    const groupUsage = { ...usage, readOnly: true, resources: usage.resources.map(item => item.resource === "groups" ? { ...item, current: 4, excess: 1 } : item) };
    fetchMock.mockImplementation(async url => {
      const requested = new URL(url, "http://localhost").searchParams.get("resource");
      return success({ ...groupUsage, items: requested === "groups" ? [{ id: "synthetic-group", name: "Grupo excedente" }] : [] });
    });
    render(<OwnerPlanUsage organizationId={org} />);
    expect(await screen.findByRole("button", { name: "Elegir para archivar: Grupo excedente" })).toBeEnabled();
    const selector = screen.getByRole("combobox", { name: "Tipo de ficha" });
    expect(selector).toHaveValue("groups");
    expect(screen.getByRole("option", { name: "Grupos · excedente 1" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Gimnastas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Clases/ })).not.toBeInTheDocument();
  });
  it("no muestra candidatos ni habilita tipos cuando ningún recurso excede el límite", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...usage, items: [{ id: "synthetic-hidden", name: "No archivable" }] }));
    render(<OwnerPlanUsage organizationId={org} />);
    expect(await screen.findByText(/No hay excedente que archivar en esta academia/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Elegir para archivar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tipo de ficha" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "No hay tipos con excedente" })).toBeInTheDocument();
  });
  it("avisa a las demás vistas y refresca el uso si el servidor rechaza un archivo obsoleto", async () => {
    const athleteId = "20000000-0000-4000-8000-000000000011";
    let usageReads = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            ok: false,
            code: "RESOURCE_NOT_OVER_LIMIT",
            error: "RESOURCE_NOT_OVER_LIMIT",
            message: "No hay excedente de este tipo para archivar",
          }),
        };
      }
      usageReads += 1;
      return success(usageReads === 1
        ? { ...athleteExcessUsage, items: [{ id: athleteId, name: "Gimnasta obsoleta" }] }
        : usage);
    });
    const onPolicyChanged = vi.fn();
    window.addEventListener("zaltyko:plan-usage-changed", onPolicyChanged);
    render(<OwnerPlanUsage organizationId={org} />);

    fireEvent.click(await screen.findByRole("button", { name: "Elegir para archivar: Gimnasta obsoleta" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    expect(await screen.findByText(/la ficha o el excedente ya cambió/)).toBeVisible();
    await waitFor(() => expect(usageReads).toBe(2));
    expect(await screen.findByText("La academia está dentro de los límites del plan.")).toBeVisible();
    expect(onPolicyChanged).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    window.removeEventListener("zaltyko:plan-usage-changed", onPolicyChanged);
  });
  it("no transforma una respuesta rechazada en uso vacío ni en datos de ejemplo", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false }) });
    render(<OwnerPlanUsage organizationId={org} />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByText("La academia está dentro de los límites del plan.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo de ficha")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("permite cancelar sin POST y devuelve el foco a la ficha elegida", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "20000000-0000-4000-8000-000000000001", name: "Gimnasta de prueba A" }] }));
    render(<OwnerPlanUsage organizationId={org} />);
    const choose = await screen.findByRole("button", { name: "Elegir para archivar: Gimnasta de prueba A" });
    fireEvent.click(choose);
    expect(screen.getByRole("group", { name: "Confirmar archivo de Gimnasta de prueba A" })).toBeVisible();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveFocus();
    expect(screen.getByRole("button", { name: "Confirmar archivo" })).toBeDisabled();
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "Confirmar archivo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar selección" }));
    expect(choose).toHaveFocus();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(choose);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmar archivo" })).toBeDisabled();
  });

  it("Escape cancela la selección sin archivar ni cambiar de página", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "20000000-0000-4000-8000-000000000001", name: "Grupo de prueba" }] }));
    render(<OwnerPlanUsage organizationId={org} />);
    const choose = await screen.findByRole("button", { name: "Elegir para archivar: Grupo de prueba" });
    fireEvent.click(choose);
    fireEvent.keyDown(screen.getByRole("checkbox"), { key: "Escape" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(choose).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("elegir otra ficha exige confirmar de nuevo", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "20000000-0000-4000-8000-000000000001", name: "A" }, { id: "20000000-0000-4000-8000-000000000002", name: "B" }] }));
    render(<OwnerPlanUsage organizationId={org} />);
    const choose = await screen.findByRole("button", { name: "Elegir para archivar: A" });
    await waitFor(() => expect(choose).toBeEnabled());
    fireEvent.click(choose);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Elegir para archivar: B" }));
    expect(screen.getByRole("group", { name: "Confirmar archivo de B" })).toBeVisible();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("checkbox")).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("conserva el contrato de archivo explícito e impide cancelar una petición en curso", async () => {
    let finish!: (value: ReturnType<typeof success>) => void;
    fetchMock.mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "20000000-0000-4000-8000-000000000001", name: "A" }] }))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue(success());
    render(<OwnerPlanUsage organizationId={org} />);
    const choose = await screen.findByRole("button", { name: "Elegir para archivar: A" });
    await waitFor(() => expect(choose).toBeEnabled());
    fireEvent.click(choose);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    expect(screen.getByRole("button", { name: "Cancelar selección" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("group", { name: "Confirmar archivo de A" }), { key: "Escape" });
    expect(screen.getByRole("group", { name: "Confirmar archivo de A" })).toBeVisible();
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/v1/owner/saas/usage");
    expect(options.method).toBe("POST");
    expect(options.headers["idempotency-key"]).toMatch(/^archive-/);
    expect(JSON.parse(options.body)).toEqual({ organizationId: org, resource: "athletes", resourceId: "20000000-0000-4000-8000-000000000001", confirmArchive: true });
    await act(async () => { finish(success()); });
    await waitFor(() => expect(screen.queryByRole("checkbox")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });

  it("no muestra fichas de la academia anterior, ni antes de ejecutar el nuevo efecto", async () => {
    const frames: string[] = [];
    function Probe({ organizationId }: { organizationId: string }) {
      useLayoutEffect(() => { frames.push(document.body.textContent ?? ""); }, [organizationId]);
      return null;
    }
    function View({ organizationId }: { organizationId: string }) {
      return <><OwnerPlanUsage organizationId={organizationId} /><Probe organizationId={organizationId} /></>;
    }
    fetchMock.mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "old", name: "Ficha de academia A" }] }))
      .mockImplementationOnce(() => new Promise(() => {}));
    const view = render(<View organizationId={org} />);
    expect(await screen.findByRole("button", { name: "Elegir para archivar: Ficha de academia A" })).toBeVisible();
    view.rerender(<View organizationId="10000000-0000-4000-8000-000000000002" />);
    expect(frames.at(-1)).not.toContain("Ficha de academia A");
    expect(frames.at(-1)).not.toContain("La academia está dentro de los límites");
    expect(screen.getByRole("status")).toHaveTextContent("Consultando el uso");
    expect(screen.queryByRole("button", { name: /Elegir para archivar/ })).not.toBeInTheDocument();
  });

  it("ignora JSON tardío de otra academia después de abortar su lectura", async () => {
    let resolveOld!: (value: unknown) => void;
    const old = new Promise(resolve => { resolveOld = resolve; });
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => old })
      .mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "new", name: "Ficha de academia B" }] }));
    const view = render(<OwnerPlanUsage organizationId={org} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = fetchMock.mock.calls[0][1].signal;
    view.rerender(<OwnerPlanUsage organizationId="10000000-0000-4000-8000-000000000002" />);
    expect(await screen.findByRole("button", { name: "Elegir para archivar: Ficha de academia B" })).toBeVisible();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveOld({ ok: true, data: { ...usage, items: [{ id: "old", name: "Ficha antigua" }] } }); });
    expect(screen.queryByRole("button", { name: /Ficha antigua/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ficha de academia B/ })).toBeVisible();
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });

  it.each([false, true])("no muestra el error anterior en el primer commit de otra academia (compact=%s)", async compact => {
    const frames: string[] = [];
    function Probe({ organizationId }: { organizationId: string }) {
      useLayoutEffect(() => { frames.push(document.body.textContent ?? ""); }, [organizationId]);
      return null;
    }
    function View({ organizationId }: { organizationId: string }) {
      return <><OwnerPlanUsage organizationId={organizationId} compact={compact} /><Probe organizationId={organizationId} /></>;
    }
    fetchMock.mockRejectedValueOnce(new Error("offline academy A"))
      .mockImplementationOnce(() => new Promise(() => {}));
    const view = render(<View organizationId={org} />);
    expect(await screen.findByRole(compact ? "status" : "alert")).toHaveTextContent("No se ha podido comprobar");
    view.rerender(<View organizationId="10000000-0000-4000-8000-000000000002" />);
    expect(frames.at(-1)).not.toContain("No se ha podido comprobar");
    expect(screen.queryByRole("button", { name: "Volver a consultar el uso" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });

  it("volver a una academia exige otra lectura y no recupera su selección ni confirmación antiguas", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "old", name: "Ficha A" }] }))
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(success({ ...athleteExcessUsage, items: [{ id: "new", name: "Ficha A nueva lectura" }] }));
    const view = render(<OwnerPlanUsage organizationId={org} />);
    const choose = await screen.findByRole("button", { name: "Elegir para archivar: Ficha A" });
    await waitFor(() => expect(choose).toBeEnabled());
    fireEvent.click(choose);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Confirmar archivo" })).toBeEnabled();
    view.rerender(<OwnerPlanUsage organizationId="10000000-0000-4000-8000-000000000002" />);
    view.rerender(<OwnerPlanUsage organizationId={org} />);
    expect(await screen.findByRole("button", { name: "Elegir para archivar: Ficha A nueva lectura" })).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elegir para archivar: Ficha A nueva lectura" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmar archivo" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });

  it.each([
    { resources: [{ resource: "athletes", current: 0, limit: 30, excess: 0 }] },
    { resources: usage.resources.map(item => ({ ...item, current: "0" })) },
    { items: [{ id: "broken", name: { unsafe: true } }] },
    { next: {} },
  ])("una respuesta incompleta no habilita archivo ni afirma límites comprobados %j", async override => {
    fetchMock.mockResolvedValueOnce(success({ ...usage, ...override }));
    render(<OwnerPlanUsage organizationId={org} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha podido comprobar el uso");
    expect(screen.queryByRole("button", { name: /Elegir para archivar/ })).not.toBeInTheDocument();
    expect(screen.queryByText("La academia está dentro de los límites del plan.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("una respuesta malformada compacta se anuncia como lectura fallida", async () => {
    fetchMock.mockResolvedValueOnce(success({ ...usage, resources: [] }));
    render(<OwnerPlanUsage organizationId={org} compact />);
    expect(await screen.findByRole("status")).toHaveTextContent("No se ha podido comprobar");
    expect(screen.getByRole("button", { name: "Volver a consultar el uso" })).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
