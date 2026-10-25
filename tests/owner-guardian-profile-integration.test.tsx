// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

import { OwnerGuardianContactsEditor } from "@/components/owner-dashboard/OwnerGuardianContactsEditor";
import { PENDING_OWNER_GUARDIAN_PROFILE_STORAGE_KEY } from "@/components/owner-dashboard/OwnerGuardianProfileEditor";

const organizationId = "61000000-0000-4000-8000-000000000001";
const locationId = "61000000-0000-4000-8000-000000000002";
const guardianId = "61000000-0000-4000-8000-000000000003";
const contactId = "61000000-0000-4000-8000-000000000004";

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("integración del perfil del tutor en contactos del pagador", () => {
  it("mantiene bloqueado el alcance compartido mientras el editor del perfil está abierto", async () => {
    const onPendingChange = vi.fn();
    const onClose = vi.fn();
    mocks.fetch.mockResolvedValueOnce(response(200, {
      ok: true,
      data: {
        guardianId,
        contacts: {
          email: { contactId, value: "ana@example.test", verifiedAt: null, updatedAt: "2026-10-25T09:30:00.123456Z" },
          phone: null,
        },
      },
    })).mockResolvedValueOnce(response(200, {
      ok: true,
      data: { guardianId, givenName: "Ana", familyName: "López", updatedAt: "2026-10-25T09:30:00.123456Z" },
    }));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor
      organizationId={organizationId}
      locationId={locationId}
      guardianId={guardianId}
      displayName="Ana López"
      onPendingChange={onPendingChange}
      onClose={onClose}
    />);
    await screen.findByText("ana@example.test");
    await user.click(screen.getByRole("button", { name: "Editar nombre del tutor" }));

    expect(await screen.findByLabelText("Nombre")).toHaveValue("Ana");
    expect(screen.getByLabelText("Apellidos")).toHaveValue("López");
    expect(mocks.fetch.mock.calls[1][0]).toBe(`/api/v1/owner/guardians/${guardianId}/profile?organizationId=${organizationId}&locationId=${locationId}`);
    expect(screen.getByRole("button", { name: "Perfil abierto" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar contactos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar correo" })).toBeDisabled();
    expect(onPendingChange).toHaveBeenLastCalledWith(`${organizationId}:${locationId}:${guardianId}`, true);

    await user.click(screen.getByRole("button", { name: "Cerrar perfil" }));
    expect(screen.queryByRole("region", { name: "Perfil del tutor" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar contactos" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Editar correo" })).toBeEnabled();
    expect(onPendingChange).toHaveBeenLastCalledWith(`${organizationId}:${locationId}:${guardianId}`, false);
  });

  it("restaura un comando pendiente sin enviarlo y permite reintentar la misma operación con el editor exterior bloqueado", async () => {
    const idempotencyKey = "61000000-0000-4000-8000-000000000099";
    const expectedUpdatedAt = "2026-10-25T09:30:00.123456Z";
    const storedBody = JSON.stringify({
      organizationId,
      locationId,
      expectedGivenName: "Ana",
      expectedFamilyName: "López",
      expectedUpdatedAt,
      givenName: "Ana María",
      familyName: "López Ruiz",
    });
    const storageKey = `${PENDING_OWNER_GUARDIAN_PROFILE_STORAGE_KEY}:${organizationId}:${locationId}:${guardianId}`;
    window.sessionStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      organizationId,
      locationId,
      guardianId,
      method: "PATCH",
      endpoint: `/api/v1/owner/guardians/${guardianId}/profile`,
      idempotencyKey,
      body: storedBody,
    }));
    const onPendingChange = vi.fn();
    mocks.fetch.mockResolvedValueOnce(response(200, {
      ok: true,
      data: { guardianId, contacts: { email: null, phone: null } },
    })).mockResolvedValueOnce(response(200, {
      ok: true,
      data: { guardianId, givenName: "Ana", familyName: "López", updatedAt: expectedUpdatedAt },
    })).mockResolvedValueOnce(response(200, {
      ok: true,
      data: { guardianId, givenName: "Ana María", familyName: "López Ruiz", updatedAt: "2026-10-25T09:35:00.654321Z" },
    })).mockResolvedValueOnce(response(200, {
      ok: true,
      data: { guardianId, givenName: "Ana María", familyName: "López Ruiz", updatedAt: "2026-10-25T09:35:00.654321Z", replayed: true },
    }));
    const user = userEvent.setup();
    render(<OwnerGuardianContactsEditor
      organizationId={organizationId}
      locationId={locationId}
      guardianId={guardianId}
      displayName="Ana López"
      disabled
      onPendingChange={onPendingChange}
      onClose={() => undefined}
    />);

    const retry = await screen.findByRole("button", { name: "Comprobar y reintentar el mismo cambio" });
    expect(retry).toBeEnabled();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);
    expect(screen.getByRole("button", { name: "Cerrar contactos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar correo" })).toBeDisabled();
    expect(onPendingChange).toHaveBeenLastCalledWith(`${organizationId}:${locationId}:${guardianId}`, true);

    await user.click(retry);
    expect(await screen.findByText("La operación ya estaba registrada; se muestran los nombres actuales del tutor.")).toBeVisible();
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(mocks.fetch.mock.calls[3][0]).toBe(`/api/v1/owner/guardians/${guardianId}/profile`);
    expect(mocks.fetch.mock.calls[3][1]).toEqual({
      method: "PATCH",
      headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: storedBody,
      cache: "no-store",
    });
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    // The panel remains mounted and keeps the outer association locked until
    // the user closes it after the exact replay is resolved.
    expect(screen.getByRole("button", { name: "Cerrar contactos" })).toBeDisabled();
    expect(onPendingChange).toHaveBeenLastCalledWith(`${organizationId}:${locationId}:${guardianId}`, true);
  });

  it("restaura de forma bloqueada un marcador inválido y conserva su alcance", async () => {
    const storageKey = `${PENDING_OWNER_GUARDIAN_PROFILE_STORAGE_KEY}:${organizationId}:${locationId}:${guardianId}`;
    const invalidMarker = JSON.stringify({
      version: 1,
      organizationId,
      locationId,
      guardianId: "61000000-0000-4000-8000-000000000099",
      method: "PATCH",
      endpoint: "/api/v1/owner/guardians/61000000-0000-4000-8000-000000000099/profile",
      idempotencyKey: "61000000-0000-4000-8000-000000000098",
      body: JSON.stringify({
        organizationId,
        locationId,
        expectedGivenName: "Ana",
        expectedFamilyName: "López",
        expectedUpdatedAt: "2026-10-25T09:30:00.123456Z",
        givenName: "Otra",
        familyName: "Persona",
      }),
    });
    window.sessionStorage.setItem(storageKey, invalidMarker);
    const onPendingChange = vi.fn();
    mocks.fetch.mockResolvedValueOnce(response(200, {
      ok: true,
      data: { guardianId, contacts: { email: null, phone: null } },
    })).mockResolvedValueOnce(response(200, {
      ok: true,
      data: { guardianId, givenName: "Ana", familyName: "López", updatedAt: "2026-10-25T09:30:00.123456Z" },
    }));
    render(<OwnerGuardianContactsEditor
      organizationId={organizationId}
      locationId={locationId}
      guardianId={guardianId}
      displayName="Ana López"
      onPendingChange={onPendingChange}
      onClose={() => undefined}
    />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo verificar el marcador");
    expect(screen.getByRole("button", { name: "Perfil abierto" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar perfil" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar contactos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar correo" })).toBeDisabled();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);
    expect(window.sessionStorage.getItem(storageKey)).toBe(invalidMarker);
    expect(onPendingChange).toHaveBeenLastCalledWith(`${organizationId}:${locationId}:${guardianId}`, true);
  });
});
