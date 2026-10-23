// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerEnrollmentsManager } from "@/components/owner-dashboard/OwnerEnrollmentsManager";
import {
  clearPendingEnrollmentIntent,
  persistPendingEnrollmentIntent,
} from "@/components/owner-dashboard/owner-enrollment-command-response";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
type Bundle = Parameters<typeof OwnerEnrollmentsManager>[0]["bundle"];
const org = "10000000-0000-4000-8000-000000000001";
const otherOrg = "10000000-0000-4000-8000-000000000011";
const site = "10000000-0000-4000-8000-000000000002";
const classId = "10000000-0000-4000-8000-000000000003";
const pricePlanId = "10000000-0000-4000-8000-000000000016";
const enrollment: Bundle["enrollments"][number] = {
  id: "10000000-0000-4000-8000-000000000004", athleteId: "10000000-0000-4000-8000-000000000005",
  givenName: "Ana", familyName: "Sintética", preferredName: null, athleteName: "Ana Sintética",
  status: "active", startsOn: "2026-10-01", endsOn: null, version: 2,
  classTemplateId: classId, className: "Clase sintética", locationId: site, locationName: "Sede sintética", programName: null,
};
const bundle: Bundle = {
  organization: { id: org, name: "Academia sintética", defaultCurrency: "EUR" },
  member: { id: "synthetic-member", role: "owner", locationScopeMode: "all" },
  locations: [{ id: site, name: "Sede sintética", timezone: "Europe/Madrid" }], programs: [],
  classes: [{ id: classId, name: "Clase sintética", locationId: site, locationName: "Sede sintética", programId: null, programName: null, programKind: null, capacity: 10, spaceCapacity: null, effectiveFrom: "2026-10-01", effectiveTo: null, occupied: 0, availableSeats: 10 }],
  enrollments: [enrollment], totalsByStatus: { active: 1 }, total: 1, page: 2, pages: 3, pageSize: 50,
  selectedLocationId: site, filterLocationId: null, localTodayByLocation: { [site]: "2026-10-22" },
};
const fetchMock = vi.fn();
function response(payload: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => payload }; }
function ack(status = "paused", id = enrollment.id) { return response({ ok: true, data: { id, status, startsOn: "2026-10-01", version: 3, ...(status === "pending" ? { pricePlanId: null } : { endsOn: null }) } }); }
function mutations() { return fetchMock.mock.calls.filter(([, options]) => options.method === "POST" || options.method === "PATCH"); }
function pause() { fireEvent.click(screen.getByRole("button", { name: /^Pausar inscripción de Ana/ })); }
function leavingPageIsPrevented() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
function reads(url: string) {
  if (url.startsWith("/api/v1/owner/price-plans/options?")) return response({ ok: true, data: { organizationId: org, locationId: site, items: [{ id: pricePlanId, name: "Tarifa sintética", amountCents: 3500, currency: "EUR", cadence: "monthly" }] } });
  return response({ ok: true, data: { items: [{ id: enrollment.athleteId, name: "Ana Sintética" }] } });
}
beforeEach(() => { fetchMock.mockReset(); router.push.mockReset(); router.refresh.mockReset(); window.sessionStorage.clear(); vi.stubGlobal("fetch", fetchMock); publishOwnerPlanUsage(org, { readOnly: false, planCode: "free" }); });
afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("intención de inscripción inmutable en la página abierta", () => {
  it("en solo lectura conserva el listado y bloquea altas y cambios de estado", async () => {
    publishOwnerPlanUsage(org, { readOnly: true, planCode: "free" });
    fetchMock.mockImplementation(async url => reads(url));
    const user = userEvent.setup();
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" previewCreateForm />);

    expect(screen.getByText(/La academia está en solo lectura/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Uso y regularización" })).toHaveAttribute("href", `/owner/subscription?organizationId=${org}#regularizar`);
    expect(screen.getByText("Clase sintética")).toBeVisible();
    const closeForm = screen.getByRole("button", { name: "Cerrar formulario" });
    await waitFor(() => expect(closeForm).toBeEnabled());
    await waitFor(() => expect(screen.getByRole("button", { name: /^Pausar inscripción de Ana/ })).toBeDisabled());

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/v1/owner/price-plans/options?"))).toBe(true));
    await waitFor(() => expect(screen.getByLabelText("Tarifa mensual")).toBeEnabled());
    expect(screen.getByText("Gimnasta Ejemplo A")).toBeVisible();
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/v1/owner/price-plans/options?"))).toBe(true);
    expect(mutations()).toHaveLength(0);
  });

  it("bloquea si falla getItem y desbloquea al volver a leer una academia vacía", async () => {
    const storageKey = `zaltyko:pending-enrollment-command:v1:${org}`;
    const originalGetItem = Storage.prototype.getItem;
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (key) {
      if (key === storageKey) throw new DOMException("Read denied", "SecurityError");
      return originalGetItem.call(this, key);
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    window.sessionStorage.setItem("synthetic-storage-probe", "available");
    expect(window.sessionStorage.getItem("synthetic-storage-probe")).toBe("available");
    setItem.mockClear();
    fetchMock.mockImplementation(async url => reads(url));
    const empty = { ...bundle, enrollments: [], total: 0, page: 1, pages: 1 };
    render(<OwnerEnrollmentsManager bundle={empty} selectedStatus="all" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo leer el almacenamiento de sesión");
    expect(screen.getByRole("button", { name: "Cerrar formulario" })).toBeDisabled();
    expect(mutations()).toHaveLength(0);
    expect(setItem).not.toHaveBeenCalled();

    getItem.mockRestore();
    const recoveredGetItem = vi.spyOn(Storage.prototype, "getItem");
    fireEvent.click(screen.getByRole("button", { name: "Volver a comprobar almacenamiento" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(recoveredGetItem).toHaveBeenCalledWith(storageKey);
    expect(screen.getByRole("button", { name: "Cerrar formulario" })).toBeEnabled();
    expect(mutations()).toHaveLength(0);
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    recoveredGetItem.mockRestore();
    setItem.mockRestore();
  });

  it("conserva un PATCH confirmado hasta poder limpiar y reintenta el mismo cuerpo y clave", async () => {
    const storageKey = `zaltyko:pending-enrollment-command:v1:${org}`;
    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (key) {
      if (key === storageKey) throw new DOMException("Storage denied", "SecurityError");
      return originalRemoveItem.call(this, key);
    });
    fetchMock.mockImplementation(async (url, options) => options.method === "PATCH" ? ack() : reads(url));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo quitar la operación guardada");
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
    const firstRequest = mutations()[0];
    const originalSnapshot = window.sessionStorage.getItem(storageKey);
    expect(originalSnapshot).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Pausar inscripción de Ana/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Dar de baja inscripción de Ana/ }));
    expect(mutations()).toHaveLength(1);

    removeItem.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Volver a comprobar almacenamiento" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(window.sessionStorage.getItem(storageKey)).toBe(originalSnapshot);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());

    expect(mutations()).toHaveLength(2);
    expect(mutations()[1]).toEqual(firstRequest);
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    expect(screen.queryByRole("region", { name: "Operación de inscripción pendiente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva inscripción", exact: true })).toBeEnabled();
  });

  it("una fecha imposible en el acuse conserva el comando hasta recibir una confirmación válida", async () => {
    let count = 0;
    fetchMock.mockImplementation(async (url, options) => options.method !== "PATCH" ? reads(url) : ++count === 1
      ? response({ ok: true, data: { id: enrollment.id, status: "paused", startsOn: "2026-02-29", endsOn: null, version: 3 } }) : ack());
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    await screen.findByRole("button", { name: "Reintentar la misma operación" });
    expect(router.refresh).not.toHaveBeenCalled();
    expect(leavingPageIsPrevented()).toBe(true);
    expect(screen.getByRole("button", { name: "Nueva inscripción", exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(mutations()).toHaveLength(2);
    expect(mutations()[1]).toEqual(mutations()[0]);
    expect(leavingPageIsPrevented()).toBe(false);
  });
  it("no envía ni sobrescribe una intención si falla su persistencia previa", async () => {
    const storageKey = `zaltyko:pending-enrollment-command:v1:${org}`;
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (key === storageKey) throw new DOMException("Quota exceeded", "QuotaExceededError");
      return originalSetItem.call(this, key, value);
    });
    fetchMock.mockImplementation(async url => reads(url));
    const empty = { ...bundle, enrollments: [], total: 0, page: 1, pages: 1 };
    render(<OwnerEnrollmentsManager bundle={empty} selectedStatus="all" />);
    await screen.findByRole("option", { name: /Tarifa sintética/ });
    fireEvent.change(screen.getByRole("combobox", { name: "Clase", exact: true }), { target: { value: classId } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ana" } });
    fireEvent.click(await screen.findByRole("button", { name: "Ana Sintética", exact: true }));
    fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha enviado ni se sobrescribirá ninguna operación");
    expect(screen.getByRole("button", { name: "Nueva inscripción", exact: true })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));
    expect(mutations()).toHaveLength(0);
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("bloquea un borrador almacenado con ruta incompatible", async () => {
    const storageKey = `zaltyko:pending-enrollment-command:v1:${org}`;
    window.sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, intent: {
      organizationId: org, kind: "create", key: "synthetic-key-001",
      endpoint: "https://attacker.invalid/collect", method: "POST",
      body: JSON.stringify({ organizationId: org, locationId: site, athleteId: enrollment.athleteId, classTemplateId: classId, startsOn: "2026-10-22", pricePlanId: null }),
      description: "Operación sintética",
    } }));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("no se puede validar con seguridad");
    expect(screen.getByRole("button", { name: "Nueva inscripción", exact: true })).toBeDisabled();
    expect(mutations()).toHaveLength(0);
    expect(window.sessionStorage.getItem(storageKey)).toContain("attacker.invalid");
  });

  it.each([
    [401, { status: 401, type: "https://zaltyko.com/problems/authentication-required", title: "Acceso", detail: "Accede de nuevo" }],
    [403, { status: 403, type: "https://zaltyko.com/problems/forbidden", title: "Acceso", detail: "Sin permiso" }],
    [409, { status: 409, type: "https://zaltyko.com/problems/version-conflict", title: "Versión", detail: "Versión nueva" }],
    [409, { status: 409, type: "https://zaltyko.com/problems/plan-over-capacity", title: "Plan", detail: "Sin capacidad" }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: "Espera" }],
  ])("un rechazo posterior %s no descarta una transición previamente incierta", async (status, rejection) => {
    let count = 0;
    fetchMock.mockImplementation(async (url, options) => {
      if (options.method !== "PATCH") return reads(url);
      if (++count === 1) throw new Error("Synthetic lost acknowledgement");
      return count === 2 ? response(rejection, Number(status)) : ack();
    });
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause(); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled());
    expect(leavingPageIsPrevented()).toBe(true);
    expect(screen.getByRole("button", { name: "Nueva inscripción", exact: true })).toBeDisabled();
    expect(mutations()).toHaveLength(2); expect(mutations()[1]).toEqual(mutations()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(mutations()[2]).toEqual(mutations()[0]); expect(leavingPageIsPrevented()).toBe(false);
  });

  it("avisa durante la transición y deja de avisar tras un acuse válido", async () => {
    let finish!: (value: ReturnType<typeof ack>) => void;
    fetchMock.mockImplementation(async (url, options) => options.method === "PATCH" ? new Promise(resolve => { finish = resolve; }) : reads(url));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    expect(leavingPageIsPrevented()).toBe(false);
    pause();
    expect(leavingPageIsPrevented()).toBe(true);
    await act(async () => { finish(ack()); });
    expect(leavingPageIsPrevented()).toBe(false);
    expect(mutations()).toHaveLength(1);
  });

  it("conserva el aviso de una transición incierta al cambiar de academia y limpia al desmontar", async () => {
    fetchMock.mockImplementation(async (url, options) => {
      if (options.method === "PATCH") throw new Error("lost");
      return reads(url);
    });
    const view = render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    await screen.findByRole("button", { name: "Reintentar la misma operación" });
    expect(leavingPageIsPrevented()).toBe(true);
    view.rerender(<OwnerEnrollmentsManager bundle={{ ...bundle, organization: { ...bundle.organization, id: "other-org" } }} selectedStatus="all" />);
    expect(leavingPageIsPrevented()).toBe(true);
    expect(mutations()).toHaveLength(1);
    view.unmount();
    expect(leavingPageIsPrevented()).toBe(false);
  });

  it("PATCH conserva fecha, versión, id y clave aunque cambien los props", async () => {
    let count = 0;
    fetchMock.mockImplementation(async (url, options) => options.method === "PATCH" && ++count === 1 ? Promise.reject(new Error("lost")) : options.method === "PATCH" ? ack() : reads(url));
    const view = render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toHaveFocus();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Nueva inscripción", exact: true })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Filtrar por estado" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Siguiente:/ })).not.toBeInTheDocument();
    view.unmount();
    render(<OwnerEnrollmentsManager bundle={{ ...bundle, enrollments: [{ ...enrollment, version: 8, status: "paused" }], localTodayByLocation: { [site]: "2026-10-23" } }} selectedStatus="all" />);
    await screen.findByRole("button", { name: "Reintentar la misma operación" });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(mutations()).toHaveLength(2);
    expect(mutations()[1]).toEqual(mutations()[0]);
    expect(JSON.parse(mutations()[1][1].body)).toEqual({ organizationId: org, expectedVersion: 2, toStatus: "paused", effectiveOn: "2026-10-22" });
  });

  it.each([
    () => response({ ok: true }, 200),
    () => response({ ok: true, data: { id: "other", status: "paused", version: 3, startsOn: "2026-10-01" } }),
    () => response(null, 503),
    () => response({ status: 408, type: "https://zaltyko.com/problems/timeout", title: "Timeout", detail: "Timeout" }, 408),
    () => response({ status: 409, type: "https://zaltyko.com/problems/idempotency-conflict", title: "Conflicto", detail: "Conflicto" }, 409),
    () => response({ status: 409, type: "https://zaltyko.com/problems/new-error", title: "Error", detail: "Error" }, 409),
    () => response({ status: 403, type: "https://zaltyko.com/problems/version-conflict", title: "Error", detail: "Error" }, 403),
  ])("no afirma éxito ni libera la intención ante respuesta incierta %#", async failure => {
    let count = 0;
    fetchMock.mockImplementation(async (url, options) => options.method === "PATCH" ? ++count === 1 ? failure() : ack() : reads(url));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(mutations()[1]).toEqual(mutations()[0]);
  });

  it("un rechazo Problem libera edición sin reintento automático", async () => {
    fetchMock.mockResolvedValue(response({ status: 409, type: "https://zaltyko.com/problems/version-conflict", title: "Conflicto", detail: "Actualiza la ficha" }, 409));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    expect(await screen.findByRole("alert")).toHaveTextContent("Actualiza la ficha");
    expect(leavingPageIsPrevented()).toBe(false);
    expect(screen.queryByRole("button", { name: "Reintentar la misma operación" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pausar inscripción/ })).toBeEnabled();
    expect(mutations()).toHaveLength(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("la vista de ejemplo no envía operaciones ni consultas", () => {
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" previewMode />);
    expect(leavingPageIsPrevented()).toBe(false);
    expect(screen.queryByRole("button", { name: /^Pausar inscripción/ })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un doble click síncrono no inicia otra escritura", async () => {
    let resolve!: (value: ReturnType<typeof ack>) => void;
    fetchMock.mockImplementation(async (_url, options) => options.method === "PATCH" ? new Promise(done => { resolve = done; }) : ack());
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    const button = screen.getByRole("button", { name: /^Pausar inscripción/ });
    act(() => { button.click(); button.click(); });
    expect(mutations()).toHaveLength(1);
    await act(async () => { resolve(ack()); });
  });

  it("no reenvía la intención al cambiar a otra academia", async () => {
    let count = 0;
    fetchMock.mockImplementation(async (url, options) => options.method === "PATCH" && ++count === 1 ? Promise.reject(new Error("lost")) : options.method === "PATCH" ? ack() : reads(url));
    const view = render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause(); await screen.findByRole("button", { name: "Reintentar la misma operación" });
    view.rerender(<OwnerEnrollmentsManager bundle={{ ...bundle, organization: { ...bundle.organization, id: "other-org" } }} selectedStatus="all" />);
    expect(screen.queryByRole("button", { name: "Reintentar la misma operación" })).not.toBeInTheDocument();
    expect(screen.getByText(/Vuelve a la academia de esa operación/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Operación de inscripción pendiente" })).queryByText(/Ana Sintética/)).not.toBeInTheDocument();
    expect(leavingPageIsPrevented()).toBe(true);
    expect(screen.getByRole("button", { name: /^Pausar inscripción/ })).toBeDisabled();
    expect(mutations()).toHaveLength(1);
    view.rerender(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(mutations()[1]).toEqual(mutations()[0]);
  });

  it("POST mantiene el alta original pese a cambios de capacidad y fecha", async () => {
    let count = 0;
    fetchMock.mockImplementation(async (url, options) => options.method === "POST" ? ++count === 1 ? Promise.reject(new Error("lost after mock commit")) : response({ ok: true, data: { id: "10000000-0000-4000-8000-000000000006", status: "pending", startsOn: "2026-10-22", pricePlanId, version: 3, commandReceipt: { idempotencyKey: options.headers["idempotency-key"], body: options.body } } }, 201) : reads(url));
    const empty = { ...bundle, enrollments: [], total: 0, page: 1, pages: 1 };
    const view = render(<OwnerEnrollmentsManager bundle={empty} selectedStatus="all" />);
    await screen.findByRole("option", { name: /Tarifa sintética/ });
    fireEvent.change(screen.getByRole("combobox", { name: "Clase", exact: true }), { target: { value: classId } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ana" } });
    fireEvent.click(await screen.findByRole("button", { name: "Ana Sintética", exact: true }));
    fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));
    await screen.findByRole("button", { name: "Reintentar la misma operación" });
    expect(leavingPageIsPrevented()).toBe(true);
    expect(screen.getByRole("button", { name: /^Cambiar participante:/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar formulario" })).toBeDisabled();
    // Even a programmatic repeat of the original form cannot start a new intent.
    fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));
    expect(mutations()).toHaveLength(1);
    view.unmount();
    render(<OwnerEnrollmentsManager bundle={{ ...empty, classes: empty.classes.map(item => ({ ...item, availableSeats: 0 })), localTodayByLocation: { [site]: "2026-10-23" } }} selectedStatus="all" />);
    await screen.findByRole("button", { name: "Reintentar la misma operación" });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(mutations()[1]).toEqual(mutations()[0]);
    expect(leavingPageIsPrevented()).toBe(false);
    expect(JSON.parse(mutations()[0][1].body)).toEqual({ organizationId: org, locationId: site, athleteId: enrollment.athleteId, classTemplateId: classId, startsOn: "2026-10-22", pricePlanId });
  });

  it.each([
    ["fecha", { startsOn: "2026-10-23", pricePlanId }],
    ["tarifa", { startsOn: "2026-10-22", pricePlanId: null }],
  ] as const)("un acuse de alta con %s contradictoria conserva el comando persistido", async (_field, mismatch) => {
    const empty = { ...bundle, enrollments: [], total: 0, page: 1, pages: 1 };
    fetchMock.mockImplementation(async (url, options) => options.method === "POST"
      ? response({ ok: true, data: { id: "10000000-0000-4000-8000-000000000006", status: "pending", version: 1, ...mismatch, commandReceipt: { idempotencyKey: options.headers["idempotency-key"], body: options.body } } }, 201)
      : reads(url));
    render(<OwnerEnrollmentsManager bundle={empty} selectedStatus="all" />);
    await screen.findByRole("option", { name: /Tarifa sintética/ });
    fireEvent.change(screen.getByRole("combobox", { name: "Clase", exact: true }), { target: { value: classId } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ana" } });
    fireEvent.click(await screen.findByRole("button", { name: "Ana Sintética", exact: true }));
    fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(router.refresh).not.toHaveBeenCalled();
    expect(mutations()).toHaveLength(1);
    const saved = JSON.parse(window.sessionStorage.getItem(`zaltyko:pending-enrollment-command:v1:${org}`) ?? "null");
    expect(saved?.intent?.body).toBe(mutations()[0][1].body);
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
  });

  it("un fallo del refresco local no convierte un acuse confirmado en un reintento", async () => {
    fetchMock.mockResolvedValue(ack());
    router.refresh.mockImplementationOnce(() => { throw new Error("refresh unavailable"); });
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    expect(await screen.findByRole("alert")).toHaveTextContent("La operación se confirmó");
    expect(screen.queryByRole("button", { name: "Reintentar la misma operación" })).not.toBeInTheDocument();
    expect(mutations()).toHaveLength(1);
  });
  it.each(["confirmed", "uncertain"] as const)("un resultado tardío de A no se anuncia como resultado de B: %s", async result => {
    let finish!: (value: ReturnType<typeof ack>) => void;
    fetchMock.mockImplementation(async (url, options) => options.method === "PATCH" ? new Promise(resolve => { finish = resolve; }) : reads(url));
    const view = render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    view.rerender(<OwnerEnrollmentsManager bundle={{ ...bundle, organization: { ...bundle.organization, id: "other-org" } }} selectedStatus="all" />);
    await act(async () => { finish(result === "confirmed" ? ack() : response(null, 503)); });
    expect(screen.queryByText(/Operación confirmada\. Consulta/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mutations()).toHaveLength(1);
    if (result === "confirmed") {
      expect(screen.queryByRole("region", { name: "Operación de inscripción pendiente" })).not.toBeInTheDocument();
      expect(leavingPageIsPrevented()).toBe(false);
      expect(router.refresh).toHaveBeenCalledOnce();
    } else {
      expect(screen.getByText(/Vuelve a la academia de esa operación/)).toBeVisible();
      expect(leavingPageIsPrevented()).toBe(true);
      view.rerender(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
      expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
      expect(mutations()).toHaveLength(1);
    }
  });

  it("recupera el comando pendiente de B después de que termina el envío en vuelo de A", async () => {
    let finish!: (value: ReturnType<typeof ack>) => void;
    fetchMock.mockImplementation(async (url, options) =>
      options.method === "PATCH" ? new Promise(resolve => { finish = resolve; }) : reads(url)
    );
    publishOwnerPlanUsage(otherOrg, { readOnly: false, planCode: "free" });
    const otherIntent = {
      organizationId: otherOrg,
      kind: "create" as const,
      key: "owner-enrollment:synthetic-b-pending",
      endpoint: "/api/v1/owner/enrollments",
      method: "POST" as const,
      body: JSON.stringify({
        organizationId: otherOrg,
        locationId: site,
        athleteId: "10000000-0000-4000-8000-000000000015",
        classTemplateId: classId,
        startsOn: "2026-10-22",
        pricePlanId: null,
      }),
      description: "Alta sintética pendiente de B",
    };
    expect(persistPendingEnrollmentIntent(otherIntent)).toBe(true);
    const otherStorageKey = `zaltyko:pending-enrollment-command:v1:${otherOrg}`;
    const storedOtherIntent = window.sessionStorage.getItem(otherStorageKey);
    const competingIntent = {
      ...otherIntent,
      key: "owner-enrollment:synthetic-b-different",
      description: "Otro comando sintético de B",
    };
    expect(persistPendingEnrollmentIntent(competingIntent)).toBe(false);
    expect(clearPendingEnrollmentIntent(competingIntent)).toBe(false);
    expect(window.sessionStorage.getItem(otherStorageKey)).toBe(storedOtherIntent);

    const view = render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    pause();
    expect(mutations()).toHaveLength(1);
    view.rerender(<OwnerEnrollmentsManager
      bundle={{ ...bundle, organization: { ...bundle.organization, id: otherOrg, name: "Academia B sintética" } }}
      selectedStatus="all"
    />);
    expect(screen.queryByRole("button", { name: "Reintentar la misma operación" })).not.toBeInTheDocument();

    await act(async () => { finish(ack()); });

    expect(await screen.findByText(/Alta sintética pendiente de B/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
    expect(window.sessionStorage.getItem(otherStorageKey)).toBe(storedOtherIntent);
    expect(mutations()).toHaveLength(1);
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
