// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkBoot = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => {
  sdkBoot();
  return { createClient: vi.fn(() => { throw new Error("No debe iniciarse el SDK de Auth"); }) };
});
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import { TeamInvitationAcceptance } from "@/app/staff/accept/TeamInvitationAcceptance";
import TeamInvitationAcceptancePage from "@/app/staff/accept/page";
import { takeTeamInvitationToken } from "@/lib/auth/team-invitation-fragment";

const TOKEN = "b".repeat(43);
const inspected = { organization: { id: "organization", name: "Academia sintética" }, role: "coach", locations: [{ id: "location", name: "Sede Norte" }] };
const accepted = { membership: { id: "member", role: "coach", status: "active", locationScopeMode: "selected", locations: inspected.locations }, replayed: false };

function json(status: number, data: unknown) {
  return { status, json: async () => status < 300 ? { ok: true, data } : { ok: false, code: "INVITATION_UNAVAILABLE" } } as Response;
}

beforeEach(() => {
  takeTeamInvitationToken();
  window.history.replaceState(null, "", `/staff/accept?untrusted=value#token=${TOKEN}`);
  vi.spyOn(window.crypto, "randomUUID").mockReturnValue("82000000-0000-4000-8000-000000000099");
});
afterEach(() => { cleanup(); takeTeamInvitationToken(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("TeamInvitationAcceptance", () => {
  it("oculta la landing por defecto sin iniciar sesión SSR", () => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "false");
    expect(() => TeamInvitationAcceptancePage()).toThrow("NEXT_NOT_FOUND");
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "true");
    expect(TeamInvitationAcceptancePage().type).toBe(TeamInvitationAcceptance);
  });

  it("limpia fragmento/query antes de inspect y muestra organización, rol y sedes sin aceptar automáticamente", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(window.location.hash).toBe("");
      expect(window.location.search).toBe("");
      requests.push({ url: String(input), init });
      return json(200, inspected);
    }));
    render(<StrictMode><TeamInvitationAcceptance /></StrictMode>);
    await screen.findByRole("heading", { name: "Revisa el acceso solicitado" });
    expect(screen.getByText("Academia sintética")).toBeInTheDocument();
    expect(screen.getByText("Entrenador/a")).toBeInTheDocument();
    expect(screen.getByText("Sede Norte")).toBeInTheDocument();
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.url).toBe("/api/v1/staff/invitations/inspect");
      expect(request.init).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer" });
      expect(JSON.parse(String(request.init?.body))).toEqual({ token: TOKEN });
      expect(request.init?.headers).not.toHaveProperty("Idempotency-Key");
      expect(request.url).not.toContain(TOKEN);
    }
    expect(storageWrite).not.toHaveBeenCalled();
    expect(sdkBoot).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Aceptar invitación" })).toBeEnabled();
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("ante 401 ofrece login sin next ni token y pide reabrir el enlace original tras Auth", async () => {
    const fetchMock = vi.fn(async () => json(401, null));
    vi.stubGlobal("fetch", fetchMock);
    render(<TeamInvitationAcceptance />);
    const login = await screen.findByRole("link", { name: "Iniciar sesión" });
    expect(login).toHaveAttribute("href", "/auth/login");
    // O3: sin cuenta, se registra con el correo invitado y vuelve al enlace.
    expect(screen.getByRole("link", { name: "Crear una cuenta con ese correo" })).toHaveAttribute("href", "/auth/register");
    expect(screen.getByText(/Después de iniciar sesión, vuelve a abrir el enlace original/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceptar invitación" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sdkBoot).not.toHaveBeenCalled();
  });

  it("requiere el enlace original tras perder memoria y no consulta sin token", async () => {
    window.history.replaceState(null, "", "/staff/accept");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<TeamInvitationAcceptance />);
    await screen.findByText(/Abre el enlace original de la invitación/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acepta solo por clic y repite una respuesta perdida con la misma clave/cuerpo en memoria", async () => {
    const accepts: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/inspect")) return json(200, inspected);
      accepts.push(init!);
      if (accepts.length === 1) throw new Error("Respuesta perdida");
      return json(200, { ...accepted, replayed: true });
    }));
    render(<TeamInvitationAcceptance />);
    await screen.findByRole("button", { name: "Aceptar invitación" });
    expect(accepts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Aceptar invitación" }));
    await screen.findByRole("button", { name: "Reintentar la misma aceptación" });
    expect(accepts).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma aceptación" }));
    await screen.findByRole("heading", { name: "Invitación aceptada" });
    expect(accepts).toHaveLength(2);
    expect(accepts[1]).toEqual(accepts[0]);
    expect(JSON.parse(String(accepts[0].body))).toEqual({ token: TOKEN });
    expect(accepts[0].headers).toMatchObject({ "Idempotency-Key": "82000000-0000-4000-8000-000000000099" });
    expect(screen.getByText(/con tu ficha del equipo vinculada/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a mi panel" })).toHaveAttribute("href", "/owner");
    expect(screen.queryByRole("button", { name: /Aceptar invitación/u })).toBeNull();
  });

  it("presenta el mismo error genérico para invitación ajena, revocada o consumida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(403, { email: "otra-persona@example.test" })));
    render(<TeamInvitationAcceptance />);
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("No se pudo verificar esta invitación con tu sesión");
    expect(document.body.textContent).not.toContain("otra-persona@example.test");
    expect(screen.queryByRole("button", { name: "Aceptar invitación" })).toBeNull();
  });
});
