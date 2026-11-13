// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => { throw new Error("No debe iniciarse el SDK de Auth"); }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import { TeamInvitationAcceptance } from "@/app/staff/accept/TeamInvitationAcceptance";
import { metadata } from "@/app/staff/accept/page";
import { takeTeamInvitationToken } from "@/lib/auth/team-invitation-fragment";

const TOKEN = "c".repeat(43);
const inspected = { organization: { id: "organization", name: "Academia sintética" }, role: "coach", locations: [{ id: "location", name: "Sede Norte" }] };
const LEGACY_PALETTE = /\b(?:bg|text|border|outline)-(?:slate|amber|teal|gray|red|blue)-\d{2,3}\b/;

function json(status: number, data: unknown) {
  return { status, json: async () => status < 300 ? { ok: true, data } : { ok: false, code: "INVITATION_UNAVAILABLE" } } as Response;
}

beforeEach(() => {
  takeTeamInvitationToken();
  window.history.replaceState(null, "", `/staff/accept#token=${TOKEN}`);
});
afterEach(() => { cleanup(); takeTeamInvitationToken(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Entrada de entrenadoras con el aspecto de /auth/login («Magnesio sobre
// tapiz»): marca, titular condensado, regla de cinta y colores del sistema.
describe("/staff/accept con el aspecto de la entrada", () => {
  it("no duplica «| Zaltyko» en el título: lo añade la plantilla del layout raíz", () => {
    expect(metadata.title).toBe("Invitación de equipo");
  });

  it("pinta la marca, un único h1 dentro de main y el acceso revisado sin paleta genérica", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, inspected)));
    render(<TeamInvitationAcceptance />);

    const accept = await screen.findByRole("button", { name: "Aceptar invitación" });
    const main = screen.getByRole("main");
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Invitación a una academia");
    expect(main).toContainElement(headings[0]);
    expect(headings[0].className).toContain("uppercase");
    expect(main).toContainElement(accept);
    expect(accept.className).toContain("bg-mat");

    expect(screen.getAllByRole("link", { name: "Zaltyko, inicio" }).length).toBeGreaterThan(0);
    expect(within(screen.getByRole("complementary", { name: "Invitación de equipo" })).getByRole("heading", { level: 2 }))
      .toHaveTextContent("Invitación de equipo");

    expect(document.body.innerHTML).not.toMatch(LEGACY_PALETTE);
  });

  it("separa el aviso (polvo de magnesio) del error (coral tinta)", async () => {
    window.history.replaceState(null, "", "/staff/accept");
    vi.stubGlobal("fetch", vi.fn());
    const { unmount } = render(<TeamInvitationAcceptance />);
    const notice = await screen.findByText(/Abre el enlace original de la invitación/u);
    expect(notice.className).toContain("bg-chalk-dust");
    expect(notice.className).not.toContain("signal");
    unmount();

    window.history.replaceState(null, "", `/staff/accept#token=${TOKEN}`);
    vi.stubGlobal("fetch", vi.fn(async () => json(403, null)));
    render(<TeamInvitationAcceptance />);
    const error = await screen.findByRole("alert");
    expect(error.className).toContain("bg-signal-wash");
    expect(error.className).toContain("text-signal-ink");
    expect(document.body.innerHTML).not.toMatch(LEGACY_PALETTE);
  });
});
