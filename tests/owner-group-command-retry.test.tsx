// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";
import { PENDING_GROUP_MEMBERSHIP_STORAGE_KEY } from "@/components/owner-dashboard/owner-pending-group-membership";

const org = "30000000-0000-4000-8000-000000000001";
const site = "30000000-0000-4000-8000-000000000002";
const program = "30000000-0000-4000-8000-000000000003";
const group = "30000000-0000-4000-8000-000000000004";
const athlete = "30000000-0000-4000-8000-000000000005";
const membership = "30000000-0000-4000-8000-000000000006";
const otherOrg = "30000000-0000-4000-8000-000000000007";
const otherGroup = "30000000-0000-4000-8000-000000000008";
const today = "2026-10-22";
const baseBundle = {
  organization: { id: org, name: "Academia sintética", defaultCurrency: "EUR" },
  member: { id: "synthetic-manager", role: "manager", locationScopeMode: "all" },
  locations: [{ id: site, name: "Sede sintética", timezone: "Europe/Madrid" }],
  programs: [{ id: program, name: "Gimnasia", kind: "gymnastics_sport" }],
  groups: [{ id: group, name: "Grupo sintético", locationId: site, locationName: "Sede sintética", programId: program, programName: "Gimnasia", status: "active", capacity: 12, memberCount: 0, timezone: "Europe/Madrid" }],
  selectedGroupId: group, memberships: [], localTodayByLocation: { [site]: today },
};
type Bundle = Parameters<typeof OwnerGroupsManager>[0]["bundle"];
const bundle = baseBundle as unknown as Bundle;
const emptyGroupBundle = { ...bundle, groups: [], selectedGroupId: null } as Bundle;
const receipt = { ok: true, data: { id: membership, groupId: group, athleteId: athlete, startsOn: today, status: "active" } };
const transitionReceipt = {
  ok: true,
  data: { id: membership, groupId: group, startsOn: today, status: "paused", endsOn: null },
};
function response(status: number, payload: unknown) { return { ok: status >= 200 && status < 300, status, json: async () => payload }; }
function uncertain() { return response(409, { type: "https://zaltyko.com/problems/idempotency-conflict", status: 409, title: "Conflicto", detail: "No se puede recuperar el resultado anterior." }); }
function writes() { return mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST" || init?.method === "PATCH"); }
async function fillAthlete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
  await user.type(screen.getByLabelText("Nombre"), "Ficha");
  await user.type(screen.getByLabelText("Apellidos"), "Sintética");
}

beforeEach(() => {
  vi.clearAllMocks(); window.sessionStorage.clear();
  let sequence = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `30000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` });
  vi.stubGlobal("fetch", mocks.fetch);
  publishOwnerPlanUsage(org, { readOnly: false, planCode: "free" });
  publishOwnerPlanUsage(otherOrg, { readOnly: false, planCode: "free" });
});
afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals(); });

describe("intención inmutable en grupos", () => {
  it.each([
    response(409, { type: "https://zaltyko.com/problems/constructor", status: 409, title: "Error", detail: "No confirmado" }),
    response(201, { ...receipt, error: "OTHER_ERROR" }),
  ])("un error ajeno o un éxito contradictorio conserva cuerpo y clave (%#)", async first => {
    mocks.fetch.mockResolvedValueOnce(first).mockResolvedValueOnce(response(201, receipt));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user);
    await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));
    expect(writes()).toHaveLength(2);
    expect(writes()[1]).toEqual(writes()[0]);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("un conflicto de alta conserva cuerpo y clave, bloquea edición y permite solo reintentar", async () => {
    mocks.fetch.mockResolvedValueOnce(uncertain()).mockResolvedValueOnce(response(201, receipt));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user);
    await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    expect(screen.getByLabelText("Apellidos")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    const retry = screen.getByRole("button", { name: "Reintentar operación pendiente" });
    expect(retry).toHaveFocus();
    await user.click(retry);
    expect(writes()).toHaveLength(2);
    expect(writes()[1]).toEqual(writes()[0]);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("añadir conserva la fecha original aunque cambie el día del bundle", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { items: [{ id: athlete, name: "Ficha sintética" }] } }))
      .mockResolvedValueOnce(response(503, { detail: "Resultado no confirmado." })).mockResolvedValueOnce(response(201, receipt));
    const user = userEvent.setup();
    const view = render(<OwnerGroupsManager bundle={bundle} />);
    await user.type(screen.getByLabelText("Añadir una gimnasta"), "Ficha");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await user.click(await screen.findByRole("button", { name: "Añadir" }));
    await screen.findByRole("alert");
    view.rerender(<OwnerGroupsManager bundle={{ ...bundle, localTodayByLocation: { [site]: "2026-10-23" } }} />);
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));
    expect(writes()).toHaveLength(2);
    expect(writes()[1]).toEqual(writes()[0]);
    expect(JSON.parse(String(writes()[1][1].body)).startsOn).toBe(today);
  });
  it("restaura un add incierto tras recargar y solo reenvía manualmente el mismo cuerpo y clave", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { items: [{ id: athlete, name: "Ficha sintética" }] } }))
      .mockResolvedValueOnce(response(503, { detail: "Resultado no confirmado." }))
      .mockResolvedValueOnce(response(201, receipt));
    const user = userEvent.setup();
    const firstView = render(<OwnerGroupsManager bundle={bundle} />);
    await user.type(screen.getByLabelText("Añadir una gimnasta"), "Ficha");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await user.click(await screen.findByRole("button", { name: "Añadir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const firstRequest = writes()[0];
    expect(window.sessionStorage.getItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY)).not.toContain("Ficha sintética");
    firstView.unmount();

    const recoveredView = render(<OwnerGroupsManager bundle={bundle} />);
    expect(await screen.findByRole("button", { name: "Reintentar operación pendiente" })).toBeEnabled();
    expect(writes()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual(firstRequest);
    await waitFor(() => expect(window.sessionStorage.getItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY)).toBeNull());
    expect(await screen.findByText("Gimnasta añadida al grupo.")).toBeVisible();
    recoveredView.unmount();
  });
  it("una transición conserva estado esperado y fecha tras refrescar los datos", async () => {
    const row = { id: membership, athleteId: athlete, athleteName: "Ficha sintética", status: "active", startsOn: today };
    mocks.fetch.mockResolvedValueOnce(uncertain()).mockResolvedValueOnce(response(200, transitionReceipt));
    const user = userEvent.setup();
    const view = render(<OwnerGroupsManager bundle={{ ...bundle, memberships: [row] } as Bundle} />);
    await user.click(screen.getByRole("button", { name: "Poner en pausa a Ficha sintética" }));
    await screen.findByRole("alert");
    view.rerender(<OwnerGroupsManager bundle={{ ...bundle, localTodayByLocation: { [site]: "2026-10-23" }, memberships: [{ ...row, status: "paused" }] } as Bundle} />);
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));
    expect(writes()[1]).toEqual(writes()[0]);
    expect(JSON.parse(String(writes()[1][1].body))).toMatchObject({ expectedStatus: "active", toStatus: "paused", effectiveOn: today });
  });
  it("restaura una transición incierta tras recargar y reintenta la misma clave manualmente", async () => {
    mocks.fetch.mockResolvedValueOnce(response(503, { detail: "Resultado no confirmado." })).mockResolvedValueOnce(response(200, transitionReceipt));
    const row = { id: membership, athleteId: athlete, athleteName: "Ficha sintética", status: "active", startsOn: today };
    const props = { bundle: { ...bundle, memberships: [row] } as Bundle };
    const user = userEvent.setup();
    const firstView = render(<OwnerGroupsManager {...props} />);
    await user.click(screen.getByRole("button", { name: "Poner en pausa a Ficha sintética" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const firstRequest = writes()[0];
    expect(window.sessionStorage.getItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY)).not.toContain("Ficha sintética");
    firstView.unmount();

    const recoveredView = render(<OwnerGroupsManager {...props} />);
    expect(await screen.findByRole("button", { name: "Reintentar operación pendiente" })).toBeEnabled();
    expect(writes()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual(firstRequest);
    await waitFor(() => expect(window.sessionStorage.getItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY)).toBeNull());
    recoveredView.unmount();
  });
  it("no restaura una intención de otro ámbito y bloquea cambios hasta volver al original", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { items: [{ id: athlete, name: "Ficha sintética" }] } }))
      .mockResolvedValueOnce(response(503, { detail: "Resultado no confirmado." }))
      .mockResolvedValueOnce(response(201, receipt));
    const user = userEvent.setup();
    const original = render(<OwnerGroupsManager bundle={bundle} />);
    await user.type(screen.getByLabelText("Añadir una gimnasta"), "Ficha");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await user.click(await screen.findByRole("button", { name: "Añadir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const firstRequest = writes()[0];
    original.unmount();

    const otherBundle = {
      ...baseBundle,
      organization: { ...baseBundle.organization, id: otherOrg },
      groups: [{ ...baseBundle.groups[0], id: otherGroup }],
      selectedGroupId: otherGroup,
    } as unknown as Bundle;
    const otherView = render(<OwnerGroupsManager bundle={otherBundle} />);
    expect(await screen.findByRole("link", { name: "Volver al grupo original" })).toHaveAttribute("href", `/owner/groups?organizationId=${org}&groupId=${group}`);
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    expect(writes()).toHaveLength(1);
    otherView.unmount();

    const recovered = render(<OwnerGroupsManager bundle={bundle} />);
    await user.click(await screen.findByRole("button", { name: "Reintentar operación pendiente" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual(firstRequest);
    expect(window.sessionStorage.getItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY)).toBeNull();
    recovered.unmount();
  });
  it("un snapshot de pertenencia corrupto bloquea escrituras y muestra recuperación", async () => {
    window.sessionStorage.setItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY, JSON.stringify({
      version: 1, organizationId: org, groupId: group, kind: "add", athleteId: athlete,
      startsOn: today, status: "active", idempotencyKey: "30000000-0000-4000-8000-000000000099",
      endpoint: "https://example.invalid/collect", athleteName: "No persistir",
    }));
    render(<OwnerGroupsManager bundle={bundle} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("operación de pertenencia local dañada");
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    expect(writes()).toHaveLength(0);
  });
  it("si sessionStorage.getItem falla bloquea POST/PATCH y submit directo de creación", async () => {
    const originalGetItem = Storage.prototype.getItem;
    const readSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (key) {
      if (this === window.sessionStorage) throw new DOMException("Read denied", "SecurityError");
      return originalGetItem.call(this, key);
    });
    const row = { id: membership, athleteId: athlete, athleteName: "Ficha sintética", status: "active", startsOn: today };
    const manager = render(<OwnerGroupsManager bundle={{ ...bundle, memberships: [row] } as Bundle} />);
    try {
      const membershipRecoveryMessage = await screen.findByText(
        /No se pudo consultar el almacenamiento de esta sesión\. No se permitirán cambios/
      );
      expect(membershipRecoveryMessage.closest('section[role="alert"]')).toHaveTextContent(
        "No se pudo consultar el almacenamiento de esta sesión"
      );
      const pause = screen.getByRole("button", { name: "Poner en pausa a Ficha sintética" });
      expect(pause).toBeDisabled();
      fireEvent.click(pause);
      expect(writes()).toHaveLength(0);
      await userEvent.setup().click(screen.getByText("¿No aparece? Crear ficha y añadir"));
      const athleteForm = screen.getByLabelText("Nombre").closest("form");
      expect(athleteForm).not.toBeNull();
      fireEvent.submit(athleteForm!);
      expect(writes()).toHaveLength(0);
      manager.unmount();

      render(<OwnerGroupsManager bundle={{ ...bundle, groups: [], selectedGroupId: null, memberships: [] } as Bundle} />);
      expect(
        await screen.findByRole("status", {
          name: "Borrador de grupo no disponible",
        })
      ).toHaveTextContent("No se pudo consultar el almacenamiento de esta sesión");
      const groupForm = screen.getByRole("button", { name: "Guardar grupo" }).closest("form");
      expect(groupForm).not.toBeNull();
      fireEvent.submit(groupForm!);
      expect(writes()).toHaveLength(0);
    } finally {
      readSpy.mockRestore();
    }
  });
  it("no duplica un envío si llegan dos submit antes del siguiente render", async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockReturnValue(new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user);
    const form = screen.getByRole("button", { name: "Crear y añadir al grupo" }).closest("form")!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(writes()).toHaveLength(1);
    await act(async () => resolve(response(201, receipt)));
  });
  it("un acuse 2xx incompleto no elimina la operación pendiente", async () => {
    mocks.fetch.mockResolvedValueOnce(response(201, { ok: true, data: { id: membership } }));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user); await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(mocks.refresh).not.toHaveBeenCalled();
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it("crear un grupo no libera su snapshot ante un 4xx desconocido", async () => {
    mocks.fetch.mockResolvedValueOnce(uncertain());
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={{ ...bundle, groups: [], selectedGroupId: null }} />);
    await user.type(screen.getByLabelText("Nombre del grupo"), "Grupo QA");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Reintentar creación pendiente" })).toBeEnabled();
    expect(screen.getByLabelText("Nombre del grupo")).toBeDisabled();
    expect(window.sessionStorage.getItem(`zaltyko:pending-group-create:v2:${org}`)).not.toBeNull();
  });
  it("asocia los errores locales de nombre y capacidad sin enviar", async () => {
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={emptyGroupBundle} />);
    const name = await screen.findByLabelText("Nombre del grupo");
    const form = name.closest("form")!;
    await user.type(name, "   ");
    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escribe el nombre del grupo."
    );
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Escribe el nombre del grupo.");
    expect(screen.getByLabelText("Actividad")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Sede")).not.toHaveAttribute("aria-invalid", "true");
    expect(writes()).toHaveLength(0);
    expect(window.sessionStorage.getItem(`zaltyko:pending-group-create:v2:${org}`)).toBeNull();

    await user.clear(name);
    await user.type(name, "Grupo válido");
    expect(name).not.toHaveAttribute("aria-invalid", "true");
    expect(name).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const capacity = screen.getByLabelText("Plazas (opcional)");
    fireEvent.change(capacity, { target: { value: "0" } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La capacidad debe ser un número entero mayor que cero."
    );
    expect(capacity).toHaveAttribute("aria-invalid", "true");
    expect(capacity).toHaveAccessibleDescription(
      "La capacidad debe ser un número entero mayor que cero."
    );
    expect(name).not.toHaveAttribute("aria-invalid", "true");
    expect(writes()).toHaveLength(0);
    await user.clear(capacity);
    expect(capacity).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("usa validación nativa y asocia su mensaje sin cancelar el evento invalid", async () => {
    render(<OwnerGroupsManager bundle={emptyGroupBundle} />);
    const name = await screen.findByLabelText("Nombre del grupo");
    const form = name.closest("form")!;
    expect(name).toBeRequired();
    expect(form).not.toHaveAttribute("novalidate");

    const invalidEvent = new Event("invalid", { bubbles: true, cancelable: true });
    fireEvent(name, invalidEvent);

    expect(invalidEvent.defaultPrevented).toBe(false);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Escribe el nombre del grupo.");
    expect(writes()).toHaveLength(0);
  });
  it("recalcula el resumen nativo con los campos que siguen inválidos", async () => {
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={emptyGroupBundle} />);
    const name = await screen.findByLabelText("Nombre del grupo");
    const capacity = screen.getByLabelText("Plazas (opcional)");
    fireEvent.change(capacity, { target: { value: "5001" } });
    fireEvent(name, new Event("invalid", { bubbles: true, cancelable: true }));
    fireEvent(capacity, new Event("invalid", { bubbles: true, cancelable: true }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribe el nombre del grupo. Introduce un número entero entre 1 y 5000."
    );
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(capacity).toHaveAttribute("aria-invalid", "true");

    await user.type(name, "Grupo válido");
    expect(name).not.toHaveAttribute("aria-invalid", "true");
    expect(capacity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Introduce un número entero entre 1 y 5000."
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Escribe el nombre del grupo.");
    expect(writes()).toHaveLength(0);
  });
  it.each([
    { label: "Actividad", field: "programId" as const },
    { label: "Sede", field: "locationId" as const },
  ])("marca %s fuera del alcance de la academia y no envía", async ({ label, field }) => {
    const outsideProgram = {
      id: "30000000-0000-4000-8000-000000000021",
      name: "Actividad ajena",
      kind: "gymnastics_sport",
    };
    const outsideLocation = {
      id: "30000000-0000-4000-8000-000000000022",
      name: "Sede ajena",
      timezone: "Europe/Madrid",
    };
    const expandedBundle = {
      ...emptyGroupBundle,
      programs: [...emptyGroupBundle.programs, outsideProgram],
      locations: [...emptyGroupBundle.locations, outsideLocation],
    } as Bundle;
    const user = userEvent.setup();
    const view = render(<OwnerGroupsManager bundle={expandedBundle} />);
    const control = await screen.findByLabelText(label);
    await user.type(screen.getByLabelText("Nombre del grupo"), "Grupo válido");
    const foreignValue = field === "programId" ? outsideProgram.id : outsideLocation.id;
    await user.selectOptions(control, foreignValue);

    const narrowedBundle = field === "programId"
      ? { ...expandedBundle, programs: emptyGroupBundle.programs }
      : { ...expandedBundle, locations: emptyGroupBundle.locations };
    view.rerender(<OwnerGroupsManager bundle={narrowedBundle as Bundle} />);
    fireEvent.submit(control.closest("form")!);

    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription(
      field === "programId"
        ? "La actividad seleccionada ya no pertenece a esta academia."
        : "La sede seleccionada ya no pertenece a esta academia."
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      field === "programId"
        ? "La actividad seleccionada ya no pertenece a esta academia."
        : "La sede seleccionada ya no pertenece a esta academia."
    );
    expect(writes()).toHaveLength(0);
  });
  it("conserva el resumen mientras quede otro campo inválido", async () => {
    const outsideProgram = {
      id: "30000000-0000-4000-8000-000000000023",
      name: "Actividad temporal",
      kind: "gymnastics_sport",
    };
    const outsideLocation = {
      id: "30000000-0000-4000-8000-000000000024",
      name: "Sede temporal",
      timezone: "Europe/Madrid",
    };
    const expandedBundle = {
      ...emptyGroupBundle,
      programs: [...emptyGroupBundle.programs, outsideProgram],
      locations: [...emptyGroupBundle.locations, outsideLocation],
    } as Bundle;
    const view = render(<OwnerGroupsManager bundle={expandedBundle} />);
    const programControl = await screen.findByLabelText("Actividad");
    const locationControl = screen.getByLabelText("Sede");
    fireEvent.change(screen.getByLabelText("Nombre del grupo"), { target: { value: "Grupo válido" } });
    fireEvent.change(programControl, { target: { value: outsideProgram.id } });
    fireEvent.change(locationControl, { target: { value: outsideLocation.id } });
    view.rerender(<OwnerGroupsManager bundle={emptyGroupBundle} />);
    fireEvent.submit(screen.getByLabelText("Nombre del grupo").closest("form")!);

    const summary = "La actividad seleccionada ya no pertenece a esta academia. La sede seleccionada ya no pertenece a esta academia.";
    expect(await screen.findByRole("alert")).toHaveTextContent(summary);
    expect(programControl).toHaveAttribute("aria-invalid", "true");
    expect(locationControl).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(programControl, { target: { value: program } });
    expect(programControl).not.toHaveAttribute("aria-invalid", "true");
    expect(locationControl).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La sede seleccionada ya no pertenece a esta academia."
    );
    expect(writes()).toHaveLength(0);
  });
  it("mantiene vacía la capacidad como válida y envía null sin error de campo", async () => {
    mocks.fetch.mockResolvedValueOnce(response(201, {
      ok: true,
      data: {
        id: otherGroup,
        name: "Grupo sin límite",
        locationId: site,
        programId: program,
        capacity: null,
      },
    }));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={emptyGroupBundle} />);
    await user.type(await screen.findByLabelText("Nombre del grupo"), "Grupo sin límite");
    const capacity = screen.getByLabelText("Plazas (opcional)");
    expect(capacity).not.toBeRequired();
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(String(writes()[0]?.[1]?.body))).toEqual({
      organizationId: org,
      locationId: site,
      programId: program,
      name: "Grupo sin límite",
      capacity: null,
    });
    expect(capacity).not.toHaveAttribute("aria-invalid", "true");
  });
  it("al cerrar y cambiar de academia limpia solo los errores de campo", async () => {
    const user = userEvent.setup();
    const view = render(<OwnerGroupsManager bundle={emptyGroupBundle} />);
    const name = await screen.findByLabelText("Nombre del grupo");
    await user.type(name, "   ");
    fireEvent.submit(name.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escribe el nombre del grupo."
    );
    expect(name).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    await user.click(screen.getByRole("button", { name: "Crear grupo" }));
    const reopenedName = await screen.findByLabelText("Nombre del grupo");
    expect(reopenedName).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const otherAcademy = {
      ...emptyGroupBundle,
      organization: { ...emptyGroupBundle.organization, id: otherOrg },
    } as Bundle;
    view.rerender(<OwnerGroupsManager bundle={otherAcademy} />);
    const otherName = await screen.findByLabelText("Nombre del grupo");
    expect(otherName).toHaveValue("");
    expect(otherName).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });
  it("editar un campo no borra una alerta de rechazo del servidor", async () => {
    mocks.fetch.mockResolvedValueOnce(response(429, {
      error: "RATE_LIMIT_EXCEEDED",
      message: "Espera antes de reintentar.",
    }));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={emptyGroupBundle} />);
    const name = await screen.findByLabelText("Nombre del grupo");
    await user.type(name, "Grupo QA");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Espera antes de reintentar."
    );

    await user.type(name, " corregido");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Espera antes de reintentar."
    );
    expect(writes()).toHaveLength(1);
  });
  it("mantiene el error del servidor al retirar solo la alerta de validación local", async () => {
    const serverMessage = "Espera antes de reintentar.";
    const capacityMessage = "La capacidad debe ser un número entero mayor que cero.";
    const alertTexts = () =>
      screen.getAllByRole("alert").map((alert) => alert.textContent?.trim());
    mocks.fetch.mockResolvedValueOnce(response(429, {
      error: "RATE_LIMIT_EXCEEDED",
      message: serverMessage,
    }));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={emptyGroupBundle} />);
    const name = await screen.findByLabelText("Nombre del grupo");
    await user.type(name, "Grupo QA");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(serverMessage);

    const capacity = screen.getByLabelText("Plazas (opcional)");
    fireEvent.change(capacity, { target: { value: "0" } });
    fireEvent.submit(name.closest("form")!);
    await waitFor(() =>
      expect(alertTexts()).toEqual(expect.arrayContaining([serverMessage, capacityMessage]))
    );
    expect(capacity).toHaveAccessibleDescription(capacityMessage);
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    await user.clear(capacity);
    expect(alertTexts()).toContain(serverMessage);
    expect(alertTexts()).not.toContain(capacityMessage);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(writes()).toHaveLength(1);
  });
  it.each(["sin borrador", "con borrador pendiente"] as const)("relee el borrador al recuperarse sessionStorage (%s)", async scenario => {
    const storageKey = `zaltyko:pending-group-create:v2:${org}`;
    const originalGetItem = Storage.prototype.getItem;
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (key) {
      if (this === window.sessionStorage && key === storageKey) {
        throw new DOMException("Read denied", "SecurityError");
      }
      return originalGetItem.call(this, key);
    });
    const setItem = vi.spyOn(window.sessionStorage, "setItem");
    window.sessionStorage.setItem("synthetic-storage-probe", "available");
    expect(window.sessionStorage.getItem("synthetic-storage-probe")).toBe("available");
    setItem.mockClear();

    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={{ ...bundle, groups: [], selectedGroupId: null }} />);
    expect(
      await screen.findByRole("status", {
        name: "Borrador de grupo no disponible",
      })
    ).toHaveTextContent("No se pudo consultar el almacenamiento de esta sesión");
    const form = screen.getByRole("button", { name: "Guardar grupo" }).closest("form")!;
    expect(screen.getByRole("button", { name: "Guardar grupo" })).toBeDisabled();
    fireEvent.submit(form);
    expect(writes()).toHaveLength(0);
    expect(setItem.mock.calls.filter(([key]) => key === storageKey)).toHaveLength(0);

    getItem.mockRestore();
    if (scenario === "con borrador pendiente") {
      const pendingCommand = {
        version: 1,
        organizationId: org,
        idempotencyKey: "synthetic-pending-group-key",
        body: JSON.stringify({ organizationId: org, locationId: site, programId: program, name: "Grupo pendiente", capacity: null }),
      };
      window.sessionStorage.setItem(storageKey, JSON.stringify(pendingCommand));
    }
    setItem.mockClear();
    await user.click(screen.getByRole("button", { name: "Volver a comprobar borrador" }));
    if (scenario === "con borrador pendiente") {
      expect(await screen.findByRole("button", { name: "Reintentar creación pendiente" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Guardar grupo" })).toBeDisabled();
      expect(window.sessionStorage.getItem(storageKey)).toContain("synthetic-pending-group-key");
    } else {
      await waitFor(() => expect(screen.getByRole("button", { name: "Guardar grupo" })).toBeEnabled());
      expect(
        screen.queryByRole("status", { name: "Borrador de grupo no disponible" })
      ).not.toBeInTheDocument();
      expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    }
    expect(writes()).toHaveLength(0);
    expect(setItem.mock.calls.filter(([key]) => key === storageKey)).toHaveLength(0);
    setItem.mockRestore();
  });
  it.each([
    ["otra sede", "locationId", "30000000-0000-4000-8000-000000000008"],
    ["otro programa", "programId", "30000000-0000-4000-8000-000000000009"],
    ["otro nombre", "name", "Otro grupo"],
    ["otra capacidad", "capacity", 24],
  ] as const)("un recibo de creación con %s distinto conserva el snapshot y no navega", async (_label, field, value) => {
    mocks.fetch
      .mockResolvedValueOnce(uncertain())
      .mockResolvedValueOnce(response(201, {
        ok: true,
        data: {
          id: group,
          name: "Grupo QA",
          locationId: site,
          programId: program,
          capacity: 12,
          [field]: value,
        },
      }));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={{ ...bundle, groups: [], selectedGroupId: null }} />);
    await user.type(screen.getByLabelText("Nombre del grupo"), "Grupo QA");
    await user.type(screen.getByLabelText("Plazas (opcional)"), "12");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const snapshotKey = `zaltyko:pending-group-create:v2:${org}`;
    const snapshot = window.sessionStorage.getItem(snapshotKey);
    const firstRequest = writes()[0]?.[1];

    await user.click(screen.getByRole("button", { name: "Reintentar creación pendiente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(window.sessionStorage.getItem(snapshotKey)).toBe(snapshot);
    expect(writes()[1]?.[1]).toEqual(firstRequest);
    expect(screen.getByRole("button", { name: "Reintentar creación pendiente" })).toBeEnabled();
    expect(screen.getByLabelText("Nombre del grupo")).toBeDisabled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("una clave antigua recupera ausencia y pide los nombres para reintentar con la misma clave", async () => {
    const key = `zaltyko:pending-group-athlete:${org}:${group}`;
    window.sessionStorage.setItem(key, "old-key-only");
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { status: "none" } })).mockResolvedValueOnce(uncertain());
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
    expect(await screen.findByText(/No aparece ningún recibo.*Reintroduce exactamente el mismo nombre y apellidos/)).toBeVisible();
    await user.type(screen.getByLabelText("Nombre"), "Corregida");
    await user.type(screen.getByLabelText("Apellidos"), "Sintética");
    await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const post = writes()[0];
    expect(post[1].headers).toMatchObject({ "idempotency-key": "old-key-only" });
    expect(JSON.parse(String(post[1].body)).newAthlete).toEqual({ givenName: "Corregida", familyName: "Sintética" });
    const stored = window.sessionStorage.getItem(key)!;
    expect(stored).toContain("old-key-only");
    expect(stored).not.toMatch(/Corregida|Sintética|givenName|familyName/);
  });

  it("bloquea un recibo parcial y conserva la clave sin reenviar", async () => {
    const key = `zaltyko:pending-group-athlete:${org}:${group}`;
    window.sessionStorage.setItem(key, "old-key-01234567");
    mocks.fetch.mockResolvedValueOnce(response(409, { ok: false, type: "https://zaltyko.com/problems/idempotency-conflict", status: 409 }));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
    expect(await screen.findByText(/No se pudo verificar el recibo/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Crear y añadir al grupo" })).toBeDisabled();
    expect(mocks.fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    expect(window.sessionStorage.getItem(key)).toContain("old-key-01234567");
  });
  it("permite reconsultar un recibo tras fallo de red sin abrir otra operación", async () => {
    const key = `zaltyko:pending-group-athlete:${org}:${group}`;
    const intent = {
      version: 1,
      organizationId: org,
      groupId: group,
      kind: "create-athlete-and-membership",
      idempotencyKey: "retry-key-01234567",
    };
    window.sessionStorage.setItem(key, JSON.stringify(intent));
    mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response(200, { ok: true, data: { status: "none" } }));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
    expect(await screen.findByText(/No se pudo consultar el recibo/)).toBeVisible();
    const receiptCalls = mocks.fetch.mock.calls.filter(([input]) =>
      String(input).includes("/memberships/receipt?")
    );
    expect(receiptCalls).toHaveLength(1);
    const [receiptUrl, receiptOptions] = receiptCalls[0];
    const parsedReceiptUrl = new URL(String(receiptUrl), "https://zaltyko.test");
    expect(parsedReceiptUrl.pathname).toBe(`/api/v1/owner/groups/${intent.groupId}/memberships/receipt`);
    expect(parsedReceiptUrl.searchParams.get("organizationId")).toBe(intent.organizationId);
    expect(parsedReceiptUrl.searchParams.get("idempotencyKey")).toBe(intent.idempotencyKey);
    expect(receiptOptions).toMatchObject({ cache: "no-store" });
    await user.click(screen.getByRole("button", { name: "Reintentar comprobación" }));
    await waitFor(() => expect(
      mocks.fetch.mock.calls.filter(([input]) => String(input).includes("/memberships/receipt?")).length
    ).toBe(2));
    const repeatedReceiptCalls = mocks.fetch.mock.calls.filter(([input]) =>
      String(input).includes("/memberships/receipt?")
    );
    expect(String(repeatedReceiptCalls[1][0])).toBe(String(receiptCalls[0][0]));
    expect(await screen.findByText(/No aparece ningún recibo.*Reintroduce exactamente el mismo nombre y apellidos/)).toBeVisible();
    expect(writes()).toHaveLength(0);
    expect(window.sessionStorage.getItem(key)).toContain(intent.idempotencyKey);
  });
  it("muestra el recibo ID-only y solo limpia la clave tras confirmación", async () => {
    const key = `zaltyko:pending-group-athlete:${org}:${group}`;
    const intent = { version: 1, organizationId: org, groupId: group, kind: "create-athlete-and-membership", idempotencyKey: "confirmed-key-01234567" };
    window.sessionStorage.setItem(key, JSON.stringify(intent));
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { status: "complete", receipt: {
      id: membership, groupId: group, athleteId: athlete, startsOn: "2026-10-22", status: "active",
    } } }));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
    expect(await screen.findByText(/El recibo confirma el alta y la pertenencia al grupo/)).toBeVisible();
    expect(window.sessionStorage.getItem(key)).toContain("confirmed-key-01234567");
    expect(writes()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Confirmar resultado y limpiar clave pendiente" }));

    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("un rechazo conocido inicial permite corregir el alta con una nueva clave", async () => {
    mocks.fetch.mockResolvedValueOnce(response(400, { type: "https://zaltyko.com/problems/invalid-group-membership-command", status: 400, title: "No válido", detail: "Corrige los datos." }))
      .mockResolvedValueOnce(response(201, receipt));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user); await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Corrige los datos.");
    expect(screen.queryByRole("button", { name: "Reintentar operación pendiente" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Nombre")); await user.type(screen.getByLabelText("Nombre"), "Corregida");
    await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    expect(writes()).toHaveLength(2);
    expect(writes()[1][1].headers).not.toEqual(writes()[0][1].headers);
    expect(JSON.parse(writes()[1][1].body).newAthlete.givenName).toBe("Corregida");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("un rechazo de autenticación posterior no borra un alta previamente incierta", async () => {
    mocks.fetch.mockResolvedValueOnce(uncertain()).mockResolvedValueOnce(response(401, { type: "https://zaltyko.com/problems/authentication-required", title: "Accede de nuevo", status: 401, detail: "Sesión caducada." }));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user); await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    expect(writes()[1]).toEqual(writes()[0]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("una respuesta tardía no refresca ni rellena otro contexto, ni una nueva visita A-B-A", async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); const view = render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user); await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    const other = { ...bundle, organization: { ...bundle.organization, id: "30000000-0000-4000-8000-000000000099" } };
    view.rerender(<OwnerGroupsManager bundle={other} />);
    view.rerender(<OwnerGroupsManager bundle={bundle} />);
    await act(async () => resolve(response(201, receipt)));
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    expect(screen.queryByText("Ficha creada y añadida al grupo.")).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
  });
  it("bloquea el reintento en otra academia y solo permite volver al contexto original", async () => {
    mocks.fetch.mockResolvedValueOnce(uncertain()).mockResolvedValueOnce(response(201, receipt));
    const user = userEvent.setup(); const view = render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user); await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" })); await screen.findByRole("alert");
    view.rerender(<OwnerGroupsManager bundle={{ ...bundle, organization: { ...bundle.organization, id: "30000000-0000-4000-8000-000000000099" } }} />);
    const retry = screen.getByRole("button", { name: "Reintentar operación pendiente" });
    expect(retry).toBeDisabled(); await user.click(retry);
    expect(writes()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    view.rerender(<OwnerGroupsManager bundle={bundle} />);
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));
    expect(writes()[1]).toEqual(writes()[0]);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });
  it("un rechazo al reintentar la creación no borra el snapshot previamente incierto", async () => {
    mocks.fetch.mockResolvedValueOnce(uncertain()).mockResolvedValueOnce(response(429, { error: "RATE_LIMIT_EXCEEDED", message: "Espera antes de reintentar." }));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={{ ...bundle, groups: [], selectedGroupId: null }} />);
    await user.type(screen.getByLabelText("Nombre del grupo"), "Grupo QA");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" })); await screen.findByRole("alert");
    const snapshot = window.sessionStorage.getItem(`zaltyko:pending-group-create:v2:${org}`);
    await user.click(screen.getByRole("button", { name: "Reintentar creación pendiente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(window.sessionStorage.getItem(`zaltyko:pending-group-create:v2:${org}`)).toBe(snapshot);
    expect(writes()[1]).toEqual(writes()[0]);
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("una creación confirmada tarde no navega desde otra academia", async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); const empty = { ...bundle, groups: [], selectedGroupId: null };
    const view = render(<OwnerGroupsManager bundle={empty} />);
    await user.type(screen.getByLabelText("Nombre del grupo"), "Grupo QA");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    view.rerender(<OwnerGroupsManager bundle={{ ...empty, organization: { ...bundle.organization, id: "30000000-0000-4000-8000-000000000099" } }} />);
    await act(async () => resolve(response(201, { ok: true, data: { id: group, name: "Grupo QA", locationId: site, programId: program, capacity: null } })));
    expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(`zaltyko:pending-group-create:v2:${org}`)).toBeNull();
  });
  it("retira el aviso de salida después del acuse confirmado y no persiste nombres de menores", async () => {
    mocks.fetch.mockResolvedValueOnce(uncertain()).mockResolvedValueOnce(response(201, receipt));
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={bundle} />);
    await fillAthlete(user); await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" })); await screen.findByRole("alert");
    const pendingCreate = window.sessionStorage.getItem(
      `zaltyko:pending-group-athlete:${org}:${group}`
    );
    expect(pendingCreate).not.toBeNull();
    expect(Object.keys(JSON.parse(pendingCreate!)).sort()).toEqual(
      ["version", "organizationId", "groupId", "kind", "idempotencyKey"].sort()
    );
    expect(pendingCreate).not.toContain("Ficha");
    expect(pendingCreate).not.toContain("Sintética");
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(
      window.sessionStorage.getItem(`zaltyko:pending-group-athlete:${org}:${group}`)
    ).toBeNull();
    expect(screen.getByLabelText("Nombre")).toBeEnabled();
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
  });
  it("un error al navegar tras la creación confirmada no invita a reenviar", async () => {
    mocks.fetch.mockImplementationOnce(async (_input, init) => {
      const submitted = JSON.parse(String(init?.body)) as {
        locationId: string;
        programId: string;
        name: string;
        capacity: number | null;
      };
      return response(201, { ok: true, data: { id: group, ...submitted } });
    });
    mocks.push.mockImplementationOnce(() => { throw new Error("Synthetic navigation error"); });
    const user = userEvent.setup(); render(<OwnerGroupsManager bundle={{ ...bundle, groups: [], selectedGroupId: null }} />);
    await user.type(screen.getByLabelText("Nombre del grupo"), "Grupo QA");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El grupo está confirmado");
    expect(screen.queryByRole("button", { name: "Reintentar creación pendiente" })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(`zaltyko:pending-group-create:v2:${org}`)).toBeNull();
    expect(writes()).toHaveLength(1);
  });
});
