// @vitest-environment jsdom
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
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar el resultado."
    );

    await user.click(screen.getByRole("button", { name: "Guardar grupo" }));
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

  it("reutiliza la clave tras volver a abrir la página después de un resultado incierto", async () => {
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
    await firstUser.click(
      screen.getByRole("button", { name: "Guardar grupo" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar el resultado."
    );
    firstPage.unmount();

    const secondUser = userEvent.setup();
    render(<OwnerGroupsManager bundle={emptyBundle} />);
    await secondUser.type(
      screen.getByLabelText("Nombre del grupo"),
      "Iniciación"
    );
    await secondUser.click(
      screen.getByRole("button", { name: "Guardar grupo" })
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(first.headers).toMatchObject({
      "idempotency-key": "first-group-command",
    });
    expect(retry.headers).toEqual(first.headers);
    expect(retry.body).toBe(first.body);
    expect(randomUUID).toHaveBeenCalledOnce();
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
