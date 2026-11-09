// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SuperAdminContactInbox } from "@/app/(super-admin)/super-admin/components/SuperAdminContactInbox";

const fetchMock = vi.fn();
const contactEmail = "responsable+club@example.com";
const contactMessage = "Necesitamos acceso para esta academia.\n<img src=x onerror=alert(1)> País: ejemplo";

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: status < 400, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const requestItem = {
  id: "80000000-0000-4000-8000-000000000001",
  name: "Responsable",
  email: contactEmail,
  academy: "Club de gimnasia",
  reason: "market_access",
  message: contactMessage,
  createdAt: "2026-11-05T12:00:00.000Z",
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("bandeja SuperAdmin de solicitudes", () => {
  it("muestra la solicitud como texto y prepara un mailto escapado sin autoenvío", async () => {
    fetchMock.mockResolvedValue(response({ items: [requestItem], nextCursor: null }));

    const { container } = render(<SuperAdminContactInbox />);

    expect(await screen.findByText(/Necesitamos acceso para esta academia/)).toBeVisible();
    expect(container.textContent).toContain("País: ejemplo");
    const savedRequests = screen.getByRole("region", { name: "Solicitudes guardadas" });
    expect(within(savedRequests).getByText("Acceso asistido por país")).toBeVisible();
    expect(container.querySelector("img, script, iframe")).toBeNull();
    const draftLink = screen.getByRole("link", { name: "Redactar correo para Responsable" });
    expect(draftLink).toHaveAttribute(`href`, `mailto:${encodeURIComponent(contactEmail)}`);
    expect(screen.getByText(/no envía ni registra una respuesta/i)).toBeVisible();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });

  it("muestra estado vacío cuando no hay solicitudes", async () => {
    fetchMock.mockResolvedValue(response({ items: [], nextCursor: null }));

    render(<SuperAdminContactInbox />);

    expect(await screen.findByText("Todavía no hay solicitudes")).toBeVisible();
  });

  it("expone el error y permite reintentar la lectura", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ message: "fallo" }, 500))
      .mockResolvedValueOnce(response({ items: [requestItem], nextCursor: null }));

    render(<SuperAdminContactInbox />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Puedes volver a intentarlo");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Necesitamos acceso para esta academia/)).toBeVisible();
  });
});
