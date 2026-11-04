// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/growth/client", () => ({
  capturePublicGrowthEvent: capture,
  getGrowthVisitorId: () => "10000000-0000-4000-8000-000000000001",
  getPublicAttribution: () => ({}),
}));

import { ContactForm } from "@/components/contact/ContactForm";
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  capture.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function completeRequest() {
  fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Responsable sintético" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "club@example.com" } });
  fireEvent.change(screen.getByLabelText("País del club"), { target: { value: "Argentina" } });
  fireEvent.change(screen.getByLabelText("Tu función en el club"), { target: { value: "owner" } });
  fireEvent.click(screen.getByLabelText("Rítmica"));
  fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "Queremos gestionar clases y asistencia." } });
}
const success = () => new Response(JSON.stringify({ ok: true, data: {} }), { status: 201 });

describe("entrada asistida internacional", () => {
  it("conserva la acción de contacto aunque el navegador rechace la telemetría", async () => {
    capture.mockImplementation(() => { throw new Error("Analytics unavailable"); });
    fetchMock.mockResolvedValueOnce(success());
    render(<ContactForm defaultReason="market_access" />);
    completeRequest();
    fireEvent.submit(screen.getByRole("form", { name: "Formulario de contacto" }));
    await screen.findByText(/Solicitud guardada/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeEnabled();
  });

  it("explica la selección obligatoria y no envía sin una disciplina", async () => {
    render(<ContactForm defaultReason="market_access" />);
    expect(screen.getByText("Elige al menos una opción.")).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("form", { name: "Formulario de contacto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige al menos una disciplina");
    expect(screen.getByLabelText("Artística femenina")).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no envía al abrir y conserva cuerpo y clave al reintentar una respuesta perdida en la misma pestaña", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Conexión perdida")).mockResolvedValueOnce(success());
    render(<ContactForm defaultReason="market_access" />);
    expect(fetchMock).not.toHaveBeenCalled();
    completeRequest();
    fireEvent.submit(screen.getByRole("form", { name: "Formulario de contacto" }));
    await screen.findByRole("alert");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const original = fetchMock.mock.calls[0][1].body;
    fireEvent.submit(screen.getByRole("form", { name: "Formulario de contacto" }));
    await screen.findByText(/Solicitud guardada/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(original);
    expect(JSON.parse(original).marketAccess).toEqual({ countryName: "Argentina", role: "owner", disciplines: ["rhythmic"] });
    expect(JSON.parse(original).submissionId).toMatch(/^[\da-f-]{36}$/i);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    for (const [event] of capture.mock.calls) {
      expect(event.properties).not.toHaveProperty("countryName");
      expect(JSON.stringify(event)).not.toContain("club@example.com");
    }
  });

  it("impide el doble envío mientras la solicitud está en curso", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    render(<ContactForm defaultReason="market_access" />);
    completeRequest();
    const form = screen.getByRole("form", { name: "Formulario de contacto" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(success());
    await waitFor(() => expect(screen.getByText(/Solicitud guardada/)).toBeInTheDocument());
  });
});
