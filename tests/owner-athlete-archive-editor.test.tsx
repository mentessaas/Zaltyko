// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OwnerAthleteArchiveEditor,
  PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY,
  readPendingOwnerAthleteArchive,
} from "@/components/owner-dashboard/OwnerAthleteArchiveEditor";

const organizationId = "40000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000002";
const groupId = "40000000-0000-4000-8000-000000000003";
const athleteId = "40000000-0000-4000-8000-000000000004";
const idempotencyKey = "40000000-0000-4000-8000-000000000099";
const endpoint = `/api/v1/owner/athletes/${athleteId}/archive`;

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function props(overrides: Partial<ComponentProps<typeof OwnerAthleteArchiveEditor>> = {}) {
  return {
    organizationId,
    locationId,
    groupId,
    athleteId,
    athleteName: "Ana García",
    ...overrides,
  };
}

function archivedReceipt(replayed = false) {
  return { ok: true, data: { athleteId, isActive: false, replayed } };
}

async function openConfirmation(user: ReturnType<typeof userEvent.setup>, name = "Archivar ficha de Ana García") {
  const trigger = await screen.findByRole("button", { name });
  await waitFor(() => expect(trigger).toBeEnabled());
  await user.click(trigger);
}

beforeEach(() => {
  mocks.fetch.mockReset();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", { randomUUID: () => idempotencyKey });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("archivo explícito de ficha Owner", () => {
  it("requiere confirmación, persiste y relee el comando exacto antes de enviar", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation(async () => {
      expect(readPendingOwnerAthleteArchive().kind).toBe("pending");
      return response(200, archivedReceipt());
    });
    const onArchived = vi.fn();
    const view = render(<OwnerAthleteArchiveEditor {...props({ onArchived })} />);
    await openConfirmation(user);

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(await screen.findByText(/no borra la ficha/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    expect(mocks.fetch.mock.calls[0]).toEqual([endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ organizationId, locationId }),
    }]);
    expect(await screen.findByRole("status")).toHaveTextContent("Ficha archivada");
    expect(onArchived).toHaveBeenCalledOnce();
    expect(readPendingOwnerAthleteArchive().kind).toBe("none");
    view.unmount();
  });

  it("ignora doble clic mientras el envío está pendiente", async () => {
    const patch = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockReturnValue(patch.promise);
    const user = userEvent.setup();
    render(<OwnerAthleteArchiveEditor {...props()} />);
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    const submit = screen.getByRole("button", { name: "Comprobando archivo…" });
    expect(submit).toBeDisabled();
    expect(mocks.fetch).toHaveBeenCalledOnce();

    await act(async () => {
      patch.resolve(response(200, archivedReceipt()));
      await patch.promise;
    });
    expect(await screen.findByText(/Ficha archivada/)).toBeVisible();
  });

  it("tras perder respuesta conserva body y clave y solo reintenta tras acción humana", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(200, archivedReceipt(true)));
    const onArchived = vi.fn();
    const user = userEvent.setup();
    const first = render(<OwnerAthleteArchiveEditor {...props({ onArchived })} />);
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se archivó");
    const originalRequest = mocks.fetch.mock.calls[0];
    const stored = readPendingOwnerAthleteArchive();
    expect(stored.kind).toBe("pending");
    if (stored.kind !== "pending") throw new Error("archive command should remain recoverable");
    first.unmount();

    render(<OwnerAthleteArchiveEditor {...props({ onArchived, pendingCommand: stored.command })} />);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    await openConfirmation(user, "Resolver archivo pendiente de Ana García");
    await user.click(screen.getByRole("button", { name: "Reintentar archivo" }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(mocks.fetch.mock.calls[1]).toEqual(originalRequest);
    expect(onArchived).toHaveBeenCalledOnce();
    expect(readPendingOwnerAthleteArchive().kind).toBe("none");
  });

  it("falla cerrado si el almacenamiento no permite persistir y verificar", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    const user = userEvent.setup();
    render(<OwnerAthleteArchiveEditor {...props()} />);
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    expect(await screen.findByText(/No se ha enviado el archivo/)).toBeVisible();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("no envía nada si el marcador de sessionStorage está malformado", async () => {
    window.sessionStorage.setItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY, "{malformed");
    const user = userEvent.setup();
    render(<OwnerAthleteArchiveEditor {...props()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("operación de archivo no válida");
    expect(screen.getByRole("button", { name: "Archivar ficha de Ana García" })).toBeDisabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("limpia un rechazo 4xx estructurado inicial y permite una decisión posterior explícita", async () => {
    mocks.fetch.mockResolvedValueOnce(response(403, {
      type: "https://zaltyko.com/problems/forbidden",
      status: 403,
      title: "Sin permiso",
      detail: "No tienes permisos para archivar esta ficha.",
    }));
    const user = userEvent.setup();
    render(<OwnerAthleteArchiveEditor {...props()} />);
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permisos");
    expect(readPendingOwnerAthleteArchive().kind).toBe("none");
  });

  it("conserva la misma clave ante 4xx tras una respuesta ambigua", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(403, {
        type: "https://zaltyko.com/problems/forbidden",
        status: 403,
        title: "Sin permiso",
        detail: "No tienes permisos para archivar esta ficha.",
      }));
    const user = userEvent.setup();
    render(<OwnerAthleteArchiveEditor {...props()} />);
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se archivó");
    const stored = readPendingOwnerAthleteArchive();
    expect(stored.kind).toBe("pending");
    if (stored.kind !== "pending") throw new Error("uncertain archive must remain pending");
    const requestBeforeRetry = mocks.fetch.mock.calls[0];

    await openConfirmation(user, "Resolver archivo pendiente de Ana García");
    await user.click(screen.getByRole("button", { name: "Reintentar archivo" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(mocks.fetch.mock.calls[1]).toEqual(requestBeforeRetry);
    expect(readPendingOwnerAthleteArchive().kind).toBe("pending");
  });

  it("no consume un recibo malformado como éxito y conserva el comando", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, { ok: true, data: { athleteId, isActive: false } }));
    const onArchived = vi.fn();
    const user = userEvent.setup();
    render(<OwnerAthleteArchiveEditor {...props({ onArchived })} />);
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La respuesta no confirmó el archivo");
    expect(readPendingOwnerAthleteArchive().kind).toBe("pending");
    expect(onArchived).not.toHaveBeenCalled();
  });

  it("fencea una respuesta tardía después de cambiar de sede", async () => {
    const patch = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockReturnValue(patch.promise);
    const onArchived = vi.fn();
    const user = userEvent.setup();
    const view = render(<OwnerAthleteArchiveEditor {...props({ onArchived })} />);
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    expect(readPendingOwnerAthleteArchive().kind).toBe("pending");

    view.rerender(<OwnerAthleteArchiveEditor {...props({ locationId: "40000000-0000-4000-8000-000000000099", onArchived })} />);
    await act(async () => {
      patch.resolve(response(200, archivedReceipt()));
      await patch.promise;
    });
    expect(onArchived).not.toHaveBeenCalled();
    const stored = readPendingOwnerAthleteArchive();
    expect(stored.kind).toBe("pending");
    if (stored.kind === "pending") expect(stored.command.locationId).toBe(locationId);
  });

  it("no llama callbacks ni borra el marcador si se desmonta durante el POST", async () => {
    const patch = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockReturnValue(patch.promise);
    const onArchived = vi.fn();
    const user = userEvent.setup();
    const view = render(<OwnerAthleteArchiveEditor {...props({ onArchived })} />);
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    view.unmount();

    await act(async () => {
      patch.resolve(response(200, archivedReceipt()));
      await patch.promise;
    });
    expect(onArchived).not.toHaveBeenCalled();
    expect(readPendingOwnerAthleteArchive().kind).toBe("pending");
  });
});
