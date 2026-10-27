// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));

import { OwnerAthleteProfileEditor, readPendingOwnerAthleteProfile } from "@/components/owner-dashboard/OwnerAthleteProfileEditor";
import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "40000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000002";
const groupId = "40000000-0000-4000-8000-000000000003";
const athleteId = "40000000-0000-4000-8000-000000000004";
const membershipId = "40000000-0000-4000-8000-000000000005";
const oldProfile = { athleteId, givenName: "Ana", familyName: "García López" };
const profilePayload = { ok: true, data: oldProfile };
const groupHref = `/api/v1/owner/athletes/${athleteId}`;

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function editorProps(overrides: Partial<ComponentProps<typeof OwnerAthleteProfileEditor>> = {}) {
  return {
    organizationId,
    locationId,
    groupId,
    athleteId,
    athleteName: "Ana García López",
    ...overrides,
  };
}

const bundle = {
  organization: { id: organizationId, name: "Academia sintética", defaultCurrency: "EUR" },
  member: { id: "synthetic-manager", role: "manager", locationScopeMode: "all" },
  locations: [{ id: locationId, name: "Sede sintética", timezone: "Europe/Madrid" }],
  programs: [{ id: "40000000-0000-4000-8000-000000000006", name: "Gimnasia", kind: "gymnastics_sport" }],
  groups: [{
    id: groupId,
    name: "Grupo sintético",
    capacity: 12,
    status: "active",
    locationId,
    locationName: "Sede sintética",
    timezone: "Europe/Madrid",
    programId: "40000000-0000-4000-8000-000000000006",
    programName: "Gimnasia",
    memberCount: 1,
  }],
  selectedGroupId: groupId,
  memberships: [{ id: membershipId, athleteId, athleteName: "Ana García López", status: "active", startsOn: "2026-10-25" }],
  localTodayByLocation: { [locationId]: "2026-10-25" },
} as unknown as Parameters<typeof OwnerGroupsManager>[0]["bundle"];

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  vi.stubGlobal("crypto", { randomUUID: () => "40000000-0000-4000-8000-000000000099" });
  vi.stubGlobal("fetch", mocks.fetch);
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "growth" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("edición de ficha Owner", () => {
  it("normaliza Unicode y espacios antes de comparar el recibo del servidor", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload)).mockResolvedValueOnce(response(200, {
      ok: true,
      data: { athleteId, givenName: "Ana María", familyName: "García López", replayed: false },
    }));
    const user = userEvent.setup();
    render(<OwnerAthleteProfileEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));
    const field = await screen.findByLabelText("Nombre");
    await user.clear(field);
    await user.type(field, "  Ana   Mari\u0301a  ");
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));
    expect(await screen.findByText("Ficha actualizada.")).toBeVisible();
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).givenName).toBe("Ana María");
    expect(readPendingOwnerAthleteProfile(window.sessionStorage).kind).toBe("none");
  });

  it("lee los nombres por API y muestra un error de carga sin inventar valores", async () => {
    mocks.fetch.mockResolvedValueOnce(response(503, { detail: "Servicio no disponible" }));
    const user = userEvent.setup();
    render(<OwnerAthleteProfileEditor {...editorProps()} />);

    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la ficha");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][0]).toBe(`${groupHref}?organizationId=${organizationId}&locationId=${locationId}`);
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
  });

  it("envía el contrato estricto con clave idempotente y confirma el guardado", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload)).mockResolvedValueOnce(response(200, {
      ok: true,
      data: { athleteId, givenName: "Ana María", familyName: "García López", replayed: false },
    }));
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<OwnerAthleteProfileEditor {...editorProps({ onSaved })} />);
    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));
    const firstName = await screen.findByLabelText("Nombre");
    await user.clear(firstName);
    await user.type(firstName, "Ana María");
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    const [url, init] = mocks.fetch.mock.calls[1];
    expect(url).toBe(groupHref);
    expect(init.method).toBe("PATCH");
    expect(init.headers["Idempotency-Key"]).toBe("40000000-0000-4000-8000-000000000099");
    expect(JSON.parse(init.body)).toEqual({
      organizationId,
      locationId,
      expectedGivenName: "Ana",
      expectedFamilyName: "García López",
      givenName: "Ana María",
      familyName: "García López",
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(await screen.findByText("Ficha actualizada.")).toBeVisible();
  });

  it("ignora un doble clic mientras la primera escritura sigue pendiente", async () => {
    const patch = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload)).mockReturnValueOnce(patch.promise);
    const user = userEvent.setup();
    render(<OwnerAthleteProfileEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));
    await screen.findByLabelText("Nombre");
    await user.dblClick(screen.getByRole("button", { name: "Guardar ficha" }));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      patch.resolve(response(200, { ok: true, data: { athleteId, givenName: "Ana", familyName: "García López", replayed: false } }));
      await patch.promise;
    });
    expect(await screen.findByText("Ficha actualizada.")).toBeVisible();
  });

  it("conserva cuerpo y clave tras perder la respuesta y reintenta solo tras recarga", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(200, { ok: true, data: { athleteId, givenName: "Ana actual", familyName: "García López actual", replayed: true } }));
    const user = userEvent.setup();
    const first = render(<OwnerAthleteProfileEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));
    const familyName = await screen.findByLabelText("Apellidos");
    await user.clear(familyName);
    await user.type(familyName, "García López Martín");
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const originalRequest = mocks.fetch.mock.calls[1];
    const recovered = readPendingOwnerAthleteProfile(window.sessionStorage);
    expect(recovered.kind).toBe("pending");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    first.unmount();

    const recoveredCommand = readPendingOwnerAthleteProfile(window.sessionStorage);
    if (recoveredCommand.kind !== "pending") throw new Error("expected a recoverable pending profile update");
    render(<OwnerAthleteProfileEditor {...editorProps({ pendingCommand: recoveredCommand.command })} />);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Reintentar ficha de Ana García López" }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    expect(mocks.fetch.mock.calls[2]).toEqual(originalRequest);
    expect(await screen.findByText("Ficha actualizada.")).toBeVisible();
    expect(readPendingOwnerAthleteProfile(window.sessionStorage).kind).toBe("none");
  });

  it("no confunde un 409 ni una respuesta 200 malformada con confirmación", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload))
      .mockResolvedValueOnce(response(409, { type: "https://zaltyko.com/problems/conflict", status: 409, title: "Conflicto", detail: "Recarga el perfil." }));
    const user = userEvent.setup();
    render(<OwnerAthleteProfileEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));
    await screen.findByLabelText("Nombre");
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La ficha cambió");
    expect(screen.queryByText("Ficha actualizada.")).not.toBeInTheDocument();

    cleanup();
    window.sessionStorage.clear();
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload)).mockResolvedValueOnce(response(200, { ok: true, data: { athleteId, givenName: "Ana" } }));
    render(<OwnerAthleteProfileEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));
    await screen.findByLabelText("Nombre");
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(readPendingOwnerAthleteProfile(window.sessionStorage).kind).toBe("pending");
  });

  it("bloquea la edición en solo lectura y descarta una respuesta tardía de otra sede", async () => {
    const onSaved = vi.fn();
    const pendingGet = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockReturnValueOnce(pendingGet.promise);
    const user = userEvent.setup();
    const view = render(<OwnerAthleteProfileEditor {...editorProps({ readOnly: true })} />);
    expect(screen.getByRole("button", { name: "Editar ficha de Ana García López" })).toBeDisabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    view.unmount();

    const editable = render(<OwnerAthleteProfileEditor {...editorProps({ onSaved })} />);
    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));
    editable.rerender(<OwnerAthleteProfileEditor {...editorProps({ locationId: "40000000-0000-4000-8000-000000000099", onSaved })} />);
    await act(async () => {
      pendingGet.resolve(response(200, profilePayload));
      await pendingGet.promise;
    });
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("conserva el marcador si un PATCH responde después de cambiar la sede", async () => {
    const patch = deferred<ReturnType<typeof response>>();
    const onSaved = vi.fn();
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload)).mockReturnValueOnce(patch.promise);
    const user = userEvent.setup();
    const view = render(<OwnerAthleteProfileEditor {...editorProps({ onSaved })} />);
    await user.click(screen.getByRole("button", { name: "Editar ficha de Ana García López" }));
    await screen.findByLabelText("Nombre");
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));
    expect(readPendingOwnerAthleteProfile(window.sessionStorage).kind).toBe("pending");

    view.rerender(<OwnerAthleteProfileEditor {...editorProps({ locationId: "40000000-0000-4000-8000-000000000099", onSaved })} />);
    await act(async () => {
      patch.resolve(response(200, { ok: true, data: { athleteId, givenName: "Ana nueva", familyName: "García López", replayed: false } }));
      await patch.promise;
    });

    expect(onSaved).not.toHaveBeenCalled();
    const pending = readPendingOwnerAthleteProfile(window.sessionStorage);
    expect(pending.kind).toBe("pending");
    if (pending.kind === "pending") expect(pending.command.locationId).toBe(locationId);
  });

  it.each([false, true])("permite recuperar la ficha desde el gestor conservando clave y bloqueo de otras escrituras (recarga=%s)", async (reload) => {
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload))
      .mockRejectedValueOnce(new Error("response lost after commit"))
      .mockResolvedValueOnce(response(200, {
        ok: true,
        data: { athleteId, givenName: "Ana actual", familyName: "García López", replayed: true },
      }));
    const user = userEvent.setup();
    const view = render(<OwnerGroupsManager bundle={bundle} />);
    const edit = await screen.findByRole("button", { name: "Editar ficha de Ana García López" });
    await waitFor(() => expect(edit).toBeEnabled());
    await user.click(edit);
    const editor = await screen.findByRole("region", { name: "Editar ficha de gimnasta" });
    const name = await within(editor).findByLabelText("Nombre", { exact: true });
    await user.clear(name);
    await user.type(name, "Ana actual");
    const save = screen.getByRole("button", { name: "Guardar ficha" });
    expect(save).toBeEnabled();
    await user.click(save);
    await screen.findByText(/No sabemos si se guardó la ficha/);
    const original = mocks.fetch.mock.calls[1][1];
    if (reload) {
      view.unmount();
      render(<OwnerGroupsManager bundle={bundle} />);
    }
    const retry = await screen.findByRole("button", { name: "Reintentar ficha de Ana García López" });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.getByRole("button", { name: "Dar de baja a Ana García López" })).toBeDisabled();
    await user.click(retry);
    expect(await screen.findByText("Ficha actualizada.")).toBeVisible();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    const replay = mocks.fetch.mock.calls[2][1];
    expect(replay.method).toBe("PATCH");
    expect(replay.body).toBe(original.body);
    expect(replay.headers["Idempotency-Key"]).toBe(original.headers["Idempotency-Key"]);
    expect(readPendingOwnerAthleteProfile(window.sessionStorage).kind).toBe("none");
    expect(screen.getByRole("button", { name: "Dar de baja a Ana García López" })).toBeEnabled();
  });

  it("frena las transiciones de pertenencia mientras la ficha se está editando", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, profilePayload));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={bundle} />);
    const edit = await screen.findByRole("button", { name: "Editar ficha de Ana García López" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Dar de baja a Ana García López" })).toBeEnabled());
    await user.click(edit);
    const editor = await screen.findByRole("region", { name: "Editar ficha de gimnasta" });
    expect(await within(editor).findByLabelText("Nombre")).toHaveValue("Ana");
    expect(screen.getByRole("button", { name: "Dar de baja a Ana García López" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cerrar editor" }));
    expect(screen.getByRole("button", { name: "Dar de baja a Ana García López" })).toBeEnabled();
  });
});
