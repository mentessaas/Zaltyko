// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerEnrollmentsManager } from "@/components/owner-dashboard/OwnerEnrollmentsManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const organizationId = "10000000-0000-4000-8000-000000000001";
const locationA = "10000000-0000-4000-8000-000000000002";
const locationB = "10000000-0000-4000-8000-000000000003";
const classA = "10000000-0000-4000-8000-000000000004";
const classB = "10000000-0000-4000-8000-000000000005";
const classBase = { programId: null, programName: null, programKind: null, capacity: 10, spaceCapacity: null, effectiveFrom: "2026-10-01", effectiveTo: null, occupied: 0, availableSeats: 10 };
const bundle: Parameters<typeof OwnerEnrollmentsManager>[0]["bundle"] = {
  organization: { id: organizationId, name: "Academia sintética", defaultCurrency: "EUR" },
  member: { id: "synthetic-member", role: "owner", locationScopeMode: "all" },
  locations: [{ id: locationA, name: "Sede A", timezone: "Europe/Madrid" }, { id: locationB, name: "Sede B", timezone: "Europe/Madrid" }],
  programs: [],
  classes: [{ ...classBase, id: classA, name: "Clase A", locationId: locationA, locationName: "Sede A" }, { ...classBase, id: classB, name: "Clase B", locationId: locationB, locationName: "Sede B" }],
  enrollments: [], totalsByStatus: {}, total: 0, page: 1, pages: 1, pageSize: 50,
  selectedLocationId: locationA, filterLocationId: null,
  localTodayByLocation: { [locationA]: "2026-10-22", [locationB]: "2026-10-22" },
};
const fetchMock = vi.fn();
const response = (payload: unknown, ok = true) => ({ ok, json: async () => payload });
const candidatePayload = (name: string) => ({ ok: true, data: { items: [{ id: "10000000-0000-4000-8000-000000000099", name }] } });
const pricePayload = (site = locationA, name = "Tarifa A") => ({ ok: true, data: { organizationId, locationId: site, items: [{ id: `price-${site}`, name, amountCents: 3500, currency: "EUR", cadence: "monthly" }] } });
type FetchOptions = { method?: string; body?: string; headers?: Record<string, string> };
function confirmedEnrollmentResponse(options: FetchOptions) {
  const body = JSON.parse(options.body ?? "{}") as { startsOn?: string; pricePlanId?: string | null };
  return {
    ...response({
      ok: true,
      data: {
        id: "10000000-0000-4000-8000-000000000007",
        status: "pending",
        startsOn: body.startsOn,
        pricePlanId: body.pricePlanId,
        version: 1,
        commandReceipt: {
          body: options.body,
          idempotencyKey: options.headers?.["idempotency-key"],
        },
      },
    }),
    status: 201,
  };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(251); }); }
function search(value: string) { fireEvent.change(screen.getByRole("searchbox"), { target: { value } }); }
function candidateCalls() { return fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/v1/owner/enrollments?")); }

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset(); router.push.mockReset(); router.refresh.mockReset();
  window.sessionStorage.clear();
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
  fetchMock.mockImplementation(async (url: string) => url.startsWith("/api/v1/owner/price-plans/options?")
    ? response(pricePayload(new URL(url, "https://synthetic.invalid").searchParams.get("locationId")!))
    : response({ ok: true, data: { items: [] } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("consultas de inscripción sin respuestas obsoletas", () => {
  it("ajusta la fecha al periodo de una clase futura seleccionada", async () => {
    const futureClass = {
      ...classBase,
      id: "10000000-0000-4000-8000-000000000006",
      name: "Clase futura",
      locationId: locationA,
      locationName: "Sede A",
      effectiveFrom: "2026-11-01",
      effectiveTo: "2027-06-30",
    };
    render(
      <OwnerEnrollmentsManager
        bundle={{ ...bundle, classes: [...bundle.classes, futureClass] }}
        selectedStatus="all"
      />
    );
    await tick();

    const date = screen.getByLabelText("Fecha de inicio");
    expect(date).toHaveValue("2026-10-22");
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), {
      target: { value: futureClass.id },
    });

    expect(date).toHaveValue("2026-11-01");
    expect(date).toHaveAttribute("min", "2026-11-01");
    expect(date).toHaveAttribute("max", "2027-06-30");
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it("envía la fecha ajustada cuando se confirma un alta para una clase futura", async () => {
    const futureClass = {
      ...classBase,
      id: "10000000-0000-4000-8000-000000000006",
      name: "Clase futura",
      locationId: locationA,
      locationName: "Sede A",
      effectiveFrom: "2026-11-01",
      effectiveTo: "2027-06-30",
    };
    const athleteId = "20000000-0000-4000-8000-000000000071";
    fetchMock.mockImplementation(async (
      url: string,
      options: { method?: string; body?: string; headers?: Record<string, string> } = {},
    ) => {
      if (options.method === "POST") {
        const body = JSON.parse(options.body ?? "{}");
        return {
          ...response({
            ok: true,
            data: {
              id: "30000000-0000-4000-8000-000000000071",
              status: "pending",
              startsOn: body.startsOn,
              pricePlanId: body.pricePlanId,
              version: 1,
              commandReceipt: {
                body: options.body,
                idempotencyKey: options.headers?.["idempotency-key"],
              },
            },
          }),
          status: 201,
        };
      }
      if (url.startsWith("/api/v1/owner/price-plans/options?")) {
        return response({ ok: true, data: { organizationId, locationId: locationA, items: [] } });
      }
      if (url.startsWith("/api/v1/owner/enrollments?")) {
        return response({ ok: true, data: { items: [{ id: athleteId, name: "Gimnasta futura" }] } });
      }
      return response({ ok: true, data: { items: [] } });
    });

    render(
      <OwnerEnrollmentsManager
        bundle={{ ...bundle, classes: [...bundle.classes, futureClass] }}
        selectedStatus="all"
      />
    );
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), {
      target: { value: futureClass.id },
    });
    search("gi");
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta futura", exact: true }));

    const date = screen.getByLabelText("Fecha de inicio");
    expect(date).toHaveValue("2026-11-01");
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);

    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));
    });
    const writes = fetchMock.mock.calls.filter(([, options]) => options.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body)).toMatchObject({
      organizationId,
      locationId: locationA,
      athleteId,
      classTemplateId: futureClass.id,
      startsOn: "2026-11-01",
      pricePlanId: null,
    });
  });
  it("un fallo de lectura no se anuncia como tarifa eliminada; la ausencia se confirma al recuperar el catálogo", async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async () => ++attempts === 1 ? response(pricePayload())
      : attempts === 2 ? response(null, false)
        : response({ ok: true, data: { organizationId, locationId: locationA, items: [] } }));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las tarifas");
    expect(screen.queryByText(/La tarifa seleccionada ya no está disponible/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar las tarifas" }));
    await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("La tarifa seleccionada ya no está disponible");
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it("si vuelve la tarifa elegida, la consulta la conserva sin pedir otra elección ni enviar un alta", async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async () => ++attempts === 2
      ? response({ ok: true, data: { organizationId, locationId: locationA, items: [] } }) : response(pricePayload()));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    await tick();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    await tick();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue(`price-${locationA}`);
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/La tarifa seleccionada ya no está disponible/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it.each([
    { catalogEmpty: false, choice: "" },
    { catalogEmpty: false, choice: "10000000-0000-4000-8000-000000000006" },
    { catalogEmpty: true, choice: "" },
  ])("una tarifa desaparecida exige elegir de nuevo sin enviar nada: %s", async ({ catalogEmpty, choice }) => {
    let attempts = 0;
    const replacement = pricePayload();
    replacement.data.items = catalogEmpty ? [] : [{ ...replacement.data.items[0], id: "10000000-0000-4000-8000-000000000006", name: "Tarifa alternativa" }];
    fetchMock.mockImplementation((url: string, options: FetchOptions) => Promise.resolve(options.method === "POST"
      ? confirmedEnrollmentResponse(options)
      : url.startsWith("/api/v1/owner/price-plans/options?")
        ? response(++attempts === 1 ? pricePayload() : replacement)
        : response(candidatePayload("Elección necesaria"))));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("el"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Elección necesaria" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    await tick();
    const tariff = screen.getByRole("combobox", { name: "Tarifa mensual" });
    expect(tariff).toHaveValue(`price-${locationA}`);
    expect(tariff).toHaveAttribute("aria-invalid", "true");
    expect(tariff).toHaveAccessibleDescription(/La tarifa seleccionada ya no está disponible/);
    expect(screen.getByRole("option", { name: "Tarifa seleccionada no disponible" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));
    expect(tariff).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    expect(router.refresh).not.toHaveBeenCalled();
    fireEvent.change(tariff, { target: { value: choice } });
    expect(tariff).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("option", { name: "Tarifa seleccionada no disponible" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    await act(async () => { fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" })); });
    const writes = fetchMock.mock.calls.filter(([, options]) => options.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body).pricePlanId).toBe(choice || null);
  });
  it("reabrir conserva la elección explícita sin tarifa y el alta envía null", async () => {
    fetchMock.mockImplementation((url: string, options: FetchOptions) => Promise.resolve(options.method === "POST"
      ? confirmedEnrollmentResponse(options)
      : url.startsWith("/api/v1/owner/price-plans/options?") ? response(pricePayload()) : response(candidatePayload("Sin tarifa elegida"))));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("si"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Sin tarifa elegida" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Tarifa mensual" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    await tick();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue("");
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    await act(async () => { fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" })); });
    const writes = fetchMock.mock.calls.filter(([, options]) => options.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body).pricePlanId).toBeNull();
  });
  it.each(["", `price-${locationA}`, "price-second"])("un error de reconsulta no borra la elección de tarifa %s", async choice => {
    let attempts = 0;
    const catalog = pricePayload();
    catalog.data.items.push({ ...catalog.data.items[0], id: "price-second", name: "Segunda tarifa" });
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.startsWith("/api/v1/owner/price-plans/options?")
      ? ++attempts === 2 ? response(null, false) : response(catalog)
      : response({ ok: true, data: { items: [] } })));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Tarifa mensual" }), { target: { value: choice } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las tarifas");
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar las tarifas" }));
    await tick();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue(choice);
    expect(attempts).toBe(3);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it("cambiar sede reinicia la elección sin tarifa y aplica el catálogo del contexto nuevo", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.includes(locationB)
      ? response(pricePayload(locationB, "Tarifa B")) : response(pricePayload())));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue(`price-${locationA}`);
    fireEvent.change(screen.getByRole("combobox", { name: "Tarifa mensual" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Sede", exact: true }), { target: { value: locationB } });
    await tick();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue(`price-${locationB}`);
    expect(screen.queryByRole("option", { name: /Tarifa A/ })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it("cerrar antes del debounce evita buscar en un formulario oculto", async () => {
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("ana");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    await tick();
    expect(candidateCalls()).toHaveLength(0);
  });
  it("cerrar aborta la búsqueda en curso y no reaparece su resultado al abrir", async () => {
    const old = deferred<unknown>();
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: unknown) => url.startsWith("/api/v1/owner/enrollments?")
      ? Promise.resolve({ ok: true, json: () => old.promise })
      : base(url, options));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("ana"); await tick();
    const signal = candidateCalls()[0][1].signal;
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    expect(signal.aborted).toBe(true);
    await act(async () => { old.resolve(candidatePayload("Ana de búsqueda cerrada")); });
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    expect(screen.queryByRole("button", { name: "Ana de búsqueda cerrada" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("ana");
  });
  it("reabrir conserva el texto pero consulta resultados nuevos sin repetición automática", async () => {
    const old = deferred<unknown>();
    const base = fetchMock.getMockImplementation()!;
    let attempts = 0;
    fetchMock.mockImplementation((url: string, options: unknown) => url.startsWith("/api/v1/owner/enrollments?")
      ? Promise.resolve(++attempts === 1 ? { ok: true, json: () => old.promise } : response(candidatePayload("Ana actualizada")))
      : base(url, options));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("ana"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    await act(async () => { old.resolve(candidatePayload("Ana antigua")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(candidateCalls()).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    expect(screen.getByRole("searchbox")).toHaveValue("ana");
    expect(screen.getByRole("searchbox")).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByRole("button", { name: "Ana antigua" })).not.toBeInTheDocument();
    await tick();
    expect(screen.getByRole("button", { name: "Ana actualizada" })).toBeVisible();
    expect(candidateCalls()).toHaveLength(2);
    expect(candidateCalls()[1][0]).toBe(candidateCalls()[0][0]);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(candidateCalls()).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("cerrar retira el error de búsqueda sin borrar el texto o la fecha", async () => {
    const base = fetchMock.getMockImplementation()!;
    let attempts = 0;
    fetchMock.mockImplementation((url: string, options: unknown) => url.startsWith("/api/v1/owner/enrollments?")
      ? Promise.resolve(++attempts === 1 ? response(null, false) : response(candidatePayload("Recuperada")))
      : base(url, options));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    fireEvent.change(screen.getByLabelText("Fecha de inicio"), { target: { value: "2026-11-03" } });
    search("ana"); await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo buscar");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("ana");
    expect(screen.getByLabelText("Fecha de inicio")).toHaveValue("2026-11-03");
    expect(screen.getByRole("combobox", { name: "Clase" })).toHaveValue(classA);
    await tick();
    expect(screen.getByRole("button", { name: "Recuperada" })).toBeVisible();
  });
  it("cerrar conserva la persona seleccionada y no vuelve a buscarla al abrir", async () => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: unknown) => url.startsWith("/api/v1/owner/enrollments?")
      ? Promise.resolve(response(candidatePayload("Selección conservada")))
      : base(url, options));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("se"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Selección conservada" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva inscripción", exact: true })[0]);
    await tick();
    expect(screen.getByText("Selección conservada")).toBeVisible();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(candidateCalls()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it("ignora la búsqueda anterior incluso si su JSON llega después de abortar", async () => {
    const old = deferred<unknown>();
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: unknown) => {
      if (url.includes("q=ana")) return Promise.resolve({ ok: true, json: () => old.promise });
      if (url.includes("q=bea")) return Promise.resolve(response(candidatePayload("Bea sintética")));
      return base(url, options);
    });
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("ana"); await tick();
    const oldSignal = candidateCalls()[0][1].signal;
    search("bea"); await tick();
    expect(oldSignal.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Bea sintética" })).toBeVisible();
    await act(async () => { old.resolve(candidatePayload("Ana obsoleta")); });
    expect(screen.queryByRole("button", { name: "Ana obsoleta" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bea sintética" })).toBeVisible();
  });
  it("una tarifa tardía de A no reemplaza la sede B ni su selección", async () => {
    const old = deferred<unknown>();
    fetchMock.mockImplementation((url: string) => url.includes(locationA)
      ? Promise.resolve({ ok: true, json: () => old.promise })
      : Promise.resolve(response(pricePayload(locationB, "Tarifa B"))));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Sede", exact: true }), { target: { value: locationB } });
    await tick();
    expect(screen.getByRole("option", { name: /Tarifa B/ })).toBeInTheDocument();
    await act(async () => { old.resolve(pricePayload(locationA, "Tarifa A obsoleta")); });
    expect(screen.queryByRole("option", { name: /Tarifa A obsoleta/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue(`price-${locationB}`);
  });
  it("datos de candidato malformados son error recuperable, no lista vacía", async () => {
    const base = fetchMock.getMockImplementation()!;
    let attempts = 0;
    fetchMock.mockImplementation((url: string, options: unknown) => {
      if (!url.startsWith("/api/v1/owner/enrollments?")) return base(url, options);
      attempts += 1;
      return Promise.resolve(response(attempts === 1 ? { ok: true, data: { items: [{ id: "x", name: {} }] } } : candidatePayload("Recuperada sintética")));
    });
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("ab"); await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo buscar.");
    expect(screen.queryByText(/No hay coincidencias/)).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(attempts).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Volver a buscar" })); await tick();
    expect(screen.getByRole("button", { name: "Recuperada sintética" })).toBeVisible();
    expect(candidateCalls()).toHaveLength(2);
    for (const [url, options] of candidateCalls()) {
      expect(url).toContain(`organizationId=${organizationId}`);
      expect(url).toContain(`locationId=${locationA}`);
      expect(url).toContain(`classTemplateId=${classA}`);
      expect(options.method).toBeUndefined(); expect(options.body).toBeUndefined();
    }
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("tarifas fallidas se reconsultan por GET solo a petición del usuario", async () => {
    fetchMock.mockResolvedValueOnce(response(null, false)).mockResolvedValueOnce(response(pricePayload()));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />); await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las tarifas mensuales.");
    expect(screen.queryByText(/No se pudo guardar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay tarifas mensuales disponibles/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar las tarifas" })); await tick();
    expect(screen.getByRole("option", { name: /Tarifa A/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) { expect(options.method).toBeUndefined(); expect(options.cache).toBe("no-store"); }
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("una respuesta de tarifas con alcance equivocado no se muestra", async () => {
    fetchMock.mockResolvedValueOnce(response(pricePayload(locationB, "Tarifa ajena")));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />); await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las tarifas");
    expect(screen.queryByRole("option", { name: /Tarifa ajena/ })).not.toBeInTheDocument();
  });
  it("cero candidatos confirmado muestra ausencia de coincidencias sin afirmar un error", async () => {
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />); await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("zz"); await tick();
    const noMatchesMessage = screen.getByText(
      "No hay coincidencias en esta sede. Si falta la ficha, créala desde Grupos."
    );
    const noMatchesStatus = noMatchesMessage.closest('[role="status"]');
    expect(noMatchesStatus).not.toBeNull();
    expect(noMatchesStatus!).toHaveTextContent("No hay coincidencias en esta sede.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Volver a buscar" })).not.toBeInTheDocument();
  });
  it("no crea una inscripción mientras la consulta de tarifas sigue pendiente", async () => {
    const pending = deferred<unknown>();
    fetchMock.mockImplementation((url: string) => url.startsWith("/api/v1/owner/price-plans/options?")
      ? Promise.resolve({ ok: true, json: () => pending.promise })
      : Promise.resolve(response(candidatePayload("Gimnasta sintética"))));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("gi"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta sintética", exact: true }));
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(pricePayload()); });
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it("un error de tarifas no se convierte en un alta sin tarifa", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.startsWith("/api/v1/owner/price-plans/options?")
      ? response(null, false)
      : response(candidatePayload("Gimnasta sintética"))));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("gi"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta sintética", exact: true }));
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" }));
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("reconsultar tarifas recupera el formulario sin enviar el alta automáticamente", async () => {
    let priceAttempts = 0;
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.startsWith("/api/v1/owner/price-plans/options?")
      ? ++priceAttempts === 1 ? response(null, false) : response(pricePayload())
      : response(candidatePayload("Gimnasta sintética"))));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("gi"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta sintética", exact: true }));
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar las tarifas" }));
    await tick();
    expect(priceAttempts).toBe(2);
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeEnabled();
    expect(screen.queryByText(/primero debe completarse la consulta/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("permite el alta sin tarifa tras una lista vacía confirmada, solo mediante envío explícito", async () => {
    fetchMock.mockImplementation((url: string, options: FetchOptions) => Promise.resolve(options.method === "POST"
      ? confirmedEnrollmentResponse(options)
      : url.startsWith("/api/v1/owner/price-plans/options?")
        ? response({ ok: true, data: { organizationId, locationId: locationA, items: [] } })
        : response(candidatePayload("Gimnasta sintética"))));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("gi"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta sintética", exact: true }));
    const submit = screen.getByRole("button", { name: "Registrar inscripción pendiente" });
    expect(submit).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue("");
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    await act(async () => { fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" })); });
    const writes = fetchMock.mock.calls.filter(([, options]) => options.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body)).toMatchObject({ organizationId, locationId: locationA, pricePlanId: null });
    expect(router.refresh).toHaveBeenCalledOnce();
  });
  it("retira las tarifas anteriores mientras carga una nueva sede", async () => {
    const pending = deferred<unknown>();
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.includes(locationB)
      ? { ok: true, json: () => pending.promise }
      : response(pricePayload())));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    expect(screen.getByRole("option", { name: /Tarifa A/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Sede", exact: true }), { target: { value: locationB } });
    await tick();
    expect(screen.queryByRole("option", { name: /Tarifa A/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toBeDisabled();
    expect(screen.queryByText(/No hay tarifas mensuales disponibles/)).not.toBeInTheDocument();
    await act(async () => { pending.resolve(pricePayload(locationB, "Tarifa B")); });
    expect(screen.getByRole("option", { name: /Tarifa B/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toBeEnabled();
  });
  it("respeta elegir sin tarifa aunque existan opciones confirmadas", async () => {
    fetchMock.mockImplementation((url: string, options: FetchOptions) => Promise.resolve(options.method === "POST"
      ? confirmedEnrollmentResponse(options)
      : url.startsWith("/api/v1/owner/price-plans/options?")
        ? response(pricePayload())
        : response(candidatePayload("Gimnasta sintética"))));
    render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("gi"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta sintética", exact: true }));
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveValue(`price-${locationA}`);
    fireEvent.change(screen.getByRole("combobox", { name: "Tarifa mensual" }), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeEnabled();
    await act(async () => { fireEvent.submit(screen.getByRole("form", { name: "Crear inscripción" })); });
    const writes = fetchMock.mock.calls.filter(([, options]) => options.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body).pricePlanId).toBeNull();
    expect(router.refresh).toHaveBeenCalledOnce();
  });
  it("al cambiar academia reinicia el borrador y consulta solo la sede nueva", async () => {
    const otherOrg = "20000000-0000-4000-8000-000000000001";
    const otherSite = "20000000-0000-4000-8000-000000000002";
    const otherClass = "20000000-0000-4000-8000-000000000003";
    const nextBundle = {
      ...bundle, organization: { ...bundle.organization, id: otherOrg, name: "Otra academia" },
      locations: [{ id: otherSite, name: "Otra sede", timezone: "Europe/Madrid" }],
      classes: [{ ...classBase, id: otherClass, name: "Otra clase", locationId: otherSite, locationName: "Otra sede" }],
      selectedLocationId: otherSite, localTodayByLocation: { [otherSite]: "2026-10-23" },
    };
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.startsWith("/api/v1/owner/enrollments?")
      ? response(candidatePayload("Gimnasta anterior"))
      : response({ ok: true, data: { organizationId: new URL(url, "https://synthetic.invalid").searchParams.get("organizationId"), locationId: new URL(url, "https://synthetic.invalid").searchParams.get("locationId"), items: [] } })));
    const view = render(<OwnerEnrollmentsManager bundle={bundle} selectedStatus="all" />);
    await tick();
    fireEvent.change(screen.getByRole("combobox", { name: "Clase" }), { target: { value: classA } });
    search("gi"); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta anterior" }));
    fireEvent.change(screen.getByLabelText("Fecha de inicio"), { target: { value: "2026-11-04" } });
    const firstCallCount = fetchMock.mock.calls.length;
    view.rerender(<OwnerEnrollmentsManager bundle={nextBundle} selectedStatus="all" />);
    expect(screen.queryByText("Gimnasta anterior")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sede", exact: true })).toHaveValue(otherSite);
    expect(screen.getByRole("combobox", { name: "Clase" })).toHaveValue("");
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByLabelText("Fecha de inicio")).toHaveValue("2026-10-23");
    await tick();
    const newCalls = fetchMock.mock.calls.slice(firstCallCount);
    expect(newCalls).toHaveLength(1);
    const query = new URL(newCalls[0][0], "https://synthetic.invalid").searchParams;
    expect(query.get("organizationId")).toBe(otherOrg);
    expect(query.get("locationId")).toBe(otherSite);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
});
