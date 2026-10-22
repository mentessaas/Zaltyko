// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const programId = "10000000-0000-4000-8000-000000000003";
const groupId = "10000000-0000-4000-8000-000000000004";
const athleteId = "10000000-0000-4000-8000-000000000005";
const membershipId = "10000000-0000-4000-8000-000000000006";

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
  vi.stubGlobal("crypto", { randomUUID: () => "synthetic-group-command" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("gestión de grupos owner", () => {
  it("mantiene el buscador y la indicación de añadir en un grupo activo vacío", () => {
    render(<OwnerGroupsManager bundle={groupBundle} />);

    expect(screen.getByLabelText("Añadir una gimnasta")).toBeVisible();
    expect(screen.getByText(/Puedes añadir una ficha activa desde el buscador/)).toBeVisible();
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
        json: async () => ({ ok: true, data: { id: groupId } }),
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
      "idempotency-key": "synthetic-group-command",
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
        json: async () => ({ ok: true, data: { id: groupId } }),
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
        json: async () => ({ detail: "El grupo no se pudo crear." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ ok: true, data: { id: groupId } }),
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
        json: async () => ({ ok: true, data: { id: groupId } }),
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
        json: async () => ({ ok: true, data: { id: membershipId } }),
      });

    render(<OwnerGroupsManager bundle={groupBundle} />);
    await user.type(screen.getByLabelText("Añadir una gimnasta"), "Gim");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await user.click(await screen.findByRole("button", { name: "Añadir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar el resultado."
    );
    await user.click(screen.getByRole("button", { name: "Añadir" }));

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
        json: async () => ({ ok: true, data: { id: membershipId } }),
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
      screen.getByRole("button", { name: "Crear y añadir al grupo" })
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
});
