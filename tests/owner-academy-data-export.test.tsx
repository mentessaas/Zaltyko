// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerAcademyDataExport } from "@/components/owner-dashboard/OwnerAcademyDataExport";

const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "10000000-0000-4000-8000-000000000002";
const fetchMock = vi.fn();
const createObjectURLMock = vi.fn(() => "blob:academy-export");
const revokeObjectURLMock = vi.fn();
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL"
);
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL"
);
const clickedDownloads: Array<{ href: string; filename: string }> = [];

function successfulResponse(
  blob: Blob,
  options: { contentType?: string; redirected?: boolean } = {}
) {
  return {
    ok: true,
    status: 200,
    redirected: options.redirected ?? false,
    headers: new Headers({
      "content-type": options.contentType ?? "application/json; charset=utf-8",
    }),
    blob: vi.fn().mockResolvedValue(blob),
  } as unknown as Response;
}

function restoreUrlMethod(
  name: "createObjectURL" | "revokeObjectURL",
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(URL, name, descriptor);
  } else {
    Reflect.deleteProperty(URL, name);
  }
}

beforeEach(() => {
  fetchMock.mockReset();
  createObjectURLMock.mockReset().mockReturnValue("blob:academy-export");
  revokeObjectURLMock.mockReset();
  clickedDownloads.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURLMock,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURLMock,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      clickedDownloads.push({ href: this.href, filename: this.download });
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreUrlMethod("createObjectURL", originalCreateObjectURL);
  restoreUrlMethod("revokeObjectURL", originalRevokeObjectURL);
});

describe("OwnerAcademyDataExport", () => {
  it("descarga el JSON sin reserializarlo, con nombre local basado en el UUID y sin almacenarlo", async () => {
    const packageBlob = new Blob(
      ['{"manifest":{"excluded":["auth","storage"]},"checksums":{}}'],
      { type: "application/json" }
    );
    fetchMock.mockResolvedValueOnce(successfulResponse(packageBlob));
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");

    render(<OwnerAcademyDataExport organizationId={organizationId} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar datos operativos" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Descarga iniciada.");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/owner/data-export?organizationId=${organizationId}`,
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        redirect: "error",
      })
    );
    expect(createObjectURLMock).toHaveBeenCalledWith(packageBlob);
    expect(clickedDownloads).toEqual([
      {
        href: "blob:academy-export",
        filename: `datos-operativos-${organizationId}.json`,
      },
    ]);
    expect(storageWrite).not.toHaveBeenCalled();
    await waitFor(() => expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:academy-export"));
  });

  it.each([
    [401, "Tu sesión ha caducado."],
    [403, "no tiene permiso"],
    [404, "No se encontró una exportación"],
    [429, "límite de solicitudes"],
    [413, "supera el límite permitido"],
    [503, "temporalmente no disponible"],
  ])("muestra un mensaje seguro para HTTP %s sin mostrar el payload", async (status, message) => {
    const json = vi.fn().mockResolvedValue({
      detail: "private@example.test y contenido sensible",
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: Number(status),
      json,
    } as unknown as Response);

    render(<OwnerAcademyDataExport organizationId={organizationId} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar datos operativos" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(String(message));
    expect(alert).not.toHaveTextContent("private@example.test");
    expect(json).not.toHaveBeenCalled();
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "text/html",
      new Blob(["<html>login</html>"], { type: "text/html" }),
      "no devolvió un archivo JSON válido",
    ],
    ["application/json", new Blob([]), "archivo JSON vacío"],
  ])("rechaza contenido %s o un cuerpo vacío sin guardarlo", async (contentType, blob, message) => {
    fetchMock.mockResolvedValueOnce(
      successfulResponse(blob as Blob, { contentType: String(contentType) })
    );

    render(<OwnerAcademyDataExport organizationId={organizationId} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar datos operativos" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(String(message));
    expect(createObjectURLMock).not.toHaveBeenCalled();
    expect(clickedDownloads).toHaveLength(0);
  });

  it("rechaza una respuesta marcada como redirect aunque responda 200", async () => {
    fetchMock.mockResolvedValueOnce(
      successfulResponse(new Blob(["{}"], { type: "application/json" }), {
        redirected: true,
      })
    );

    render(<OwnerAcademyDataExport organizationId={organizationId} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar datos operativos" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo autorizar la descarga");
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it("impide enviar dos solicitudes mientras la descarga está pendiente", async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })
    );

    render(<OwnerAcademyDataExport organizationId={organizationId} />);
    const button = screen.getByRole("button", { name: "Descargar datos operativos" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    await act(async () => {
      resolveResponse(successfulResponse(new Blob(["{}"], { type: "application/json" })));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Descarga iniciada.");
  });

  it("descarta la respuesta pendiente al cambiar de academia", async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })
    );
    const view = render(<OwnerAcademyDataExport organizationId={organizationId} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar datos operativos" }));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    view.rerender(<OwnerAcademyDataExport organizationId={otherOrganizationId} />);
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolveResponse(successfulResponse(new Blob(["{}"], { type: "application/json" })));
    });

    expect(createObjectURLMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborta al desmontarse y no inicia una descarga tardía", async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })
    );
    const view = render(<OwnerAcademyDataExport organizationId={organizationId} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar datos operativos" }));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolveResponse(successfulResponse(new Blob(["{}"], { type: "application/json" })));
    });

    expect(createObjectURLMock).not.toHaveBeenCalled();
    expect(clickedDownloads).toHaveLength(0);
  });
});
