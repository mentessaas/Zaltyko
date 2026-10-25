// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import {
  OwnerAthleteFamilyAssociationEditor,
  PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY,
  readPendingOwnerAthleteFamilyAssociation,
} from "@/components/owner-dashboard/OwnerAthleteFamilyAssociationEditor";
import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "40000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000002";
const groupId = "40000000-0000-4000-8000-000000000003";
const athleteId = "40000000-0000-4000-8000-000000000004";
const membershipId = "40000000-0000-4000-8000-000000000005";
const payerId = "40000000-0000-4000-8000-000000000006";
const familyId = "40000000-0000-4000-8000-000000000007";
const otherPayerId = "40000000-0000-4000-8000-000000000008";
const guardianId = "40000000-0000-4000-8000-000000000011";
const today = "2026-10-25";

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

const familyOptionsPayload = {
  ok: true,
  data: {
    families: [{
      familyId,
      athletes: [{ athleteId, athleteName: "Ana García" }],
      payers: [
        { familyPayerId: payerId, displayName: "María García", isPrimary: true },
        { familyPayerId: otherPayerId, displayName: "Luis García", isPrimary: false },
      ],
    }],
  },
};
const createdReceipt = { ok: true, data: { familyId, familyPayerId: payerId } };
const familyOptionsWithGuardian = {
  ok: true,
  data: {
    families: [{
      ...familyOptionsPayload.data.families[0],
      payers: familyOptionsPayload.data.families[0].payers.map((payer, index) => ({
        ...payer,
        guardianId: index === 0 ? guardianId : "40000000-0000-4000-8000-000000000012",
      })),
    }],
  },
};

function editorProps(overrides: Partial<ComponentProps<typeof OwnerAthleteFamilyAssociationEditor>> = {}) {
  return {
    organizationId,
    locationId,
    groupId,
    athleteId,
    athleteName: "Ana García",
    effectiveFrom: today,
    allowExistingFamilies: true,
    ...overrides,
  };
}

const managerBundle = {
  organization: { id: organizationId, name: "Academia sintética", defaultCurrency: "EUR" },
  member: { id: "manager-synthetic", role: "manager", locationScopeMode: "all" },
  locations: [{ id: locationId, name: "Sede sintética", timezone: "Europe/Madrid" }],
  programs: [{ id: "40000000-0000-4000-8000-000000000009", name: "Gimnasia", kind: "gymnastics_sport" }],
  groups: [{
    id: groupId,
    name: "Grupo sintético",
    capacity: 12,
    status: "active",
    locationId,
    locationName: "Sede sintética",
    timezone: "Europe/Madrid",
    programId: "40000000-0000-4000-8000-000000000009",
    programName: "Gimnasia",
    memberCount: 1,
  }],
  selectedGroupId: groupId,
  memberships: [{ id: membershipId, athleteId, athleteName: "Ana García", status: "active", startsOn: today }],
  localTodayByLocation: { [locationId]: today },
} as unknown as Parameters<typeof OwnerGroupsManager>[0]["bundle"];

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", { randomUUID: () => "40000000-0000-4000-8000-000000000099" });
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "growth" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("asociación familiar desde una pertenencia Owner", () => {
  it("carga opciones de familias con GET y muestra error sin permitir una selección inventada", async () => {
    mocks.fetch.mockResolvedValueOnce(response(503, { detail: "Servicio no disponible" }));
    const user = userEvent.setup();
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Servicio no disponible");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][0]).toBe(`/api/v1/owner/families/options?organizationId=${organizationId}&locationId=${locationId}`);
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(screen.getByRole("button", { name: "Cargar familias de nuevo" })).toBeVisible();
  });

  it("asocia una persona con cuerpo estricto, clave idempotente y sin crear cuenta, correo o cargo", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { families: [] } }))
      .mockResolvedValueOnce(response(201, createdReceipt));
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps({ onSaved })} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("region", { name: "Asociar familia" });
    await user.type(screen.getByLabelText("Nombre de la persona adulta responsable"), "María");
    await user.type(screen.getByLabelText("Apellidos"), "García");
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));

    expect(await screen.findByRole("status")).toHaveTextContent("No se creó una cuenta");
    const [url, init] = mocks.fetch.mock.calls[1];
    expect(url).toBe("/api/v1/owner/families/associations");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "Idempotency-Key": "40000000-0000-4000-8000-000000000099",
    });
    expect(JSON.parse(init.body)).toEqual({
      organizationId,
      locationId,
      athleteIds: [athleteId],
      effectiveFrom: today,
      payer: { givenName: "María", familyName: "García", relationship: "parent" },
    });
    expect(JSON.stringify(JSON.parse(init.body))).not.toMatch(/email|account|charge/i);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(readPendingOwnerAthleteFamilyAssociation(window.sessionStorage)).toEqual({ kind: "none" });
  });

  it("solo ofrece familia existente con alcance completo y exige confirmar el cambio de pagador principal", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, familyOptionsPayload)).mockResolvedValueOnce(response(201, {
      ok: true,
      data: { familyId, familyPayerId: otherPayerId },
    }));
    const user = userEvent.setup();
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("radio", { name: "Elegir una familia existente" });
    await user.click(screen.getByRole("radio", { name: "Elegir una familia existente" }));
    await user.selectOptions(screen.getByLabelText("Familia existente"), familyId);
    await user.selectOptions(screen.getByLabelText("Persona pagadora de esta familia"), otherPayerId);

    expect(screen.getByRole("checkbox", { name: /pasará a ser el pagador principal de toda la familia/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Asociar familia" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));
    expect(mocks.fetch).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("checkbox", { name: /pasará a ser el pagador principal de toda la familia/i }));
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Familia vinculada");
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
      organizationId,
      locationId,
      familyId,
      athleteIds: [athleteId],
      effectiveFrom: today,
      payer: { familyPayerId: otherPayerId, confirmPrimaryPayerChange: true },
    });
  });

  it("no pide confirmación ni envía un acuse al conservar el pagador principal", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, familyOptionsPayload))
      .mockResolvedValueOnce(response(201, { ok: true, data: { familyId, familyPayerId: payerId } }));
    const user = userEvent.setup();
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await user.click(await screen.findByRole("radio", { name: "Elegir una familia existente" }));
    await user.selectOptions(screen.getByLabelText("Familia existente"), familyId);
    await user.selectOptions(screen.getByLabelText("Persona pagadora de esta familia"), payerId);

    expect(screen.queryByRole("checkbox", { name: /pasará a ser el pagador principal/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Familia vinculada");
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
      organizationId,
      locationId,
      familyId,
      athleteIds: [athleteId],
      effectiveFrom: today,
      payer: { familyPayerId: payerId },
    });
  });

  it("no consulta ni ofrece familias existentes a una persona limitada a una sede", async () => {
    const user = userEvent.setup();
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps({ allowExistingFamilies: false })} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));

    expect(screen.queryByRole("radio", { name: "Elegir una familia existente" })).not.toBeInTheDocument();
    expect(screen.getByText(/selección de familias existentes requiere acceso a todas las sedes/i)).toBeVisible();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("abre contactos solo para el pagador de una familia existente y fuera del formulario de asociación", async () => {
    const post = deferred<ReturnType<typeof response>>();
    const currentContacts = {
      ok: true,
      data: {
        guardianId,
        contacts: {
          email: { contactId: "40000000-0000-4000-8000-000000000013", value: "old@example.test", verifiedAt: null, updatedAt: "2026-10-24T10:00:00.000Z" },
          phone: null,
        },
      },
    };
    const changedContacts = {
      ok: true,
      data: {
        guardianId,
        replayed: false,
        contacts: {
          email: { contactId: "40000000-0000-4000-8000-000000000014", value: "new@example.test", verifiedAt: null, updatedAt: "2026-10-25T10:00:00.000Z" },
          phone: null,
        },
      },
    };
    mocks.fetch.mockResolvedValueOnce(response(200, familyOptionsWithGuardian))
      .mockResolvedValueOnce(response(200, currentContacts))
      .mockReturnValueOnce(post.promise);
    const user = userEvent.setup();
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await user.click(await screen.findByRole("radio", { name: "Elegir una familia existente" }));
    await user.selectOptions(screen.getByLabelText("Familia existente"), familyId);
    await user.selectOptions(screen.getByLabelText("Persona pagadora de esta familia"), payerId);

    const openContacts = screen.getByRole("button", { name: "Contactos de María García" });
    await user.click(openContacts);
    const contactsRegion = await screen.findByRole("region", { name: "Contactos de María García" });
    expect(contactsRegion.closest("form")).toBeNull();
    expect(mocks.fetch.mock.calls[1][0]).toBe(`/api/v1/owner/guardians/${guardianId}/contacts?organizationId=${organizationId}&locationId=${locationId}`);
    await user.click(await screen.findByRole("button", { name: "Editar correo" }));
    await user.clear(screen.getByLabelText("Correo electrónico"));
    await user.type(screen.getByLabelText("Correo electrónico"), " New@Example.Test ");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    const [url, init] = mocks.fetch.mock.calls[2];
    expect(url).toBe(`/api/v1/owner/guardians/${guardianId}/contacts`);
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "Idempotency-Key": "40000000-0000-4000-8000-000000000099",
    });
    expect(JSON.parse(init.body)).toEqual({
      organizationId,
      locationId,
      kind: "email",
      expectedContactId: "40000000-0000-4000-8000-000000000013",
      expectedValue: "old@example.test",
      expectedUpdatedAt: "2026-10-24T10:00:00.000Z",
      value: "new@example.test",
    });
    expect(screen.getByLabelText("Familia existente")).toBeDisabled();
    expect(screen.getByLabelText("Persona pagadora de esta familia")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar asociación" })).toBeDisabled();

    await act(async () => {
      post.resolve(response(200, changedContacts));
      await post.promise;
    });
    expect(await screen.findByRole("status")).toHaveTextContent("No se ha enviado correo ni verificado");
    expect(screen.getByLabelText("Familia existente")).toBeEnabled();
    expect(screen.getByLabelText("Persona pagadora de esta familia")).toBeEnabled();
  });

  it("ignora doble envío mientras una primera petición sigue pendiente", async () => {
    const post = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { families: [] } })).mockReturnValueOnce(post.promise);
    const user = userEvent.setup();
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("region", { name: "Asociar familia" });
    await user.type(screen.getByLabelText("Nombre de la persona adulta responsable"), "María");
    await user.type(screen.getByLabelText("Apellidos"), "García");
    await user.dblClick(screen.getByRole("button", { name: "Asociar familia" }));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      post.resolve(response(201, createdReceipt));
      await post.promise;
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Familia vinculada");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("conserva cuerpo y clave ante respuesta perdida, y tras recarga solo reintenta a petición explícita", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, familyOptionsPayload))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(200, { ok: true, data: { familyId, familyPayerId: otherPayerId } }));
    const user = userEvent.setup();
    const first = render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("region", { name: "Asociar familia" });
    await user.click(screen.getByRole("radio", { name: "Elegir una familia existente" }));
    await user.selectOptions(screen.getByLabelText("Familia existente"), familyId);
    await user.selectOptions(screen.getByLabelText("Persona pagadora de esta familia"), otherPayerId);
    await user.click(screen.getByRole("checkbox", { name: /pasará a ser el pagador principal de toda la familia/i }));
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const originalRequest = mocks.fetch.mock.calls[1];
    const saved = readPendingOwnerAthleteFamilyAssociation(window.sessionStorage);
    expect(saved.kind).toBe("pending");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    first.unmount();

    const recovered = readPendingOwnerAthleteFamilyAssociation(window.sessionStorage);
    if (recovered.kind !== "pending") throw new Error("expected recoverable association");
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps({ pendingCommand: recovered.command })} />);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Reintentar asociación familiar de Ana García" }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    expect(mocks.fetch.mock.calls[2]).toEqual(originalRequest);
    expect(await screen.findByRole("status")).toHaveTextContent("Familia vinculada");
    expect(readPendingOwnerAthleteFamilyAssociation(window.sessionStorage).kind).toBe("none");
  });

  it("mantiene la operación incierta con una respuesta malformada y limpia un rechazo Problem Details definitivo", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { families: [] } }))
      .mockResolvedValueOnce(response(201, { ok: true, data: { familyId } }));
    const user = userEvent.setup();
    const view = render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("region", { name: "Asociar familia" });
    await user.type(screen.getByLabelText("Nombre de la persona adulta responsable"), "María");
    await user.type(screen.getByLabelText("Apellidos"), "García");
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(readPendingOwnerAthleteFamilyAssociation(window.sessionStorage).kind).toBe("pending");

    view.unmount();
    window.sessionStorage.clear();
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { families: [] } }))
      .mockResolvedValueOnce(response(409, {
        type: "https://zaltyko.com/problems/family-membership-date-conflict",
        title: "Conflicto",
        status: 409,
        detail: "La fecha efectiva se solapa.",
      }));
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("region", { name: "Asociar familia" });
    await user.type(screen.getByLabelText("Nombre de la persona adulta responsable"), "María");
    await user.type(screen.getByLabelText("Apellidos"), "García");
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La fecha efectiva se solapa");
    expect(readPendingOwnerAthleteFamilyAssociation(window.sessionStorage).kind).toBe("none");
  });

  it("frena las escrituras de pertenencia mientras la asociación familiar está abierta", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, familyOptionsPayload));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={managerBundle} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Vincular familia a Ana García" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("region", { name: "Asociar familia" });

    expect(screen.getByRole("button", { name: "Asociar familia" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Editar ficha de Ana García" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dar de baja a Ana García" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cerrar asociación" }));
    expect(screen.getByRole("button", { name: "Dar de baja a Ana García" })).toBeEnabled();
  });

  it("conserva el marcador incierto si un reintento recibe Problem Details 4xx", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { families: [] } }))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(409, {
        type: "https://zaltyko.com/problems/family-membership-date-conflict",
        title: "Conflicto",
        status: 409,
        detail: "La fecha efectiva se solapa.",
      }));
    const user = userEvent.setup();
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("region", { name: "Asociar familia" });
    await user.type(screen.getByLabelText("Nombre de la persona adulta responsable"), "María");
    await user.type(screen.getByLabelText("Apellidos"), "García");
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    const firstRequest = mocks.fetch.mock.calls[1];

    await user.click(screen.getByRole("button", { name: "Reintentar asociación familiar de Ana García" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(readPendingOwnerAthleteFamilyAssociation(window.sessionStorage).kind).toBe("pending");
    expect(mocks.fetch.mock.calls[2]).toEqual(firstRequest);
  });

  it("frena otras escrituras ante una respuesta incierta y reintenta la misma asociación desde la fila", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { families: [] } }))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(200, createdReceipt));
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={managerBundle} />);
    const open = await screen.findByRole("button", { name: "Vincular familia a Ana García" });
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);
    await screen.findByRole("region", { name: "Asociar familia" });
    await user.type(screen.getByLabelText("Nombre de la persona adulta responsable"), "María");
    await user.type(within(screen.getByRole("region", { name: "Asociar familia" })).getByLabelText("Apellidos"), "García");
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar ficha de Ana García" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dar de baja a Ana García" })).toBeDisabled();
    const firstPost = mocks.fetch.mock.calls[1];
    expect(readPendingOwnerAthleteFamilyAssociation(window.sessionStorage).kind).toBe("pending");

    await user.click(screen.getByRole("button", { name: "Reintentar asociación familiar de Ana García" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    expect(mocks.fetch.mock.calls[2]).toEqual(firstPost);
    expect(await screen.findByRole("status")).toHaveTextContent("Familia vinculada");
    expect(readPendingOwnerAthleteFamilyAssociation(window.sessionStorage).kind).toBe("none");
  });

  it("ignora opciones que llegan tarde de una sede anterior", async () => {
    const options = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockReturnValueOnce(options.promise);
    const user = userEvent.setup();
    const view = render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    view.rerender(<OwnerAthleteFamilyAssociationEditor {...editorProps({ locationId: "40000000-0000-4000-8000-000000000010" })} />);

    await act(async () => {
      options.resolve(response(200, familyOptionsPayload));
      await options.promise;
    });

    expect(screen.queryByLabelText("Familia existente")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vincular familia a Ana García" })).toHaveAttribute("aria-expanded", "false");
  });

  it("conserva el marcador si el formulario cambia de sede antes de la respuesta", async () => {
    const post = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { families: [] } })).mockReturnValueOnce(post.promise);
    const user = userEvent.setup();
    const view = render(<OwnerAthleteFamilyAssociationEditor {...editorProps()} />);
    await user.click(screen.getByRole("button", { name: "Vincular familia a Ana García" }));
    await screen.findByRole("region", { name: "Asociar familia" });
    await user.type(screen.getByLabelText("Nombre de la persona adulta responsable"), "María");
    await user.type(screen.getByLabelText("Apellidos"), "García");
    await user.click(screen.getByRole("button", { name: "Asociar familia" }));
    expect(readPendingOwnerAthleteFamilyAssociation(window.sessionStorage).kind).toBe("pending");

    view.rerender(<OwnerAthleteFamilyAssociationEditor {...editorProps({ locationId: "40000000-0000-4000-8000-000000000010" })} />);
    await act(async () => {
      post.resolve(response(201, createdReceipt));
      await post.promise;
    });

    expect(mocks.refresh).not.toHaveBeenCalled();
    const pending = readPendingOwnerAthleteFamilyAssociation(window.sessionStorage);
    expect(pending.kind).toBe("pending");
    if (pending.kind === "pending") expect(pending.command.locationId).toBe(locationId);
  });

  it("bloquea nueva asociación en solo lectura sin cargar opciones", () => {
    render(<OwnerAthleteFamilyAssociationEditor {...editorProps({ readOnly: true })} />);
    expect(screen.getByRole("button", { name: "Vincular familia a Ana García" })).toBeDisabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
