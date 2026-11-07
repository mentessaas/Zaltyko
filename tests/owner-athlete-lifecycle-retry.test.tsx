// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  post: vi.fn(),
  refresh: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: vi.fn() }),
  usePathname: () => "/owner/athletes",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ pushToast: mocks.pushToast }),
}));
vi.mock("@/hooks/use-translation", () => ({ useTranslation: () => ({ locale: "es" }) }));

import { AthletesTableView } from "@/components/athletes/AthletesTableView";

const academyId = "30000000-0000-4000-8000-000000000001";
const athleteId = "30000000-0000-4000-8000-000000000002";
const athlete = {
  id: athleteId,
  name: "Gimnasta sintética",
  level: "Iniciación",
  status: "active" as const,
  age: 10,
  groupName: null,
  groupColor: null,
};

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  let sequence = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `40000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
  vi.stubGlobal("confirm", () => true);
  mocks.post.mockResolvedValue(response(200, { ok: true, data: { archivedCount: 1, replayed: false } }));
  mocks.fetch.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return mocks.post();
    return response(200, { ok: true, data: { items: [] } });
  });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("reintento del archivo de gimnastas", () => {
  it("reenvía exactamente el mismo cuerpo y clave tras perderse la respuesta", async () => {
    mocks.post
      .mockRejectedValueOnce(new TypeError("Network connection lost"))
      .mockResolvedValueOnce(response(200, { ok: true, data: { archivedCount: 1, replayed: true } }));
    const user = userEvent.setup();
    render(
      <AthletesTableView
        academyId={academyId}
        tenantId={academyId}
        athletes={[athlete]}
        levels={[]}
        groups={[]}
        filters={{}}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: `Seleccionar ${athlete.name}` })[0]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Accion por lote" }), "archive");
    await waitFor(() => expect(mocks.pushToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "No se pudieron archivar",
      description: expect.stringContaining("misma selección"),
    })));

    await user.selectOptions(screen.getByRole("combobox", { name: "Accion por lote" }), "archive");
    await waitFor(() => expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2));

    const writes = mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[0][1].headers).toMatchObject({ "Idempotency-Key": expect.any(String) });
    expect(window.sessionStorage.length).toBe(0);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("no envía el archivo si el navegador no permite persistir la clave antes del POST", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    const user = userEvent.setup();
    render(
      <AthletesTableView
        academyId={academyId}
        tenantId={academyId}
        athletes={[athlete]}
        levels={[]}
        groups={[]}
        filters={{}}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: `Seleccionar ${athlete.name}` })[0]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Accion por lote" }), "archive");

    expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    expect(mocks.pushToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "No se pudo preparar el archivo",
      description: expect.stringContaining("No se envió ningún cambio."),
    }));
  });

  it("reutiliza la restauración pendiente tras perderse su respuesta", async () => {
    mocks.post
      .mockRejectedValueOnce(new TypeError("Network connection lost"))
      .mockResolvedValueOnce(response(200, { ok: true, data: { restored: true, replayed: true } }));
    const archivedAthlete = { ...athlete, status: "archived" as const };
    const user = userEvent.setup();
    render(
      <AthletesTableView
        academyId={academyId}
        tenantId={academyId}
        athletes={[archivedAthlete]}
        levels={[]}
        groups={[]}
        filters={{ status: "archived" }}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Restaurar" })[0]);
    await waitFor(() => expect(mocks.pushToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "No se pudo restaurar",
      description: expect.stringContaining("misma operación"),
    })));

    await user.click(screen.getAllByRole("button", { name: "Restaurar" })[0]);
    await waitFor(() => expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2));

    const writes = mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[0][1].headers).toMatchObject({ "Idempotency-Key": expect.any(String) });
    expect(window.sessionStorage.length).toBe(0);
  });
});
