// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

import {
  OwnerGuardianContactsEditor,
  PENDING_OWNER_GUARDIAN_CONTACT_STORAGE_KEY,
  readPendingOwnerGuardianContact,
} from "@/components/owner-dashboard/OwnerGuardianContactsEditor";

const organizationId = "50000000-0000-4000-8000-000000000001";
const locationId = "50000000-0000-4000-8000-000000000002";
const guardianId = "50000000-0000-4000-8000-000000000003";
const otherGuardianId = "50000000-0000-4000-8000-000000000004";
const contactId = "50000000-0000-4000-8000-000000000005";
const changedContactId = "50000000-0000-4000-8000-000000000006";
const idempotencyKey = "50000000-0000-4000-8000-000000000099";
const updatedAt = "2026-10-25T10:00:00.000Z";
let generatedKeyIndex = 0;
const generatedKeys = [
  idempotencyKey,
  "50000000-0000-4000-8000-000000000098",
  "50000000-0000-4000-8000-000000000097",
];

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function getPayload(targetGuardianId = guardianId, emailValue: string | null = "old@example.test") {
  return {
    ok: true,
    data: {
      guardianId: targetGuardianId,
      contacts: {
        email: emailValue === null ? null : {
          contactId,
          value: emailValue,
          verifiedAt: null,
          updatedAt,
        },
        phone: null,
      },
    },
  };
}

function patchPayload(targetGuardianId = guardianId, emailValue = "new@example.test", replayed = false) {
  return {
    ok: true,
    data: {
      guardianId: targetGuardianId,
      contacts: {
        email: { contactId: changedContactId, value: emailValue, verifiedAt: null, updatedAt: "2026-10-25T10:01:00.000Z" },
        phone: null,
      },
      replayed,
    },
  };
}

function phonePatchPayload(targetGuardianId = guardianId) {
  return {
    ok: true,
    data: {
      guardianId: targetGuardianId,
      contacts: {
        email: null,
        phone: { contactId: changedContactId, value: "+34612345678", verifiedAt: null, updatedAt: "2026-10-25T10:01:00.000Z" },
      },
      replayed: false,
    },
  };
}

function props(overrides: Partial<ComponentProps<typeof OwnerGuardianContactsEditor>> = {}) {
  return {
    organizationId,
    locationId,
    guardianId,
    displayName: "María García",
    ...overrides,
  };
}

function scopedStorageKey(targetGuardianId = guardianId) {
  return `${PENDING_OWNER_GUARDIAN_CONTACT_STORAGE_KEY}:${organizationId}:${locationId}:${targetGuardianId}`;
}

async function openEmailEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Editar correo" }));
  return screen.getByLabelText("Correo electrónico");
}

beforeEach(() => {
  mocks.fetch.mockReset();
  window.sessionStorage.clear();
  generatedKeyIndex = 0;
  vi.stubGlobal("crypto", { randomUUID: () => generatedKeys[generatedKeyIndex++] ?? generatedKeys[generatedKeys.length - 1] });
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("contactos del tutor en Owner", () => {
  it("lee el alcance del pagador, normaliza el correo y guarda solo ese tipo de contacto", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockResolvedValueOnce(response(200, patchPayload()));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor {...props()} />);
    const input = await openEmailEditor(user);
    await user.clear(input);
    await user.type(input, " New@Example.Test ");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));

    expect(await screen.findByRole("status")).toHaveTextContent("No se ha enviado correo ni verificado");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[0][0]).toBe(`/api/v1/owner/guardians/${guardianId}/contacts?organizationId=${organizationId}&locationId=${locationId}`);
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(mocks.fetch.mock.calls[0][1]).not.toHaveProperty("method");
    const [url, init] = mocks.fetch.mock.calls[1];
    expect(url).toBe(`/api/v1/owner/guardians/${guardianId}/contacts`);
    expect(init).toMatchObject({ method: "PATCH", cache: "no-store" });
    expect(init.headers).toEqual({ "content-type": "application/json", "Idempotency-Key": idempotencyKey });
    expect(JSON.parse(init.body)).toEqual({
      organizationId,
      locationId,
      kind: "email",
      expectedContactId: contactId,
      expectedValue: "old@example.test",
      expectedUpdatedAt: updatedAt,
      value: "new@example.test",
    });
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage)).toEqual({ kind: "none" });
  });

  it("exige prefijo internacional explícito y nunca infiere país para un teléfono", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload(guardianId, null)));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor {...props()} />);
    await user.click(await screen.findByRole("button", { name: "Editar teléfono" }));
    await user.type(screen.getByLabelText("Teléfono"), "612345678");
    await user.click(screen.getByRole("button", { name: "Guardar teléfono" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("formato internacional E.164, con + y prefijo de país explícito");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("none");
  });

  it("normaliza el formato de teléfono solo cuando el usuario ya indicó + y el país", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload(guardianId, null)))
      .mockResolvedValueOnce(response(200, phonePatchPayload()));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor {...props()} />);
    await user.click(await screen.findByRole("button", { name: "Editar teléfono" }));
    await user.type(screen.getByLabelText("Teléfono"), "+34 (612) 345-678");
    await user.click(screen.getByRole("button", { name: "Guardar teléfono" }));

    expect(await screen.findByRole("status")).toHaveTextContent("No se ha enviado correo ni verificado");
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
      organizationId,
      locationId,
      kind: "phone",
      expectedContactId: null,
      expectedValue: null,
      expectedUpdatedAt: null,
      value: "+34612345678",
    });
  });

  it("conserva cuerpo y clave tras respuesta perdida y al remontar solo reintenta por acción explícita", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(200, getPayload()))
      .mockResolvedValueOnce(response(200, patchPayload()));
    const user = userEvent.setup();
    const first = render(<OwnerGuardianContactsEditor {...props()} />);
    const input = await openEmailEditor(user);
    await user.clear(input);
    await user.type(input, "new@example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó el contacto");
    const firstRequest = mocks.fetch.mock.calls[1];
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("pending");
    first.unmount();

    render(<OwnerGuardianContactsEditor {...props()} />);
    await screen.findByRole("region", { name: "Contactos de María García" });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(4));
    expect(mocks.fetch.mock.calls[3]).toEqual(firstRequest);
    expect(await screen.findByRole("status")).toHaveTextContent("No se ha enviado correo ni verificado");
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("none");
  });

  it("al confirmar un replay actualiza la ficha con el estado actual del servidor, no con el cuerpo antiguo", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(200, patchPayload(guardianId, "later@example.test", true)));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor {...props()} />);
    const input = await openEmailEditor(user);
    await user.clear(input);
    await user.type(input, "new@example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó el contacto");
    await user.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/se muestran los contactos actuales/i);
    expect(screen.getByText("later@example.test")).toBeVisible();
    expect(screen.queryByText("new@example.test")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch.mock.calls[2]).toEqual(mocks.fetch.mock.calls[1]);
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("none");
  });

  it("no envía PATCH si sessionStorage impide persistir y releer el comando", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor {...props()} />);
    const input = await openEmailEditor(user);
    await user.clear(input);
    await user.type(input, "new@example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar y verificar");
    expect(setItem).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("none");
  });

  it("bloquea cambios cuando el marcador de sesión está malformado", async () => {
    window.sessionStorage.setItem(scopedStorageKey(), "not-json");
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()));
    render(<OwnerGuardianContactsEditor {...props()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede verificar el marcador");
    expect(screen.getByRole("button", { name: "Editar correo" })).toBeDisabled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("limpia un Problem Details definitivo en el primer intento pero conserva un 4xx después de incertidumbre", async () => {
    const validationProblem = response(422, {
      type: "https://zaltyko.com/problems/guardian-contact-conflict",
      title: "Datos no válidos",
      status: 422,
      detail: "El correo no es válido.",
    });
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockResolvedValueOnce(validationProblem)
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(409, {
        type: "https://zaltyko.com/problems/guardian-contact-conflict",
        title: "Conflicto de contacto",
        status: 409,
        detail: "El contacto cambió en otra sesión.",
      }));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor {...props()} />);
    const input = await openEmailEditor(user);
    await user.clear(input);
    await user.type(input, "new@example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El correo no es válido");
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("none");

    await user.click(screen.getByRole("button", { name: "Guardar correo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó el contacto");
    const uncertainRequest = mocks.fetch.mock.calls[2];
    await user.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó el contacto");
    expect(mocks.fetch.mock.calls[3]).toEqual(uncertainRequest);
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("pending");
  });

  it("recupera solo VERSION_CONFLICT con una lectura nueva y sin reenvío automático", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(409, {
        type: "https://zaltyko.com/problems/version-conflict",
        title: "Conflicto de versión o estado",
        status: 409,
        detail: "El contacto cambió desde la última lectura. Recarga los datos antes de guardar.",
      }))
      .mockResolvedValueOnce(response(200, getPayload(guardianId, "current@example.test")));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor {...props()} />);
    const input = await openEmailEditor(user);
    await user.clear(input);
    await user.type(input, "new@example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó el contacto");
    const originalRequest = mocks.fetch.mock.calls[1];
    await user.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));

    expect(await screen.findByRole("status")).toHaveTextContent("El contacto cambió desde la última lectura");
    expect(screen.getByText("current@example.test")).toBeVisible();
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("none");
    expect(mocks.fetch.mock.calls[2]).toEqual(originalRequest);
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });

  it("conserva y bloquea un idempotency-conflict incluso después de incertidumbre", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(409, {
        type: "https://zaltyko.com/problems/idempotency-conflict",
        title: "Conflicto de clave",
        status: 409,
        detail: "La clave ya pertenece a otro cambio.",
      }));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor {...props()} />);
    const input = await openEmailEditor(user);
    await user.clear(input);
    await user.type(input, "new@example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó el contacto");
    await user.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("bloqueamos nuevos intentos");
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeDisabled();
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("pending");
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it("ignora un GET tardío de un tutor anterior y carga solo el nuevo scope", async () => {
    const previousGet = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockReturnValueOnce(previousGet.promise).mockResolvedValueOnce(response(200, getPayload(otherGuardianId, null)));
    const view = render(<OwnerGuardianContactsEditor {...props()} />);
    view.rerender(<OwnerGuardianContactsEditor {...props({ guardianId: otherGuardianId })} />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    await screen.findAllByText("Sin dato guardado");
    await act(async () => {
      previousGet.resolve(response(200, getPayload(guardianId, "stale@example.test")));
      await previousGet.promise;
    });

    expect(screen.getAllByText("Sin dato guardado")).toHaveLength(2);
    expect(screen.queryByText("stale@example.test")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("none");
  });

  it("mantiene el comando del tutor anterior sin aplicar su respuesta al nuevo scope", async () => {
    const latePatch = deferred<ReturnType<typeof response>>();
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockReturnValueOnce(latePatch.promise)
      .mockResolvedValueOnce(response(200, getPayload(otherGuardianId, null)));
    const user = userEvent.setup();
    const view = render(<OwnerGuardianContactsEditor {...props()} />);
    const input = await openEmailEditor(user);
    await user.clear(input);
    await user.type(input, "new@example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("pending");

    view.rerender(<OwnerGuardianContactsEditor {...props({ guardianId: otherGuardianId })} />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    await screen.findAllByText("Sin dato guardado");
    await act(async () => {
      latePatch.resolve(response(200, patchPayload()));
      await latePatch.promise;
    });

    expect(screen.getAllByText("Sin dato guardado")).toHaveLength(2);
    expect(screen.queryByText("new@example.test")).not.toBeInTheDocument();
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId }, window.sessionStorage).kind).toBe("pending");
    expect(readPendingOwnerGuardianContact({ organizationId, locationId, guardianId: otherGuardianId }, window.sessionStorage).kind).toBe("none");
  });

  it("falla cerrado si GET devuelve un tutor o un contrato distinto", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload(otherGuardianId)));
    render(<OwnerGuardianContactsEditor {...props()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("formato esperado");
    expect(screen.queryByRole("button", { name: "Editar correo" })).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});
