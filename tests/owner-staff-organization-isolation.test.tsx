// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: "synthetic-owner" } } }) } })),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(async ({ organizationId }: { organizationId: string }) => ({
    member: { role: "owner", locationScopeMode: "all" },
    organization: { id: organizationId, name: `Academia ${organizationId.endsWith("1") ? "A" : "B"}` },
  })),
}));
vi.mock("@/components/owner-dashboard/OwnerWorkspacePageShell", () => ({
  OwnerWorkspacePageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// The branch with invitations is exercised as composition only. No invitation
// API or enabled runtime is required to verify the profile subtree's lifetime.
vi.mock("@/components/owner/OwnerTeamAccessPanel", () => ({ OwnerTeamAccessPanel: () => null }));

import OwnerStaffPage from "@/app/owner/staff/page";
import {
  makeOwnerStaffCommand,
  markOwnerStaffCommandAttempted,
  persistOwnerStaffCommand,
  readOwnerStaffCommand,
} from "@/components/owner-dashboard/owner-staff-command-journal";

const ORGANIZATION_A = "82000000-0000-4000-8000-000000000001";
const ORGANIZATION_B = "82000000-0000-4000-8000-000000000002";
const STAFF_A = "82000000-0000-4000-8000-000000000003";
const STAFF_B = "82000000-0000-4000-8000-000000000004";
const VERSION = `v1_${"a".repeat(64)}`;
const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");

function response(data: unknown, status = 200) {
  return { status, json: async () => ({ ok: true, data }) } as Response;
}

function page(organizationId: string) {
  return OwnerStaffPage({ searchParams: Promise.resolve({ organizationId }) });
}

function createForm() {
  return within(screen.getByRole("region", { name: "Añadir perfil sin acceso" }));
}

function fillCreate(givenName: string, familyName: string) {
  fireEvent.change(createForm().getByLabelText("Nombre"), { target: { value: givenName } });
  fireEvent.change(createForm().getByLabelText("Apellidos"), { target: { value: familyName } });
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => callback({}) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
});

describe("aislamiento de Personal al navegar entre academias autorizadas", () => {
  it.each(["false", "true"])("descarta borradores, recibos y avisos al cambiar de academia con flag=%s", async flag => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", flag);
    const writes: Array<{ endpoint: string; body: Record<string, unknown> }> = [];
    const created = new Set<string>();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ endpoint: String(input), body });
        created.add(String(body.organizationId));
        return response({ receipt: { staffProfileId: body.organizationId === ORGANIZATION_A ? STAFF_A : STAFF_B, version: VERSION, isActive: true }, replayed: false }, 201);
      }
      const organizationId = new URL(String(input), "https://synthetic.invalid").searchParams.get("organizationId")!;
      return response({
        items: created.has(organizationId) ? [{
          id: organizationId === ORGANIZATION_A ? STAFF_A : STAFF_B,
          givenName: organizationId === ORGANIZATION_A ? "Creada" : "Bea",
          familyName: organizationId === ORGANIZATION_A ? "SoloA" : "PropiaB",
          preferredName: null, isActive: true, version: VERSION,
        }] : [],
        nextCursor: null,
      });
    }));

    const view = render(await page(ORGANIZATION_A));
    await waitFor(() => expect(createForm().getByRole("button", { name: "Crear perfil" })).toBeEnabled());
    fillCreate("Creada", "SoloA");
    fireEvent.click(createForm().getByRole("button", { name: "Crear perfil" }));
    await screen.findByRole("heading", { name: "Recibo original de la operación" });
    await screen.findByRole("heading", { name: "Creada SoloA" });
    await waitFor(() => expect(createForm().getByRole("button", { name: "Crear perfil" })).toBeEnabled());
    fillCreate("Borrador privado A", "Apellido privado A");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const profileA = within(screen.getByRole("article", { name: "Creada SoloA" }));
    fireEvent.change(profileA.getByLabelText("Nombre"), { target: { value: "Edición privada A" } });
    expect(screen.getByRole("status")).toHaveTextContent("Operación confirmada");

    view.rerender(await page(ORGANIZATION_B));
    await screen.findByText("No hay perfiles en este filtro. Puedes añadir un perfil sin acceso desde el formulario superior.");
    expect(createForm().getByLabelText("Nombre")).toHaveValue("");
    expect(createForm().getByLabelText("Apellidos")).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Recibo original de la operación" })).toBeNull();
    expect(screen.queryByText(/Operación confirmada/u)).toBeNull();
    expect(screen.queryByDisplayValue(/privad[ao] A/u)).toBeNull();
    expect(screen.queryByRole("article", { name: "Creada SoloA" })).toBeNull();
    expect(writes).toHaveLength(1);
    fillCreate("Bea", "PropiaB");
    fireEvent.click(createForm().getByRole("button", { name: "Crear perfil" }));
    await screen.findByRole("heading", { name: "Bea PropiaB" });
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual({ endpoint: "/api/v1/owner/staff", body: {
      organizationId: ORGANIZATION_B, givenName: "Bea", familyName: "PropiaB", preferredName: null,
    } });

    view.rerender(await page(ORGANIZATION_A));
    await screen.findByRole("heading", { name: "Creada SoloA" });
    expect(createForm().getByLabelText("Nombre")).toHaveValue("");
    expect(createForm().getByLabelText("Apellidos")).toHaveValue("");
    expect(screen.queryByDisplayValue(/privad[ao] A/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recibo original de la operación" })).toBeNull();
    expect(screen.queryByText(/Operación confirmada/u)).toBeNull();
    expect(writes).toHaveLength(2);
  });

  it("conserva el comando incierto de A en su journal y solo lo reenvía al recuperarlo explícitamente en A", async () => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "false");
    const command = makeOwnerStaffCommand({ operation: "create", organizationId: ORGANIZATION_A,
      givenName: "Pendiente", familyName: "SoloA", preferredName: null }, "staff-scope-recovery-key-0001");
    expect(persistOwnerStaffCommand(window.localStorage, command)).toBe(true);
    const attempted = markOwnerStaffCommandAttempted(window.localStorage, command);
    expect(attempted).not.toBeNull();
    const writes: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push(init);
        return response({ receipt: { staffProfileId: STAFF_A, version: VERSION, isActive: true }, replayed: true });
      }
      return response({ items: [], nextCursor: null });
    }));
    const view = render(await page(ORGANIZATION_A));
    await screen.findByRole("heading", { name: "Operación pendiente" });
    view.rerender(await page(ORGANIZATION_B));
    await waitFor(() => expect(createForm().getByRole("button", { name: "Crear perfil" })).toBeEnabled());
    expect(screen.queryByRole("heading", { name: "Operación pendiente" })).toBeNull();
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_A)).toEqual({ kind: "pending", command: attempted });
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_B)).toEqual({ kind: "none" });
    expect(writes).toHaveLength(0);
    view.rerender(await page(ORGANIZATION_A));
    await screen.findByRole("heading", { name: "Operación pendiente" });
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await screen.findByRole("heading", { name: "Recibo original de la operación" });
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toBe(command.body);
    expect(writes[0].headers).toMatchObject({ "Idempotency-Key": command.idempotencyKey });
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_A)).toEqual({ kind: "none" });
  });
});
