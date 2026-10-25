// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { OwnerClassesManager } from "@/components/owner-dashboard/OwnerClassesManager";
import { markOwnerPlanUsageUnavailable, publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "40000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000002";
const programId = "40000000-0000-4000-8000-000000000003";
const classId = "40000000-0000-4000-8000-000000000004";
const today = "2026-10-22";
const baseBundle = {
  organization: { id: organizationId, name: "Academia sintética" },
  member: { id: "synthetic-owner", role: "owner", locationScopeMode: "all" },
  locations: [{ id: locationId, name: "Sede sintética", timezone: "Europe/Madrid" }],
  programs: [{ id: programId, name: "Gimnasia artística", kind: "gymnastics_sport" }],
  classes: [],
  selectedLocationId: locationId,
  localTodayByLocation: { [locationId]: today },
};
type Bundle = Parameters<typeof OwnerClassesManager>[0]["bundle"];
const bundle = baseBundle as unknown as Bundle;
const classUpdatedAt = "2026-10-24T12:00:00.123456Z";
const classWithSchedule = {
  id: classId,
  name: "Artística iniciación",
  capacity: 12,
  effectiveFrom: today,
  effectiveTo: null,
  locationId,
  locationName: "Sede sintética",
  programId,
  programName: "Gimnasia artística",
  updatedAtVersion: classUpdatedAt,
  schedule: [{ id: "slot-1", isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" }],
};
const bundleWithClass = {
  ...baseBundle,
  classes: [classWithSchedule],
} as unknown as Bundle;
const validReceipt = {
  ok: true,
  data: { id: classId, name: "Artística iniciación", sessionCount: 18, generatedThrough: "2027-02-19" },
};
function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}
function writes() {
  return mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST");
}
function classUpdates() {
  return mocks.fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function beforeUnloadIsPrevented() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("reintento de creación de clases", () => {
  it("conserva la sede al volver al resumen y omite locationId si el ámbito es agregado", () => {
    const { rerender } = render(<OwnerClassesManager bundle={bundle} />);
    expect(screen.getByRole("link", { name: "Volver al resumen" })).toHaveAttribute(
      "href",
      `/owner?organizationId=${organizationId}&locationId=${locationId}`
    );

    rerender(
      <OwnerClassesManager
        bundle={{ ...baseBundle, selectedLocationId: null } as unknown as Bundle}
      />
    );
    expect(screen.getByRole("link", { name: "Volver al resumen" })).toHaveAttribute(
      "href",
      `/owner?organizationId=${organizationId}`
    );
  });

  it("reinicia el borrador antes de mostrar otra academia", async () => {
    const otherOrganizationId = "50000000-0000-4000-8000-000000000001";
    const oldOtherLocationId = "40000000-0000-4000-8000-000000000005";
    const otherLocationId = "50000000-0000-4000-8000-000000000002";
    const otherLocationAltId = "50000000-0000-4000-8000-000000000003";
    const otherProgramId = "50000000-0000-4000-8000-000000000004";
    const firstBundle = {
      ...baseBundle,
      locations: [
        ...baseBundle.locations,
        {
          id: oldOtherLocationId,
          name: "Sede anterior adicional",
          timezone: "Europe/Madrid",
        },
      ],
    } as unknown as Bundle;
    const otherBundle = {
      ...baseBundle,
      organization: { ...baseBundle.organization, id: otherOrganizationId },
      locations: [
        { id: otherLocationId, name: "Sede Norte", timezone: "Europe/Madrid" },
        { id: otherLocationAltId, name: "Sede Sur", timezone: "Europe/Madrid" },
      ],
      programs: [
        {
          id: otherProgramId,
          name: "Gimnasia rítmica",
          kind: "gymnastics_sport",
        },
      ],
      selectedLocationId: otherLocationId,
      localTodayByLocation: {
        [otherLocationId]: "2026-10-23",
        [otherLocationAltId]: "2026-10-24",
      },
    } as unknown as Bundle;
    publishOwnerPlanUsage(otherOrganizationId, {
      readOnly: false,
      planCode: "free",
    });
    const layoutSnapshots: Array<{
      name: string;
      program: string;
      location: string;
      capacity: string;
      effectiveFrom: string;
    }> = [];
    function LayoutProbe({ id }: { id: string }) {
      useLayoutEffect(() => {
        layoutSnapshots.push({
          name: (
            screen.getByLabelText("Nombre de la clase") as HTMLInputElement
          ).value,
          program: (screen.getByLabelText("Actividad") as HTMLSelectElement)
            .value,
          location: (screen.getByLabelText("Sede") as HTMLSelectElement).value,
          capacity: (
            screen.getByLabelText("Plazas disponibles") as HTMLInputElement
          ).value,
          effectiveFrom: (screen.getByLabelText("Empieza el") as HTMLInputElement)
            .value,
        });
      }, [id]);
      return null;
    }

    const user = userEvent.setup();
    const view = render(
      <>
        <OwnerClassesManager bundle={firstBundle} />
        <LayoutProbe id={organizationId} />
      </>
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crear clase y sesiones" })
      ).toBeEnabled()
    );
    await user.type(screen.getByLabelText("Nombre de la clase"), "Borrador anterior");
    await user.type(screen.getByLabelText("Plazas disponibles"), "19");
    await user.selectOptions(screen.getByLabelText("Sede"), oldOtherLocationId);

    view.rerender(
      <>
        <OwnerClassesManager bundle={otherBundle} />
        <LayoutProbe id={otherOrganizationId} />
      </>
    );

    expect(layoutSnapshots[layoutSnapshots.length - 1]).toEqual({
      name: "",
      program: otherProgramId,
      location: otherLocationId,
      capacity: "12",
      effectiveFrom: "2026-10-23",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crear clase y sesiones" })
      ).toBeEnabled()
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("en solo lectura desactiva la creación y conserva la consulta de clases y la regularización", async () => {
    publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" });
    render(<OwnerClassesManager bundle={bundleWithClass} />);

    expect(await screen.findByRole("button", { name: "Crear clase y sesiones" })).toBeDisabled();
    expect(screen.getByText(/La academia está en solo lectura/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Uso y regularización" })).toHaveAttribute("href", `/owner/subscription?organizationId=${organizationId}#regularizar`);
    expect(screen.getByRole("heading", { name: "Clases de tu academia" })).toBeVisible();
    expect(screen.getByLabelText("Nombre de la clase")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar nombre y plazas" })).toBeDisabled();
    expect(writes()).toHaveLength(0);
    expect(classUpdates()).toHaveLength(0);
  });

  it("edita nombre y plazas con versión e idempotencia sin alterar horario, sede o sesiones", async () => {
    const updatedAtVersion = "2026-10-24T12:00:01.000001Z";
    mocks.fetch.mockResolvedValueOnce(response(200, {
      ok: true,
      data: {
        id: classId,
        name: "Artística avanzada",
        capacity: 16,
        updatedAtVersion,
      },
    }));
    const user = userEvent.setup();
    render(<OwnerClassesManager bundle={bundleWithClass} />);

    await user.click(screen.getByRole("button", { name: "Editar nombre y plazas" }));
    const form = screen.getByRole("form", { name: "Editar Artística iniciación" });
    await user.clear(within(form).getByLabelText("Nombre de la clase"));
    await user.type(within(form).getByLabelText("Nombre de la clase"), "Artística avanzada");
    await user.clear(within(form).getByLabelText("Plazas"));
    await user.type(within(form).getByLabelText("Plazas"), "16");
    await user.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    expect(classUpdates()).toHaveLength(1);
    const [url, init] = classUpdates()[0]!;
    expect(url).toBe(`/api/v1/owner/classes/${classId}`);
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "idempotency-key": expect.stringMatching(/^owner-class-update:/),
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      organizationId,
      expectedUpdatedAt: classUpdatedAt,
      name: "Artística avanzada",
      capacity: 16,
    });
    expect(String(init?.body)).not.toMatch(/schedule|locationId|effectiveFrom|session/i);
    expect(await screen.findByRole("status")).toHaveTextContent("El horario semanal y las sesiones generadas no han cambiado");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(writes()).toHaveLength(0);
  });

  it("reintenta la misma edición con el mismo cuerpo y clave después de una respuesta ambigua", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new TypeError("Network response lost"))
      .mockResolvedValueOnce(response(200, {
        ok: true,
        data: {
          id: classId,
          name: "Artística iniciación",
          capacity: 14,
          updatedAtVersion: "2026-10-24T12:00:01.000001Z",
        },
      }));
    const user = userEvent.setup();
    render(<OwnerClassesManager bundle={bundleWithClass} />);

    await user.click(screen.getByRole("button", { name: "Editar nombre y plazas" }));
    const form = screen.getByRole("form", { name: "Editar Artística iniciación" });
    await user.clear(within(form).getByLabelText("Plazas"));
    await user.type(within(form).getByLabelText("Plazas"), "14");
    await user.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reintenta este mismo envío");
    const firstRequest = classUpdates()[0]?.[1];

    await user.click(within(form).getByRole("button", { name: "Reintentar mismo cambio" }));

    expect(classUpdates()).toHaveLength(2);
    expect(classUpdates()[1]?.[1]).toEqual(firstRequest);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("no muestra el borrador de edición de otra academia tras cambiar el contexto", async () => {
    const otherOrganizationId = "50000000-0000-4000-8000-000000000001";
    publishOwnerPlanUsage(otherOrganizationId, { readOnly: false, planCode: "free" });
    const user = userEvent.setup();
    const view = render(<OwnerClassesManager bundle={bundleWithClass} />);
    await user.click(screen.getByRole("button", { name: "Editar nombre y plazas" }));
    expect(screen.getByLabelText("Plazas")).toHaveValue(12);

    view.rerender(
      <OwnerClassesManager
        bundle={{
          ...bundleWithClass,
          organization: { ...baseBundle.organization, id: otherOrganizationId },
        } as Bundle}
      />
    );

    expect(screen.queryByLabelText("Plazas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar nombre y plazas" })).toBeEnabled();
    expect(classUpdates()).toHaveLength(0);
  });

  it("conserva cuerpo y clave tras un nombre contradictorio y los libera con el recibo coincidente", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(201, { ...validReceipt, data: { ...validReceipt.data, name: "Rítmica" } }))
      .mockResolvedValueOnce(response(201, validReceipt));
    const user = userEvent.setup();
    const view = render(<OwnerClassesManager bundle={bundle} />);
    const name = screen.getByLabelText("Nombre de la clase");
    await user.type(name, "Artística iniciación");
    await user.click(screen.getByRole("button", { name: "Crear clase y sesiones" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(name).toHaveValue("Artística iniciación");
    act(() => markOwnerPlanUsageUnavailable(organizationId));
    expect(screen.getByText(/No se pudieron comprobar los límites del plan/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Reintentar el mismo envío" })).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(beforeUnloadIsPrevented()).toBe(true);
    const firstRequest = writes()[0][1];

    view.rerender(
      <OwnerClassesManager bundle={{ ...baseBundle, localTodayByLocation: { [locationId]: "2026-10-23" } } as Bundle} />
    );
    await user.click(screen.getByRole("button", { name: "Reintentar el mismo envío" }));

    expect(writes()).toHaveLength(2);
    expect(writes()[1][1]).toEqual(firstRequest);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(name).toHaveValue("");
    expect(screen.getByText(/18 sesiones preparadas/)).toBeVisible();
    expect(beforeUnloadIsPrevented()).toBe(false);
    expect(window.sessionStorage.getItem(`zaltyko:pending-class-create:v1:${organizationId}`)).toBeNull();
  });

  it("mantiene el reintento ante JSON o acuse 2xx malformado", async () => {
    mocks.fetch.mockResolvedValueOnce(response(201, null));
    const user = userEvent.setup();
    render(<OwnerClassesManager bundle={bundle} />);
    const name = screen.getByLabelText("Nombre de la clase");
    await user.type(name, "Artística iniciación");
    await user.click(screen.getByRole("button", { name: "Crear clase y sesiones" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(name).toHaveValue("Artística iniciación");
    expect(screen.getByRole("button", { name: "Reintentar el mismo envío" })).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("solo envía una creación ante dos submits en el mismo ciclo", async () => {
    let resolveResponse = (_value: ReturnType<typeof response>) => {
      throw new Error("No se inició la solicitud de creación");
    };
    mocks.fetch.mockImplementationOnce(
      () => new Promise<ReturnType<typeof response>>((resolve) => { resolveResponse = resolve; })
    );
    const user = userEvent.setup();
    render(<OwnerClassesManager bundle={bundle} />);
    const name = screen.getByLabelText("Nombre de la clase");
    await user.type(name, "Artística iniciación");
    const form = name.closest("form");
    expect(form).not.toBeNull();

    act(() => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    expect(writes()).toHaveLength(1);
    await act(async () => {
      resolveResponse(response(201, validReceipt));
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(writes()).toHaveLength(1);
  });

  it("no reenvía una solicitud pendiente al cambiar de organización", async () => {
    const otherOrganizationId = "50000000-0000-4000-8000-000000000001";
    publishOwnerPlanUsage(otherOrganizationId, { readOnly: false, planCode: "free" });
    let resolveResponse = (_value: ReturnType<typeof response>) => {
      throw new Error("No se inició la solicitud de creación");
    };
    mocks.fetch.mockImplementationOnce(
      () => new Promise<ReturnType<typeof response>>((resolve) => { resolveResponse = resolve; })
    );
    const user = userEvent.setup();
    const view = render(<OwnerClassesManager bundle={bundle} />);
    await user.type(screen.getByLabelText("Nombre de la clase"), "Artística iniciación");
    await user.click(screen.getByRole("button", { name: "Crear clase y sesiones" }));
    await waitFor(() => expect(writes()).toHaveLength(1));

    const otherBundle = {
      ...baseBundle,
      organization: { ...baseBundle.organization, id: otherOrganizationId },
    } as Bundle;
    view.rerender(<OwnerClassesManager bundle={otherBundle} />);
    const form = screen.getByRole("form", { name: "Crear clase recurrente" });
    act(() => fireEvent.submit(form));

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(writes()).toHaveLength(1);
    await act(async () => {
      resolveResponse(response(201, validReceipt));
    });
    expect(writes()).toHaveLength(1);
  });

  it("bloquea un conflicto idempotente y restaura ese bloqueo tras recargar", async () => {
    const conflict = {
      type: "https://zaltyko.com/problems/idempotency-conflict",
      title: "Conflicto",
      status: 409,
      detail: "La clave ya se usó con otros parámetros.",
    };
    mocks.fetch
      .mockResolvedValueOnce(response(503, { detail: "No se pudo confirmar." }))
      .mockResolvedValueOnce(response(409, conflict));
    const user = userEvent.setup();
    const view = render(<OwnerClassesManager bundle={bundle} />);
    const name = screen.getByLabelText("Nombre de la clase");
    await user.type(name, "Artística iniciación");
    await user.click(screen.getByRole("button", { name: "Crear clase y sesiones" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const firstRequest = writes()[0][1];

    await user.click(screen.getByRole("button", { name: "Reintentar el mismo envío" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No volveremos a enviar la operación");
    expect(writes()).toHaveLength(2);
    expect(writes()[1][1]).toEqual(firstRequest);
    expect(name).toBeDisabled();
    const blockedButton = screen.getByRole("button", { name: "Revisión de soporte necesaria" });
    expect(blockedButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Recarga la lista para comprobar");
    expect(JSON.parse(window.sessionStorage.getItem(`zaltyko:pending-class-create:v1:${organizationId}`) ?? "{}").blocked).toBe(1);
    expect(mocks.refresh).not.toHaveBeenCalled();

    view.unmount();
    render(<OwnerClassesManager bundle={bundle} />);

    expect(await screen.findByRole("status")).toHaveTextContent("No volveremos a enviar esta creación");
    expect(screen.getByRole("button", { name: "Revisión de soporte necesaria" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Revisión de soporte necesaria" }));
    expect(writes()).toHaveLength(2);
  });

  it("mantiene el bloqueo en memoria si no puede persistir la marca del conflicto", async () => {
    const storageKey = `zaltyko:pending-class-create:v1:${organizationId}`;
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (key === storageKey && JSON.parse(value).blocked === 1) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });
    const conflict = {
      type: "https://zaltyko.com/problems/idempotency-conflict",
      title: "Conflicto",
      status: 409,
      detail: "La clave ya se usó con otros parámetros.",
    };
    mocks.fetch
      .mockResolvedValueOnce(response(503, { detail: "No se pudo confirmar." }))
      .mockResolvedValueOnce(response(409, conflict));
    const user = userEvent.setup();
    render(<OwnerClassesManager bundle={bundle} />);
    const name = screen.getByLabelText("Nombre de la clase");
    await user.type(name, "Artística iniciación");
    await user.click(screen.getByRole("button", { name: "Crear clase y sesiones" }));
    expect(await screen.findByRole("button", { name: "Reintentar el mismo envío" })).toBeEnabled();
    const originalIntent = window.sessionStorage.getItem(storageKey);
    expect(originalIntent).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Reintentar el mismo envío" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No volveremos a enviar la operación");
    expect(screen.getByRole("status")).toHaveTextContent("No se pudo guardar la marca de bloqueo");
    expect(screen.getByRole("status")).toHaveTextContent("no recargues ni cierres esta pestaña");
    expect(screen.getByRole("status")).toHaveTextContent("podría no conservarse al recargar");
    expect(name).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revisión de soporte necesaria" })).toBeDisabled();
    expect(writes()).toHaveLength(2);
    expect(window.sessionStorage.getItem(storageKey)).toBe(originalIntent);
    expect(setItem).toHaveBeenCalledTimes(3);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("libera el borrador tras un rechazo 4xx inicial canónico", async () => {
    mocks.fetch.mockResolvedValueOnce(response(400, {
      type: "https://zaltyko.com/problems/invalid-class-command",
      title: "Datos incompletos",
      status: 400,
      detail: "Corrige los datos de la clase.",
    }));
    const user = userEvent.setup();
    render(<OwnerClassesManager bundle={bundle} />);
    const name = screen.getByLabelText("Nombre de la clase");
    await user.type(name, "Artística iniciación");
    await user.click(screen.getByRole("button", { name: "Crear clase y sesiones" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Corrige los datos de la clase.");
    expect(name).toBeEnabled();
    expect(screen.getByRole("button", { name: "Crear clase y sesiones" })).toBeEnabled();
    expect(window.sessionStorage.getItem(`zaltyko:pending-class-create:v1:${organizationId}`)).toBeNull();
  });

  it("no envía la creación si no puede guardar primero la intención idempotente", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const user = userEvent.setup();
    render(<OwnerClassesManager bundle={bundle} />);
    await user.type(screen.getByLabelText("Nombre de la clase"), "Artística iniciación");

    await user.click(screen.getByRole("button", { name: "Crear clase y sesiones" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar la solicitud pendiente");
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Crear clase y sesiones" })).toBeEnabled();
  });

  it("restaura por sesión y academia el mismo cuerpo y la misma clave tras recargar", async () => {
    const key = "owner-class:40000000-0000-4000-8000-000000000099";
    const body = {
      organizationId,
      locationId,
      programId,
      name: "Artística iniciación",
      capacity: 12,
      effectiveFrom: today,
      effectiveTo: null,
      schedule: [{ isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" }],
    };
    window.sessionStorage.setItem(`zaltyko:pending-class-create:v1:${organizationId}`, JSON.stringify({
      version: 1,
      organizationId,
      key,
      body: JSON.stringify(body),
    }));
    mocks.fetch.mockResolvedValueOnce(response(201, validReceipt));
    const user = userEvent.setup();
    render(<OwnerClassesManager bundle={bundle} />);

    await waitFor(() => expect(screen.getByLabelText("Nombre de la clase")).toHaveValue("Artística iniciación"));
    expect(screen.getByRole("button", { name: "Reintentar el mismo envío" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Reintentar el mismo envío" }));

    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toBe(JSON.stringify(body));
    expect(writes()[0][1].headers["idempotency-key"]).toBe(key);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem(`zaltyko:pending-class-create:v1:${organizationId}`)).toBeNull();
  });
});
