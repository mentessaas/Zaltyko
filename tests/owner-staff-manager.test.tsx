// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerStaffManager } from "@/components/owner-dashboard/OwnerStaffManager";
import {
  makeOwnerStaffCommand,
  markOwnerStaffCommandAttempted,
  persistOwnerStaffCommand,
  readOwnerStaffCommand,
} from "@/components/owner-dashboard/owner-staff-command-journal";

const ORGANIZATION_ID = "80000000-0000-4000-8000-000000000001";
const STAFF_PROFILE_ID = "80000000-0000-4000-8000-000000000002";
const VERSION = `v1_${"a".repeat(64)}`;
const UPDATED_VERSION = `v1_${"b".repeat(64)}`;

function jsonResponse(status: number, payload: unknown) {
  return { status, json: async () => payload } as Response;
}

function emptyPage() {
  return jsonResponse(200, { ok: true, data: { items: [], nextCursor: null } });
}

const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");

function installAvailableLock() {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => callback({}) },
  });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
});

describe("OwnerStaffManager", () => {
  it("conserva la versión del borrador al refrescar una lista modificada por otro Owner", async () => {
    installAvailableLock();
    let listReads = 0;
    const patches: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push(init);
        return jsonResponse(409, { ok: false, code: "VERSION_CONFLICT" });
      }
      listReads += 1;
      return jsonResponse(200, { ok: true, data: {
        items: [{ id: STAFF_PROFILE_ID, givenName: listReads === 1 ? "Ada" : "Grace", familyName: "Lovelace", preferredName: null, isActive: true, version: listReads === 1 ? VERSION : UPDATED_VERSION }],
        nextCursor: null,
      } });
    }));
    render(<OwnerStaffManager organizationId={ORGANIZATION_ID} organizationName="Club de prueba" />);
    await screen.findByRole("heading", { name: "Ada Lovelace" });
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const originalCard = screen.getByRole("article", { name: "Ada Lovelace" });
    fireEvent.change(within(originalCard).getByLabelText("Nombre"), { target: { value: "Borrador" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar lista" }));
    await screen.findByRole("heading", { name: "Grace Lovelace" });
    const refreshedCard = screen.getByRole("article", { name: "Grace Lovelace" });
    expect(within(refreshedCard).getByLabelText("Nombre")).toHaveValue("Borrador");
    expect(patches).toHaveLength(0);
    fireEvent.click(within(refreshedCard).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(JSON.parse(String(patches[0].body))).toEqual({
      organizationId: ORGANIZATION_ID,
      givenName: "Borrador",
      familyName: "Lovelace",
      preferredName: null,
      version: VERSION,
    });
    expect(JSON.parse(String(patches[0].body)).version).not.toBe(UPDATED_VERSION);
    expect(await screen.findByRole("alert")).toHaveTextContent("El perfil cambió");
    expect(patches).toHaveLength(1);
  });

  it("no reenvía al montar y conserva la misma clave y cuerpo tras un 403 de un comando incierto", async () => {
    const command = makeOwnerStaffCommand({
      operation: "create",
      organizationId: ORGANIZATION_ID,
      givenName: "Ada",
      familyName: "Lovelace",
      preferredName: null,
    }, "staff-create-key-0001");
    expect(persistOwnerStaffCommand(window.localStorage, command)).toBe(true);
    const attemptedCommand = markOwnerStaffCommandAttempted(window.localStorage, command);
    expect(attemptedCommand).not.toBeNull();
    installAvailableLock();

    const posts: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ url: String(input), init });
        return jsonResponse(403, { ok: false, error: "FORBIDDEN", code: "FORBIDDEN" });
      }
      return emptyPage();
    }));

    render(<OwnerStaffManager organizationId={ORGANIZATION_ID} organizationName="Club de prueba" />);
    await screen.findByRole("heading", { name: "Personas del equipo" });
    await screen.findByRole("heading", { name: "Operación pendiente" });
    expect(posts).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(command.endpoint);
    expect(posts[0].init.body).toBe(command.body);
    expect((posts[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe(command.idempotencyKey);

    const saved = readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID);
    expect(saved).toEqual({ kind: "pending", command: attemptedCommand });
    expect(screen.getByRole("alert")).toHaveTextContent("no tiene permiso");
    expect(screen.getByText(/Este comando ya tuvo un resultado incierto/u)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recibo original de la operación" })).toBeNull();
  });

  it("mantiene el recibo original separado de la lista actual posterior al reintento", async () => {
    const command = makeOwnerStaffCommand({
      operation: "archive",
      organizationId: ORGANIZATION_ID,
      staffProfileId: STAFF_PROFILE_ID,
      version: VERSION,
    }, "staff-archive-key-0001");
    expect(persistOwnerStaffCommand(window.localStorage, command)).toBe(true);
    expect(markOwnerStaffCommandAttempted(window.localStorage, command)).not.toBeNull();
    installAvailableLock();

    let listReads = 0;
    const posts: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ url: String(input), init });
        return jsonResponse(200, {
          ok: true,
          data: { receipt: { staffProfileId: STAFF_PROFILE_ID, version: UPDATED_VERSION, isActive: false }, replayed: true },
        });
      }
      listReads += 1;
      if (listReads === 1) {
        return jsonResponse(200, {
          ok: true,
          data: {
            items: [{ id: STAFF_PROFILE_ID, givenName: "Ada", familyName: "Lovelace", preferredName: null, isActive: true, version: VERSION }],
            nextCursor: null,
          },
        });
      }
      return emptyPage();
    }));

    render(<OwnerStaffManager organizationId={ORGANIZATION_ID} organizationName="Club de prueba" />);
    await screen.findByRole("heading", { name: "Ada Lovelace" });
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));

    await screen.findByRole("heading", { name: "Recibo original de la operación" });
    await screen.findByText("Todavía no hay personas en esta vista. Puedes añadir a alguien al equipo desde el formulario de arriba.");
    expect(listReads).toBeGreaterThanOrEqual(2);
    expect(posts).toHaveLength(1);
    expect(posts[0].init.body).toBe(command.body);
    expect((posts[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe(command.idempotencyKey);

    const receipt = screen.getByRole("region", { name: "Recibo original de la operación" });
    expect(within(receipt).queryByText("Ada Lovelace")).toBeNull();
    expect(within(receipt).getByText(new RegExp(STAFF_PROFILE_ID))).toBeInTheDocument();
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID)).toEqual({ kind: "none" });
  });

  it("bloquea un alta en otra pestaña sin crear un comando ni enviar POST", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => callback(null) },
    });
    const fetchMock = vi.fn(async () => emptyPage());
    vi.stubGlobal("fetch", fetchMock);
    render(<OwnerStaffManager organizationId={ORGANIZATION_ID} organizationName="Club de prueba" />);
    await screen.findByRole("heading", { name: "Personas del equipo" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Añadir al equipo" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir al equipo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Otra pestaña está gestionando perfiles");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID)).toEqual({ kind: "none" });
  });

  it("bloquea el POST si Web Locks no está disponible y conserva la vía de recuperación", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const fetchMock = vi.fn(async () => emptyPage());
    vi.stubGlobal("fetch", fetchMock);
    render(<OwnerStaffManager organizationId={ORGANIZATION_ID} organizationName="Club de prueba" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Añadir al equipo" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir al equipo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se envió nada ni se generó otra clave");
    expect(screen.getByRole("alert")).toHaveTextContent("mismo perfil de navegador");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID)).toEqual({ kind: "none" });
  });

  it("relee bajo el lock un comando de otra pestaña y no lo reemplaza por un alta nueva", async () => {
    installAvailableLock();
    const fetchMock = vi.fn(async () => emptyPage());
    vi.stubGlobal("fetch", fetchMock);
    render(<OwnerStaffManager organizationId={ORGANIZATION_ID} organizationName="Club de prueba" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Añadir al equipo" })).toBeEnabled());

    const foreignCommand = makeOwnerStaffCommand({
      operation: "create",
      organizationId: ORGANIZATION_ID,
      givenName: "Grace",
      familyName: "Hopper",
      preferredName: null,
    }, "staff-create-key-foreign");
    expect(persistOwnerStaffCommand(window.localStorage, foreignCommand)).toBe(true);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir al equipo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una operación pendiente en esta academia");
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID)).toEqual({ kind: "pending", command: foreignCommand });
  });
});
