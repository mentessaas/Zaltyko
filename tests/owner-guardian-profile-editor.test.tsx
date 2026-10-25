// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

import {
  OwnerGuardianProfileEditor,
  PENDING_OWNER_GUARDIAN_PROFILE_STORAGE_KEY,
  normalizeGuardianProfileName,
  readPendingOwnerGuardianProfile,
} from "@/components/owner-dashboard/OwnerGuardianProfileEditor";

const organizationId = "60000000-0000-4000-8000-000000000001";
const locationId = "60000000-0000-4000-8000-000000000002";
const guardianId = "60000000-0000-4000-8000-000000000003";
const idempotencyKey = "60000000-0000-4000-8000-000000000099";
const oldUpdatedAt = "2026-10-25T09:30:00.123456Z";
const newUpdatedAt = "2026-10-25T09:35:00.654321Z";

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function getPayload(overrides: Record<string, unknown> = {}) {
  return { ok: true, data: { guardianId, givenName: "Ana", familyName: "López", updatedAt: oldUpdatedAt, ...overrides } };
}

function patchPayload(overrides: Record<string, unknown> = {}) {
  return { ok: true, data: { guardianId, givenName: "Ana María", familyName: "López Ruiz", updatedAt: newUpdatedAt, replayed: false, ...overrides } };
}

function props(overrides: Partial<ComponentProps<typeof OwnerGuardianProfileEditor>> = {}) {
  return { organizationId, locationId, guardianId, ...overrides };
}

function scopedKey(targetGuardianId = guardianId) {
  return `${PENDING_OWNER_GUARDIAN_PROFILE_STORAGE_KEY}:${organizationId}:${locationId}:${targetGuardianId}`;
}

beforeEach(() => {
  mocks.fetch.mockReset();
  window.sessionStorage.clear();
  vi.stubGlobal("crypto", { randomUUID: () => idempotencyKey });
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("edición del perfil compartido del tutor", () => {
  it("normaliza Unicode NFC y espacios sin separar los apellidos", () => {
    expect(normalizeGuardianProfileName("  Ana   Ma\u0301ria  ")).toBe("Ana María");
  });

  it("lee la versión exacta, persiste el comando antes del PATCH y confirma una escritura", async () => {
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        expect(readPendingOwnerGuardianProfile({ organizationId, locationId, guardianId }).kind).toBe("pending");
        return response(200, patchPayload());
      }
      return response(200, getPayload());
    });
    const user = userEvent.setup();
    render(<OwnerGuardianProfileEditor {...props()} />);
    const givenName = await screen.findByLabelText("Nombre");
    await user.clear(givenName);
    await user.type(givenName, "  Ana   Mari\u0301a  ");
    const familyName = screen.getByLabelText("Apellidos");
    await user.clear(familyName);
    await user.type(familyName, "López Ruiz");
    await user.click(screen.getByRole("button", { name: "Guardar nombre del tutor" }));

    expect(await screen.findByText("Perfil del tutor actualizado.")).toBeVisible();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch.mock.calls[0][0]).toBe(`/api/v1/owner/guardians/${guardianId}/profile?organizationId=${organizationId}&locationId=${locationId}`);
    expect(mocks.fetch.mock.calls[2][0]).toBe(`/api/v1/owner/guardians/${guardianId}/profile`);
    const patch = mocks.fetch.mock.calls[2][1] as RequestInit;
    expect(patch).toMatchObject({ method: "PATCH", cache: "no-store" });
    expect(patch.headers).toEqual({ "content-type": "application/json", "Idempotency-Key": idempotencyKey });
    expect(JSON.parse(String(patch.body))).toEqual({
      organizationId,
      locationId,
      expectedGivenName: "Ana",
      expectedFamilyName: "López",
      expectedUpdatedAt: oldUpdatedAt,
      givenName: "Ana María",
      familyName: "López Ruiz",
    });
    expect(window.sessionStorage.getItem(scopedKey())).toBeNull();
  });

  it("no reenvía al restaurar una operación incierta y el botón reutiliza exactamente clave y cuerpo tras releer", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockResolvedValueOnce(response(200, getPayload()))
      .mockRejectedValueOnce(new TypeError("network lost"))
      .mockResolvedValueOnce(response(200, getPayload({ givenName: "Ana María", familyName: "López Ruiz", updatedAt: newUpdatedAt })))
      .mockResolvedValueOnce(response(200, patchPayload({ updatedAt: "2026-10-25T09:36:00.000001Z", replayed: true })));
    const user = userEvent.setup();
    const { unmount } = render(<OwnerGuardianProfileEditor {...props()} />);
    const givenName = await screen.findByLabelText("Nombre");
    await user.clear(givenName);
    await user.type(givenName, "Ana María");
    await user.type(screen.getByLabelText("Apellidos"), " Ruiz");
    await user.click(screen.getByRole("button", { name: "Guardar nombre del tutor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se sabe si se guardó el perfil");
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(readPendingOwnerGuardianProfile({ organizationId, locationId, guardianId }).kind).toBe("pending");
    unmount();

    render(<OwnerGuardianProfileEditor {...props()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Comprobar y reintentar el mismo cambio" })).toBeEnabled());
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    await user.click(screen.getByRole("button", { name: "Comprobar y reintentar el mismo cambio" }));
    expect(await screen.findByText("La operación ya estaba registrada; se muestran los nombres actuales del tutor.")).toBeVisible();
    expect(mocks.fetch).toHaveBeenCalledTimes(5);
    const firstPatch = mocks.fetch.mock.calls[2][1] as RequestInit;
    const retryPatch = mocks.fetch.mock.calls[4][1] as RequestInit;
    expect(retryPatch.body).toBe(firstPatch.body);
    expect(retryPatch.headers).toEqual(firstPatch.headers);
    expect(window.sessionStorage.getItem(scopedKey())).toBeNull();
  });

  it("trata el conflicto de versión como definitivo, relee y no reintenta el PATCH", async () => {
    mocks.fetch.mockResolvedValueOnce(response(200, getPayload()))
      .mockResolvedValueOnce(response(200, getPayload()))
      .mockResolvedValueOnce(response(409, {
        type: "https://zaltyko.com/problems/version-conflict",
        title: "Conflicto de versión",
        status: 409,
        detail: "Perfil cambiado",
      }))
      .mockResolvedValueOnce(response(200, getPayload({ givenName: "María", familyName: "Pérez", updatedAt: "2026-10-25T09:31:00.000001Z" })));
    const user = userEvent.setup();
    render(<OwnerGuardianProfileEditor {...props()} />);
    const givenName = await screen.findByLabelText("Nombre");
    await user.clear(givenName);
    await user.type(givenName, "Ana María");
    await user.type(screen.getByLabelText("Apellidos"), " Ruiz");
    await user.click(screen.getByRole("button", { name: "Guardar nombre del tutor" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El perfil cambió desde la última lectura");
    expect(screen.getByLabelText("Nombre")).toHaveValue("María");
    expect(screen.getByLabelText("Apellidos")).toHaveValue("Pérez");
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(window.sessionStorage.getItem(scopedKey())).toBeNull();
  });

  it("no recupera un comando pendiente de otro guardianId", () => {
    window.sessionStorage.setItem(scopedKey(guardianId), JSON.stringify({
      version: 1,
      organizationId,
      locationId,
      guardianId: "60000000-0000-4000-8000-000000000004",
      method: "PATCH",
      endpoint: "/api/v1/owner/guardians/60000000-0000-4000-8000-000000000004/profile",
      idempotencyKey,
      body: JSON.stringify({
        organizationId,
        locationId,
        expectedGivenName: "Ana",
        expectedFamilyName: "López",
        expectedUpdatedAt: oldUpdatedAt,
        givenName: "Otra",
        familyName: "Persona",
      }),
    }));
    expect(readPendingOwnerGuardianProfile({ organizationId, locationId, guardianId }).kind).toBe("invalid");
  });
});
