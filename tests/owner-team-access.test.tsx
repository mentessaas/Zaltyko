// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerTeamAccessPanel } from "@/components/owner/OwnerTeamAccessPanel";
import type { TeamAccess, TeamInvitation } from "@/modules/staff/domain/team-access-contract";

const ORGANIZATION_ID = "81000000-0000-4000-8000-000000000001";
const INVITATION_ID = "81000000-0000-4000-8000-000000000002";
const LOCATION_ID = "81000000-0000-4000-8000-000000000003";
const OTHER_LOCATION_ID = "81000000-0000-4000-8000-000000000004";
const TOKEN = "a".repeat(43);
const location = { id: LOCATION_ID, name: "Sede Norte" };
const otherLocation = { id: OTHER_LOCATION_ID, name: "Sede Centro" };

function json(status: number, data: unknown) {
  return { status, json: async () => status < 300 ? { ok: true, data } : { ok: false, code: "CONFLICT" } } as Response;
}

function invitation(overrides: Partial<TeamInvitation> = {}): TeamInvitation {
  return { id: INVITATION_ID, email: "coach@example.test", role: "coach", status: "pending", expired: false,
    expiresAt: "2026-11-12T12:00:00.000Z", revision: 3, requestedLocations: [location],
    person: { kind: "new", staffProfileId: null, name: "Ana Ruiz" }, ...overrides };
}

const PROFILE_ID = "81000000-0000-4000-8000-000000000005";

function access(invitations: TeamInvitation[] = [], overrides: Partial<TeamAccess> = {}): TeamAccess {
  return { organization: { id: ORGANIZATION_ID, name: "Academia sintética" },
    viewer: { role: "owner", invitableRoles: ["coach", "manager"] },
    activeLocations: [location, otherLocation], linkableStaffProfiles: [{ id: PROFILE_ID, name: "Bea Martín" }],
    invitations, members: [], ...overrides };
}

function fillCreate() {
  fireEvent.change(screen.getByLabelText("Correo de la persona invitada"), { target: { value: "Coach@Example.test" } });
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: " Ana " } });
  fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Ruiz" } });
  fireEvent.click(screen.getByLabelText("Sede Norte"));
  fireEvent.click(screen.getByLabelText("Sede Centro"));
}

beforeEach(() => {
  vi.spyOn(window.crypto, "randomUUID").mockReturnValue("81000000-0000-4000-8000-000000000099");
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("OwnerTeamAccessPanel", () => {
  it("invita con rol y sedes explícitas, revela el fragmento solo tras respuesta y nunca escribe storage", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let created = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (init?.method === "POST") {
        created = true;
        return json(201, { invitation: invitation({ role: "manager", requestedLocations: [location, otherLocation] }), token: TOKEN, replayed: false });
      }
      return json(200, access(created ? [invitation()] : []));
    }));
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    await screen.findByText("No hay invitaciones registradas.");
    expect(calls.filter(call => call.init?.method === "POST")).toHaveLength(0);
    expect(screen.queryByLabelText("Enlace privado para compartir una vez")).toBeNull();
    fillCreate();
    fireEvent.change(screen.getByLabelText("Rol solicitado"), { target: { value: "manager" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear invitación y mostrar enlace" }));
    const link = await screen.findByLabelText("Enlace privado para compartir una vez");
    expect(link).toHaveValue(`${window.location.origin}/staff/accept#token=${TOKEN}`);
    const posts = calls.filter(call => call.init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/v1/owner/staff/invitations");
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({ organizationId: ORGANIZATION_ID, email: "coach@example.test", role: "manager", locationIds: [LOCATION_ID, OTHER_LOCATION_ID], givenName: "Ana", familyName: "Ruiz" });
    expect(posts[0].init?.headers).toMatchObject({ "Idempotency-Key": "81000000-0000-4000-8000-000000000099" });
    expect(storageWrite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar enlace" }));
    expect(screen.queryByLabelText("Enlace privado para compartir una vez")).toBeNull();
    expect(screen.getByText(/No se ha enviado ningún correo/u)).toBeInTheDocument();
  });

  it("recupera un resultado incierto solo por acción explícita con cuerpo y clave originales, sin volver a revelar el token", async () => {
    const writes: Array<{ url: string; init: RequestInit }> = [];
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push({ url: String(input), init });
        if (writes.length === 1) throw new Error("Respuesta perdida después del commit");
        return json(200, { invitation: invitation({ requestedLocations: [location, otherLocation] }), token: null, replayed: true });
      }
      reads += 1;
      return json(200, access(reads > 1 ? [invitation()] : []));
    }));
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    await screen.findByText("No hay invitaciones registradas.");
    fillCreate();
    fireEvent.click(screen.getByRole("button", { name: "Crear invitación y mostrar enlace" }));
    await screen.findByRole("article", { name: "Invitación para coach@example.test" });
    expect(writes).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Crear invitación y mostrar enlace" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reemitir enlace" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar accesos" }));
    await waitFor(() => expect(reads).toBe(3));
    await screen.findByRole("article", { name: "Invitación para coach@example.test" });
    expect(writes).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Recuperar la misma solicitud" }));
    await screen.findByText(/Operación recuperada sin enlace/u);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    expect(screen.queryByLabelText("Enlace privado para compartir una vez")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Reemitir enlace" })).toBeEnabled());
    expect(writes.some(write => write.url.endsWith("/reissue"))).toBe(false);
  });

  it("conserva la recuperación incierta aunque el retry reciba un rechazo de sesión", async () => {
    let writes = 0;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes += 1;
        if (writes === 1) throw new Error("Respuesta perdida");
        return json(403, null);
      }
      return json(200, access());
    }));
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    await screen.findByText("No hay invitaciones registradas.");
    fillCreate();
    fireEvent.click(screen.getByRole("button", { name: "Crear invitación y mostrar enlace" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Recuperar la misma solicitud" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Recuperar la misma solicitud" }));
    await screen.findByText(/El resultado anterior sigue sin confirmar/u);
    expect(screen.getByRole("button", { name: "Crear invitación y mostrar enlace" })).toBeDisabled();
    expect(writes).toBe(2);
  });

  it("usa la revisión mostrada para reemitir y relee un conflicto sin rotación automática", async () => {
    const writes: Array<{ url: string; init: RequestInit }> = [];
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push({ url: String(input), init });
        return json(409, null);
      }
      reads += 1;
      return json(200, access([invitation({ expired: true, revision: reads === 1 ? 3 : 4 })]));
    }));
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    await screen.findByText("Entrenador/a · Caducada");
    fireEvent.click(screen.getByRole("button", { name: "Reemitir enlace" }));
    await screen.findByText(/revisión 4/u);
    expect(writes).toHaveLength(1);
    expect(writes[0].url).toBe(`/api/v1/owner/staff/invitations/${INVITATION_ID}/reissue`);
    expect(writes[0].init.headers).toMatchObject({ "If-Match": "3" });
    expect(JSON.parse(String(writes[0].init.body))).toEqual({ organizationId: ORGANIZATION_ID });
    expect(screen.queryByLabelText("Enlace privado para compartir una vez")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("La invitación cambió");
  });

  it("revoca una pendiente expirada con If-Match, nunca ofrece mutaciones para aceptadas o revocadas", async () => {
    const writes: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        writes.push({ url: String(input), init });
        return json(200, { id: INVITATION_ID, status: "revoked", revision: 4, replayed: false });
      }
      return json(200, access([
        invitation({ expired: true }),
        invitation({ id: "accepted", email: "accepted@example.test", status: "accepted" }),
        invitation({ id: "revoked", email: "revoked@example.test", status: "revoked" }),
      ]));
    }));
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    await screen.findByText("Entrenador/a · Caducada");
    expect(within(screen.getByRole("article", { name: "Invitación para accepted@example.test" })).queryByRole("button")).toBeNull();
    expect(within(screen.getByRole("article", { name: "Invitación para revoked@example.test" })).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Revocar invitación" }));
    await screen.findByText(/Invitación revocada\. Esta acción/u);
    expect(writes).toHaveLength(1);
    expect(writes[0].url).toBe(`/api/v1/owner/staff/invitations/${INVITATION_ID}?organizationId=${ORGANIZATION_ID}`);
    expect(writes[0].init.headers).toMatchObject({ "If-Match": "3" });
    expect(writes[0].init.body).toBeUndefined();
  });

  it("retira la lectura efectiva anterior si el refresco no confirma el ámbito", async () => {
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      reads += 1;
      const data = access();
      data.members = [{ id: "member", role: "coach", status: "active", locationScopeMode: "selected", effectiveLocations: [location], staffProfile: null }];
      if (reads > 1) data.organization.id = "otra-organizacion";
      return json(200, data);
    }));
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    await screen.findByText("Sedes con acceso efectivo: Sede Norte.");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar accesos" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Sedes con acceso efectivo: Sede Norte.")).toBeNull();
    expect(screen.getByRole("button", { name: "Crear invitación y mostrar enlace" })).toBeDisabled();
  });

  it("la coordinación solo ve el rol de entrenador/a y puede invitar a una ficha que ya está en Equipo", async () => {
    const posts: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(init);
        return json(201, { invitation: invitation({ email: "bea@example.test", person: { kind: "existing", staffProfileId: PROFILE_ID, name: "Bea Martín" } }), token: TOKEN, replayed: false });
      }
      return json(200, access([], { viewer: { role: "manager", invitableRoles: ["coach"] }, activeLocations: [location] }));
    }));
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    await screen.findByText("No hay invitaciones registradas.");
    const roleSelect = screen.getByLabelText("Rol solicitado");
    expect(within(roleSelect).getAllByRole("option").map(option => option.textContent)).toEqual(["Entrenador/a"]);
    expect(screen.queryByLabelText("Sede Centro")).toBeNull();
    fireEvent.change(screen.getByLabelText("Correo de la persona invitada"), { target: { value: "bea@example.test" } });
    fireEvent.click(screen.getByRole("radio", { name: "Ficha que ya está en Equipo" }));
    fireEvent.change(screen.getByLabelText("Ficha del equipo"), { target: { value: PROFILE_ID } });
    fireEvent.click(screen.getByLabelText("Sede Norte"));
    fireEvent.click(screen.getByRole("button", { name: "Crear invitación y mostrar enlace" }));
    await screen.findByLabelText("Enlace privado para compartir una vez");
    expect(JSON.parse(String(posts[0].body))).toEqual({ organizationId: ORGANIZATION_ID, email: "bea@example.test", role: "coach", locationIds: [LOCATION_ID], staffProfileId: PROFILE_ID });
    expect(screen.getByText(/válido 7 días/u)).toBeInTheDocument();
  });

  it("exige nombre y apellidos para una ficha nueva sin enviar nada", async () => {
    const fetchMock = vi.fn(async () => json(200, access()));
    vi.stubGlobal("fetch", fetchMock);
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    await screen.findByText("No hay invitaciones registradas.");
    fireEvent.change(screen.getByLabelText("Correo de la persona invitada"), { target: { value: "ana@example.test" } });
    fireEvent.click(screen.getByLabelText("Sede Norte"));
    fireEvent.click(screen.getByRole("button", { name: "Crear invitación y mostrar enlace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe el nombre y los apellidos");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("muestra la ficha vinculada de cada miembro y la persona de cada invitación", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, access([invitation()], {
      members: [
        { id: "m1", role: "coach", status: "active", locationScopeMode: "selected", effectiveLocations: [location], staffProfile: { id: PROFILE_ID, name: "Bea Martín" } },
        { id: "m2", role: "manager", status: "active", locationScopeMode: "selected", effectiveLocations: [location], staffProfile: null },
      ],
    }))));
    render(<OwnerTeamAccessPanel organizationId={ORGANIZATION_ID} />);
    expect(await screen.findByRole("heading", { name: "Bea Martín · Entrenador/a" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Miembro 2 · Coordinador/a" })).toBeInTheDocument();
    expect(screen.getByText(/sin ficha del equipo vinculada/u)).toBeInTheDocument();
    expect(screen.getByText("Ficha del equipo: Ana Ruiz (se creará al aceptar).")).toBeInTheDocument();
  });
});
