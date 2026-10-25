// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useLayoutEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";
import {
  beginOwnerPlanUsageRead,
  markOwnerPlanUsageUnavailable,
  publishOwnerPlanUsage,
} from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const programId = "10000000-0000-4000-8000-000000000003";
const groupId = "10000000-0000-4000-8000-000000000004";
const athleteId = "10000000-0000-4000-8000-000000000005";
const membershipId = "10000000-0000-4000-8000-000000000006";
const groupReceipt = { ok: true, data: { id: groupId, name: "Iniciación", locationId, programId, capacity: 12 } };
const membershipReceipt = { ok: true, data: { id: membershipId, groupId, athleteId, startsOn: "2026-10-13", status: "active" } };

const emptyBundle = {
  organization: {
    id: organizationId,
    name: "Academia sintética",
    defaultCurrency: "EUR",
  },
  member: { id: "manager-1", role: "manager", locationScopeMode: "all" },
  locations: [
    { id: locationId, name: "Sede Centro", timezone: "Europe/Madrid" },
  ],
  programs: [
    { id: programId, name: "Gimnasia artística", kind: "gymnastics_sport" },
  ],
  groups: [],
  selectedGroupId: null,
  memberships: [],
  localTodayByLocation: { [locationId]: "2026-10-13" },
} as never;

const groupBundle = {
  ...emptyBundle,
  groups: [
    {
      id: groupId,
      name: "Iniciación",
      capacity: 12,
      status: "active",
      locationId,
      locationName: "Sede Centro",
      timezone: "Europe/Madrid",
      programId,
      programName: "Gimnasia artística",
      memberCount: 0,
      updatedAtVersion: "2026-10-13T09:00:00.123456Z",
    },
  ],
  selectedGroupId: groupId,
} as never;

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockFetch.mockReset();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000007" });
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("gestión de grupos owner", () => {
  it("conserva la sede al volver al resumen y omite locationId si el ámbito es agregado", () => {
    const scopedBundle = { ...groupBundle, selectedLocationId: locationId } as never;
    const { rerender } = render(<OwnerGroupsManager bundle={scopedBundle} />);
    expect(screen.getByRole("link", { name: "Volver al resumen" })).toHaveAttribute(
      "href",
      `/owner?organizationId=${organizationId}&locationId=${locationId}`
    );

    rerender(
      <OwnerGroupsManager
        bundle={{ ...groupBundle, selectedLocationId: null } as never}
      />
    );
    expect(screen.getByRole("link", { name: "Volver al resumen" })).toHaveAttribute(
      "href",
      `/owner?organizationId=${organizationId}`
    );
  });

  it("bloquea nuevas escrituras mientras el uso es desconocido y ofrece volver a consultarlo", async () => {
    const usageRead = beginOwnerPlanUsageRead(organizationId);
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={groupBundle} />);

    await waitFor(() => expect(screen.queryByText(/Comprobando si hay una creación pendiente/)).not.toBeInTheDocument());
    expect(screen.getByText(/Comprobando los límites del plan/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeEnabled();

    act(() => markOwnerPlanUsageUnavailable(organizationId, usageRead));
    expect(screen.getByText(/No se pudieron comprobar los límites del plan/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Consultar uso y regularizar" })).toHaveAttribute("href", `/owner/subscription?organizationId=${organizationId}#regularizar`);
    const dispatch = vi.spyOn(window, "dispatchEvent");
    await user.click(screen.getByRole("button", { name: "Volver a comprobar límites" }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "zaltyko:plan-usage-changed" }));
  });

  it("permite cerrar un formulario de grupo abierto al bloquearse, sin permitir abrirlo", async () => {
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={groupBundle} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear grupo" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Crear grupo" }));
    expect(screen.getByLabelText("Nombre del grupo")).toBeVisible();

    act(() => publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" }));
    const closeButton = screen.getByRole("button", { name: "Cerrar formulario" });
    expect(closeButton).toBeEnabled();
    await user.click(closeButton);
    expect(screen.queryByLabelText("Nombre del grupo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
  });

  it("mantiene el buscador y la indicación de añadir en un grupo activo vacío", () => {
    render(<OwnerGroupsManager bundle={groupBundle} />);

    expect(screen.getByLabelText("Añadir una gimnasta")).toBeVisible();
    expect(screen.getByText(/Puedes añadir una ficha activa desde el buscador/)).toBeVisible();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("edita nombre y capacidad del grupo con versión e idempotencia", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          id: groupId,
          name: "Equipo juvenil",
          capacity: 18,
          updatedAtVersion: "2026-10-13T09:01:00.000001Z",
        },
      }),
    });

    render(<OwnerGroupsManager bundle={groupBundle} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Editar grupo" })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Editar grupo" }));
    const name = screen.getByLabelText("Nombre del grupo");
    const capacity = screen.getByLabelText("Plazas máximas");
    await user.clear(name);
    await user.type(name, "Equipo juvenil");
    await user.clear(capacity);
    await user.type(capacity, "18");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/owner/groups/${groupId}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      organizationId,
      expectedUpdatedAt: "2026-10-13T09:00:00.123456Z",
      name: "Equipo juvenil",
      capacity: 18,
    });
    expect((init.headers as Record<string, string>)["idempotency-key"]).toMatch(
      /^owner-group-update:/
    );
    expect(await screen.findByText(/Grupo actualizado/)).toBeVisible();
    expect(window.sessionStorage.length).toBe(0);
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("reintenta exactamente la misma edición tras una respuesta ambigua", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Resultado temporalmente desconocido." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            id: groupId,
            name: "Iniciación avanzada",
            capacity: 12,
            updatedAtVersion: "2026-10-13T09:01:00.000001Z",
          },
        }),
      });

    render(<OwnerGroupsManager bundle={groupBundle} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Editar grupo" })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Editar grupo" }));
    await user.clear(screen.getByLabelText("Nombre del grupo"));
    await user.type(screen.getByLabelText("Nombre del grupo"), "Iniciación avanzada");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reintentar el mismo guardado" })).toBeEnabled()
    );
    expect(window.sessionStorage.length).toBe(1);
    await user.click(screen.getByRole("button", { name: "Reintentar el mismo guardado" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(first.headers).toEqual(retry.headers);
    expect(first.body).toBe(retry.body);
    expect(await screen.findByText(/Grupo actualizado/)).toBeVisible();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("bloquea la edición del grupo cuando Free está en solo lectura", async () => {
    publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" });
    render(<OwnerGroupsManager bundle={groupBundle} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Editar grupo" })).toBeDisabled()
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("presenta un grupo archivado vacío solo para consulta sin invitar a añadir", () => {
    const activeBundle = groupBundle as Parameters<typeof OwnerGroupsManager>[0]["bundle"];
    const archivedBundle = {
      ...activeBundle,
      groups: activeBundle.groups.map((group) => ({ ...group, status: "archived" })),
    } as never;
    render(<OwnerGroupsManager bundle={archivedBundle} />);

    expect(screen.getByText(/Está inactivo y no admite nuevas gimnastas/)).toBeVisible();
    expect(screen.queryByLabelText("Añadir una gimnasta")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear y añadir al grupo" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Puedes añadir una ficha activa desde el buscador/)).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("identifica a la gimnasta afectada en el nombre accesible de cada transición", () => {
    const bundleWithMemberships = {
      ...groupBundle,
      memberships: [
        { id: "pending-membership", athleteId, athleteName: "Ana Sintética", status: "pending", startsOn: "2026-10-13" },
        { id: "active-membership", athleteId: "athlete-active", athleteName: "Bea Sintética", status: "active", startsOn: "2026-10-13" },
        { id: "paused-membership", athleteId: "athlete-paused", athleteName: "Carla Sintética", status: "paused", startsOn: "2026-10-13" },
      ],
    } as never;
    render(<OwnerGroupsManager bundle={bundleWithMemberships} />);

    expect(screen.getByRole("button", { name: "Activar a Ana Sintética" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de baja a Ana Sintética" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poner en pausa a Bea Sintética" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de baja a Bea Sintética" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivar a Carla Sintética" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de baja a Carla Sintética" })).toBeInTheDocument();
  });

  it("edita el perfil con la misma clave y cuerpo tras una respuesta ambigua, sin persistir nombres", async () => {
    const user = userEvent.setup();
    const bundle = {
      ...groupBundle,
      memberships: [{
        id: membershipId,
        athleteId,
        athleteName: "Ana QA",
        givenName: "Ana",
        familyName: "QA",
        preferredName: null,
        profileVersion: "2026-10-13T09:00:00.123456Z",
        status: "active",
        startsOn: "2026-10-13",
        endsOn: null,
      }],
    } as never;
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "No se pudo confirmar el resultado." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: {
          athleteId,
          givenName: "Alicia",
          familyName: "Giménez",
          preferredName: "Ali",
          profileVersion: "2026-10-13T09:01:00.000001Z",
        } }),
      });

    render(<OwnerGroupsManager bundle={bundle} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar datos de Ana QA" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Editar datos de Ana QA" }));
    const givenName = screen.getByLabelText("Nombre de Ana QA");
    const familyName = screen.getByLabelText("Apellidos de Ana QA");
    const preferredName = screen.getByLabelText("Nombre preferido de Ana QA (opcional)");
    await user.clear(givenName);
    await user.type(givenName, "Alicia");
    await user.clear(familyName);
    await user.type(familyName, "Giménez");
    await user.type(preferredName, "Ali");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó la edición");
    expect(screen.getByRole("button", { name: "Reintentar el mismo guardado" })).toBeEnabled();
    expect(givenName).toBeDisabled();
    expect(window.sessionStorage.length).toBe(0);

    await user.click(screen.getByRole("button", { name: "Reintentar el mismo guardado" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(first.method).toBe("PATCH");
    expect(first.headers).toEqual(retry.headers);
    expect(first.body).toBe(retry.body);
    expect(JSON.parse(String(first.body))).toEqual({
      organizationId,
      givenName: "Alicia",
      familyName: "Giménez",
      preferredName: "Ali",
      expectedProfileVersion: "2026-10-13T09:00:00.123456Z",
    });
    expect(await screen.findByText("Datos de la ficha actualizados.")).toBeVisible();
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("bloquea la edición de perfil cuando Free está en solo lectura", () => {
    publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" });
    const bundle = {
      ...groupBundle,
      memberships: [{
        id: membershipId,
        athleteId,
        athleteName: "Ana QA",
        givenName: "Ana",
        familyName: "QA",
        preferredName: null,
        profileVersion: "2026-10-13T09:00:00.123456Z",
        status: "active",
        startsOn: "2026-10-13",
        endsOn: null,
      }],
    } as never;

    render(<OwnerGroupsManager bundle={bundle} />);

    expect(screen.getByRole("button", { name: "Editar datos de Ana QA" })).toBeDisabled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("en solo lectura conserva la consulta y el historial y desactiva las altas y transiciones", async () => {
    publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" });
    const bundleWithHistory = {
      ...groupBundle,
      memberships: [{ id: membershipId, athleteId, athleteName: "Ana Sintética", status: "paused", startsOn: "2026-10-13" }],
    } as never;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { items: [{ id: athleteId, name: "Bea Sintética" }] } }),
    });
    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={bundleWithHistory} />);

    expect(screen.getByText(/La academia está en solo lectura/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Uso y regularización" })).toHaveAttribute("href", `/owner/subscription?organizationId=${organizationId}#regularizar`);
    expect(screen.getByText("Ana Sintética")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reactivar a Ana Sintética" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeEnabled();

    await user.type(screen.getByLabelText("Añadir una gimnasta"), "Bea");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByText("Bea Sintética")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Buscar" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Añadir" })).toBeDisabled();
    await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear y añadir al grupo" })).toBeDisabled();

    await waitFor(() => expect(screen.queryByText(/Comprobando si hay una creación pendiente/)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeDisabled();
    expect(screen.queryByLabelText("Nombre del grupo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar grupo" })).not.toBeInTheDocument();
    expect(mockFetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });

  it("presenta la creación en el estado vacío y reintenta con la misma clave", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "No se pudo confirmar el resultado." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => groupReceipt,
      });

    render(<OwnerGroupsManager bundle={emptyBundle} />);

    expect(
      screen.getByRole("heading", { name: "Aún no hay grupos" })
    ).toBeVisible();
    await user.type(screen.getByLabelText("Nombre del grupo"), "Iniciación");
    await user.type(screen.getByLabelText("Plazas (opcional)"), "12");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar el resultado."
    );

    await user.click(
      screen.getByRole("button", { name: "Reintentar creación pendiente" })
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(first.headers).toEqual(retry.headers);
    expect(first.headers).toMatchObject({
      "idempotency-key": "00000000-0000-4000-8000-000000000007",
    });
    expect(first.body).toBe(retry.body);
    expect(JSON.parse(String(first.body))).toMatchObject({
      organizationId,
      locationId,
      programId,
      name: "Iniciación",
      capacity: 12,
    });
    expect(mockPush).toHaveBeenCalledWith(
      `/owner/groups?organizationId=${organizationId}&locationId=${locationId}&groupId=${groupId}`
    );
  });

  it("restaura y reintenta el snapshot exacto tras volver a abrir la página", async () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce("first-group-command")
      .mockReturnValueOnce("new-group-command");
    vi.stubGlobal("crypto", { randomUUID });
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "No se pudo confirmar el resultado." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => groupReceipt,
      });

    const firstUser = userEvent.setup();
    const firstPage = render(<OwnerGroupsManager bundle={emptyBundle} />);
    await firstUser.type(
      screen.getByLabelText("Nombre del grupo"),
      "Iniciación"
    );
    await firstUser.type(screen.getByLabelText("Plazas (opcional)"), "12");
    await firstUser.click(
      screen.getByRole("button", { name: "Guardar grupo" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar el resultado."
    );
    firstPage.unmount();

    const secondUser = userEvent.setup();
    render(<OwnerGroupsManager bundle={emptyBundle} />);
    expect(
      await screen.findByRole("heading", {
        name: "Creación de grupo pendiente de confirmar",
      })
    ).toBeVisible();
    expect(screen.getByLabelText("Nombre del grupo")).toHaveValue("Iniciación");
    expect(screen.getByLabelText("Plazas (opcional)")).toHaveValue(12);
    expect(screen.getByLabelText("Nombre del grupo")).toBeDisabled();
    await secondUser.click(
      screen.getByRole("button", { name: "Reintentar creación pendiente" })
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(first.headers).toMatchObject({
      "idempotency-key": "first-group-command",
    });
    expect(retry.headers).toEqual(first.headers);
    expect(retry.body).toBe(first.body);
    expect(JSON.parse(String(retry.body))).toMatchObject({
      name: "Iniciación",
      capacity: 12,
    });
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("usa una clave nueva al editar el comando tras un rechazo definitivo", async () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce("rejected-group-command")
      .mockReturnValueOnce("edited-group-command");
    vi.stubGlobal("crypto", { randomUUID });
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ type: "https://zaltyko.com/problems/invalid-group-command", status: 400, title: "Solicitud no válida", detail: "El grupo no se pudo crear." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => groupReceipt,
      });

    const user = userEvent.setup();
    render(<OwnerGroupsManager bundle={emptyBundle} />);
    const nameInput = screen.getByLabelText("Nombre del grupo");
    await user.type(nameInput, "Iniciación");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El grupo no se pudo crear."
    );

    await user.clear(nameInput);
    await user.type(nameInput, "Avanzado");
    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    const rejected = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const edited = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(rejected.headers).toMatchObject({
      "idempotency-key": "rejected-group-command",
    });
    expect(edited.headers).toMatchObject({
      "idempotency-key": "edited-group-command",
    });
    expect(edited.body).not.toBe(rejected.body);
    expect(JSON.parse(String(edited.body))).toMatchObject({ name: "Avanzado" });
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("no reutiliza el snapshot pendiente de otra organización", async () => {
    const otherOrganizationId = "20000000-0000-4000-8000-000000000001";
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce("first-organization-command")
      .mockReturnValueOnce("second-organization-command");
    vi.stubGlobal("crypto", { randomUUID });
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "No se pudo confirmar el resultado." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => groupReceipt,
      });

    const firstUser = userEvent.setup();
    const firstPage = render(<OwnerGroupsManager bundle={emptyBundle} />);
    await firstUser.type(
      screen.getByLabelText("Nombre del grupo"),
      "Iniciación"
    );
    await firstUser.click(
      screen.getByRole("button", { name: "Guardar grupo" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar el resultado."
    );
    const oldOrganizationRetry = screen.getByRole("button", {
      name: "Reintentar creación pendiente",
    });

    const otherBundle = {
      ...emptyBundle,
      organization: { ...emptyBundle.organization, id: otherOrganizationId },
    } as never;
    publishOwnerPlanUsage(otherOrganizationId, { readOnly: false, planCode: "free" });
    const secondUser = userEvent.setup();
    firstPage.rerender(<OwnerGroupsManager bundle={otherBundle} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Guardar grupo" })
      ).toBeEnabled()
    );
    oldOrganizationRetry.click();
    expect(
      screen.queryByRole("heading", {
        name: "Creación de grupo pendiente de confirmar",
      })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre del grupo")).toHaveValue("");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await secondUser.type(screen.getByLabelText("Nombre del grupo"), "Rítmica");
    await secondUser.click(
      screen.getByRole("button", { name: "Guardar grupo" })
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    const otherOrganizationRequest = mockFetch.mock
      .calls[1]?.[1] as RequestInit;
    expect(otherOrganizationRequest.headers).toMatchObject({
      "idempotency-key": "second-organization-command",
    });
    expect(JSON.parse(String(otherOrganizationRequest.body))).toMatchObject({
      organizationId: otherOrganizationId,
      name: "Rítmica",
    });
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("reinicia el borrador de crear grupo antes de mostrar otra academia", async () => {
    const otherOrganizationId = "20000000-0000-4000-8000-000000000010";
    const otherLocationId = "20000000-0000-4000-8000-000000000011";
    const otherProgramId = "20000000-0000-4000-8000-000000000012";
    const otherBundle = {
      ...emptyBundle,
      organization: { ...emptyBundle.organization, id: otherOrganizationId },
      locations: [{ ...emptyBundle.locations[0], id: otherLocationId, name: "Sede Norte" }],
      programs: [{ ...emptyBundle.programs[0], id: otherProgramId, name: "Gimnasia rítmica" }],
      localTodayByLocation: { [otherLocationId]: "2026-10-14" },
    } as never;
    publishOwnerPlanUsage(otherOrganizationId, {
      readOnly: false,
      planCode: "free",
    });
    const layoutSnapshots: Array<null | {
      name: string;
      program: string;
      location: string;
      capacity: string;
    }> = [];
    function LayoutProbe({ id }: { id: string }) {
      useLayoutEffect(() => {
        const name = screen.queryByLabelText("Nombre del grupo");
        const program = screen.queryByLabelText("Actividad");
        const location = screen.queryByLabelText("Sede");
        const capacity = screen.queryByLabelText("Plazas (opcional)");
        if (!name || !program || !location || !capacity) {
          layoutSnapshots.push(null);
          return;
        }
        layoutSnapshots.push({
          name: (name as HTMLInputElement).value,
          program: (program as HTMLSelectElement).value,
          location: (location as HTMLSelectElement).value,
          capacity: (capacity as HTMLInputElement).value,
        });
      }, [id]);
      return null;
    }

    const user = userEvent.setup();
    const view = render(
      <>
        <OwnerGroupsManager bundle={emptyBundle} />
        <LayoutProbe id={organizationId} />
      </>
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardar grupo" })).toBeEnabled()
    );
    await user.type(screen.getByLabelText("Nombre del grupo"), "Borrador anterior");
    await user.type(screen.getByLabelText("Plazas (opcional)"), "19");

    view.rerender(
      <>
        <OwnerGroupsManager bundle={otherBundle} />
        <LayoutProbe id={otherOrganizationId} />
      </>
    );

    expect(layoutSnapshots[layoutSnapshots.length - 1]).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardar grupo" })).toBeEnabled()
    );
    expect(screen.getByLabelText("Nombre del grupo")).toHaveValue("");
    expect(screen.getByLabelText("Actividad")).toHaveValue(otherProgramId);
    expect(screen.getByLabelText("Sede")).toHaveValue(otherLocationId);
    expect(
      (screen.getByLabelText("Plazas (opcional)") as HTMLInputElement).value
    ).toBe("");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("bloquea una clave legacy que no tiene un cuerpo recuperable", async () => {
    window.sessionStorage.setItem(
      `zaltyko:pending-group-create:${organizationId}`,
      "legacy-group-command"
    );

    render(<OwnerGroupsManager bundle={emptyBundle} />);

    expect(
      await screen.findByRole("heading", {
        name: "Creación de grupo pendiente de confirmar",
      })
    ).toBeVisible();
    expect(
      screen.getByText(/solicitud anterior.*no se puede reenviar/i)
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Guardar grupo" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Actualizar lista de grupos" })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Contactar soporte" })
    ).toHaveAttribute("href", "/contact?type=support");
    expect(
      screen.queryByRole("button", { name: "Reintentar creación pendiente" })
    ).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("busca solo fichas disponibles y conserva la clave al reintentar el alta", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { items: [{ id: athleteId, name: "Gimnasta Sintética" }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "No se pudo confirmar el resultado." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => membershipReceipt,
      });

    render(<OwnerGroupsManager bundle={groupBundle} />);
    await user.type(screen.getByLabelText("Añadir una gimnasta"), "Gim");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await user.click(await screen.findByRole("button", { name: "Añadir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar el resultado."
    );
    await user.click(screen.getByRole("button", { name: "Reintentar operación pendiente" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    const firstAdd = mockFetch.mock.calls[1]?.[1] as RequestInit;
    const retryAdd = mockFetch.mock.calls[2]?.[1] as RequestInit;
    expect(firstAdd.headers).toEqual(retryAdd.headers);
    expect(firstAdd.body).toBe(retryAdd.body);
    expect(JSON.parse(String(firstAdd.body))).toMatchObject({
      organizationId,
      athleteId,
      startsOn: "2026-10-13",
      status: "active",
    });
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("crea y añade una ficha mínima con un solo envío idempotente", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "No se pudo confirmar el resultado." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => membershipReceipt,
      });

    render(<OwnerGroupsManager bundle={groupBundle} />);
    await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
    await user.type(screen.getByLabelText("Nombre"), "Gimnasta");
    await user.type(screen.getByLabelText("Apellidos"), "Sintética");
    await user.click(
      screen.getByRole("button", { name: "Crear y añadir al grupo" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar el resultado."
    );

    await user.click(
      screen.getByRole("button", { name: "Reintentar operación pendiente" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Ficha creada y añadida al grupo."
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      `/api/v1/owner/groups/${groupId}/memberships`
    );
    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(first.headers).toEqual(retry.headers);
    expect(first.body).toBe(retry.body);
    expect(JSON.parse(String(first.body))).toEqual({
      organizationId,
      newAthlete: { givenName: "Gimnasta", familyName: "Sintética" },
    });
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("recupera tras recarga un alta incierta sin guardar nombres y limpia solo al confirmar", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: "No se pudo confirmar el resultado." }),
    });
    const user = userEvent.setup();
    const view = render(<OwnerGroupsManager bundle={groupBundle} />);
    await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
    await user.type(screen.getByLabelText("Nombre"), "Gimnasta");
    await user.type(screen.getByLabelText("Apellidos"), "Sintética");
    await user.click(screen.getByRole("button", { name: "Crear y añadir al grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó");

    const storageKey = `zaltyko:pending-group-athlete:${organizationId}:${groupId}`;
    const pending = window.sessionStorage.getItem(storageKey)!;
    expect(pending).not.toMatch(/Gimnasta|Sintética|givenName|familyName/);
    const idempotencyKey = (JSON.parse(pending) as { idempotencyKey: string }).idempotencyKey;
    view.unmount();

    mockFetch.mockReset().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { status: "complete", receipt: {
        id: membershipId, groupId, athleteId, startsOn: "2026-10-23", status: "active",
      } } }),
    });
    const reloaded = render(<OwnerGroupsManager bundle={groupBundle} />);
    await user.click(screen.getByText("¿No aparece? Crear ficha y añadir"));
    expect(await screen.findByText(/El recibo confirma el alta y la pertenencia al grupo/)).toBeVisible();
    expect(window.sessionStorage.getItem(storageKey)).toContain(idempotencyKey);
    expect(mockFetch.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Confirmar resultado y limpiar clave pendiente" }));
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    reloaded.unmount();
  });
});
