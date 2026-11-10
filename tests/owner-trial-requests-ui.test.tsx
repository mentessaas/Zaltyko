// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import { OwnerAttentionPanel } from "@/components/owner-dashboard/OwnerAttentionPanel";
import { OwnerTrialRequestsWorkspace } from "@/components/owner-dashboard/OwnerTrialRequestsWorkspace";

const ORG = "00000000-0000-4000-8000-000000000001";
const SITE = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = "00000000-0000-4000-8000-0000000000c1";
const TOKEN = "0123456789abcdef0123456789abcdef";

function page(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    view: "open",
    items: [
      {
        id: REQUEST_ID,
        locationId: SITE,
        locationName: "Sede Centro",
        status: "new",
        contactName: "Ana Pérez",
        contactEmail: "ana@example.invalid",
        contactPhone: "+34 600 000 000",
        athleteGivenName: "Lúa",
        athleteBirthYear: 2017,
        message: "Rítmica, martes o jueves",
        createdAt: "2026-11-10T09:00:00.000Z",
        handledAt: null,
        anonymized: false,
        revision: 1,
        convertedAthleteId: null,
        waitlistEntryId: null,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
    hasMore: false,
    counts: { new: 1, contacted: 0, closed: 0 },
    locations: [{ id: SITE, name: "Sede Centro" }],
    links: [{ id: "00000000-0000-4000-8000-0000000000e1", locationId: null, token: TOKEN, enabled: true, createdAt: "2026-11-10T08:00:00.000Z" }],
    canManage: true,
    ...overrides,
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWorkspace() {
  render(
    <OwnerTrialRequestsWorkspace
      organizationId={ORG}
      organizationName="Club Centro"
      locations={[{ id: SITE, name: "Sede Centro" }]}
      initialLocationId={null}
    />
  );
}

describe("bandeja de solicitudes", () => {
  it("muestra la solicitud, el enlace para compartir y solo pide la bandeja de la academia", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, data: page() }));
    renderWorkspace();

    expect(await screen.findByText("Lúa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ana@example.invalid/ })).toHaveAttribute("href", "mailto:ana@example.invalid");
    expect(screen.getByLabelText("Enlace: Sede Centro")).toHaveValue(`${window.location.origin}/solicitar-prueba/${TOKEN}`);
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`/api/v1/owner/trial-requests?organizationId=${ORG}&view=open&page=1&pageSize=25`);
  });

  it("avisa de que falta activar el almacenamiento", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, data: page({ available: false, items: [], total: 0, counts: { new: 0, contacted: 0, closed: 0 } }) }));
    renderWorkspace();
    expect(await screen.findByText("Pendiente de activar.")).toBeInTheDocument();
  });

  it("no ofrece convertir ni gestionar el enlace a quien no tiene todas las sedes", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, data: page({ canManage: false }) }));
    renderWorkspace();
    await screen.findByText("Lúa");
    expect(screen.queryByRole("button", { name: "Pasar a inscripción" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desactivar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Marcar como contactada" })).toBeInTheDocument();
  });

  it("activa el enlace cuando no existe", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true, data: page({ links: [] }) }))
      .mockResolvedValueOnce(json(200, { ok: true, data: { id: "x", locationId: null, token: TOKEN, enabled: true } }))
      .mockResolvedValue(json(200, { ok: true, data: page() }));
    renderWorkspace();
    fireEvent.click(await screen.findByRole("button", { name: "Activar enlace" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe("/api/v1/owner/trial-requests/links");
    expect(JSON.parse(String(init?.body))).toEqual({ organizationId: ORG, locationId: null, action: "enable" });
  });

  it("envía la revisión esperada y no repite la operación con un doble clic", async () => {
    let release: (value: Response) => void = () => undefined;
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true, data: page() }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }))
      .mockResolvedValue(json(200, { ok: true, data: page({ items: [] }) }));
    renderWorkspace();
    const button = await screen.findByRole("button", { name: "Marcar como contactada" });
    fireEvent.click(button);
    fireEvent.click(button);
    release(json(200, { ok: true, data: { id: REQUEST_ID, status: "contacted", revision: 2 } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(String(posts[0]![0])).toBe(`/api/v1/owner/trial-requests/${REQUEST_ID}/status`);
    expect(JSON.parse(String(posts[0]![1]?.body))).toEqual({ organizationId: ORG, expectedRevision: 1, status: "contacted" });
  });

  it("pasa a inscripción sin ofrecer la lista de espera", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true, data: page() }))
      .mockResolvedValueOnce(json(200, { ok: true, data: { id: REQUEST_ID, status: "converted", revision: 2 } }))
      .mockResolvedValue(json(200, { ok: true, data: page({ items: [] }) }));
    renderWorkspace();
    fireEvent.click(await screen.findByRole("button", { name: "Pasar a inscripción" }));
    const form = screen.getByRole("form", { name: "Pasar a Lúa a inscripción" });
    expect(within(form).queryByText(/lista de espera/i)).toBeNull();
    fireEvent.change(within(form).getByLabelText("Apellidos de Lúa"), { target: { value: "Pérez" } });
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe(`/api/v1/owner/trial-requests/${REQUEST_ID}/convert`);
    expect(JSON.parse(String(init?.body))).toEqual({
      organizationId: ORG,
      expectedRevision: 1,
      familyName: "Pérez",
      relationship: "parent",
      destination: "enrollment",
      classTemplateId: null,
    });
    expect(await screen.findByText("Lúa ya tiene ficha. Asígnale grupo en Gimnastas para inscribirla.")).toBeInTheDocument();
  });

  it("ofrece eliminar datos personales solo en descartadas y pide confirmación", async () => {
    const declined = page({ items: [{ ...page().items[0], status: "declined", revision: 2 }] });
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true, data: declined }))
      .mockResolvedValueOnce(json(200, { ok: true, data: { id: REQUEST_ID, status: "declined", revision: 3 } }))
      .mockResolvedValue(json(200, { ok: true, data: page({ items: [] }) }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWorkspace();
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar datos personales" }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe(`/api/v1/owner/trial-requests/${REQUEST_ID}/anonymize`);
    expect(JSON.parse(String(init?.body))).toEqual({ organizationId: ORG, expectedRevision: 2 });
    confirm.mockRestore();
  });
});

describe("Necesita tu atención", () => {
  const scopeQuery = new URLSearchParams({ organizationId: ORG, locationId: SITE }).toString();

  it("enlaza las solicitudes nuevas con la bandeja", () => {
    render(
      <OwnerAttentionPanel
        organizationId={ORG}
        scopeQuery={scopeQuery}
        items={{ unrecordedSessions: { count: 0, latest: null }, fullClasses: 0, overdueInvoices: null, newTrialRequests: 2 }}
      />
    );
    const region = screen.getByRole("region", { name: "Necesita tu atención" });
    expect(within(region).getByRole("link", { name: "Responder: 2 solicitudes de prueba nuevas" })).toHaveAttribute(
      "href",
      `/owner/requests?${scopeQuery}`
    );
  });

  it("no muestra la fila si la tabla no está instalada o no hay nuevas", () => {
    render(
      <OwnerAttentionPanel
        organizationId={ORG}
        scopeQuery={scopeQuery}
        items={{ unrecordedSessions: { count: 0, latest: null }, fullClasses: 0, overdueInvoices: null }}
      />
    );
    expect(screen.queryByText(/solicitud/)).toBeNull();
  });
});
