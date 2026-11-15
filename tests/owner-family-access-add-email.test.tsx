// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import {
  OwnerFamilyAccessManager,
  type OwnerFamilyAccessGuardian,
} from "@/components/owner-dashboard/OwnerFamilyAccessManager";

const organizationId = "52000000-0000-4000-8000-000000000001";
const pageLocationId = "52000000-0000-4000-8000-000000000002";
const athleteLocationId = "52000000-0000-4000-8000-000000000003";
const guardianId = "52000000-0000-4000-8000-000000000004";
const contactId = "52000000-0000-4000-8000-000000000005";

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function guardianWithoutEmail(overrides: Partial<OwnerFamilyAccessGuardian> = {}): OwnerFamilyAccessGuardian {
  return {
    guardianId,
    name: "Marta Sintética",
    email: null,
    athletes: ["Ana Sintética"],
    status: "not_invited",
    actions: { invite: false, resend: false, revoke: false, removeAccess: false },
    invitation: null,
    linkedSince: null,
    canViewAthletes: false,
    contactLocationId: athleteLocationId,
    ...overrides,
  };
}

const emptyContacts = { ok: true, data: { guardianId, contacts: { email: null, phone: null } } };
const savedContacts = {
  ok: true,
  data: {
    guardianId,
    contacts: {
      email: { contactId, value: "marta@example.test", verifiedAt: null, updatedAt: "2026-11-15T10:00:00.000Z" },
      phone: null,
    },
    replayed: false,
  },
};

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.refresh.mockReset();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", { randomUUID: () => "52000000-0000-4000-8000-000000000099" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("añadir el correo del tutor desde Familias y avisos", () => {
  it("guarda el correo junto al tutor y muestra «Invitar al portal» sin recargar", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(200, emptyContacts))
      .mockResolvedValueOnce(response(200, savedContacts));
    const user = userEvent.setup();
    render(
      <OwnerFamilyAccessManager
        organizationId={organizationId}
        locationId={pageLocationId}
        guardians={[guardianWithoutEmail()]}
        truncated={false}
      />
    );

    expect(screen.getByText(/1 tutor no tiene correo principal\. Pulsa «Añadir correo»/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Invitar al portal" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Añadir correo de Marta Sintética" }));

    // Misma API y misma comprobación por sede que en Grupos: la sede de la gimnasta.
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    expect(mocks.fetch.mock.calls[0][0]).toBe(
      `/api/v1/owner/guardians/${guardianId}/contacts?organizationId=${organizationId}&locationId=${athleteLocationId}`
    );
    const input = await screen.findByLabelText("Correo electrónico");
    await user.type(input, "Marta@Example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));

    expect(await screen.findByRole("button", { name: "Invitar al portal" })).toBeEnabled();
    const [endpoint, init] = mocks.fetch.mock.calls[1] as [string, RequestInit];
    expect(endpoint).toBe(`/api/v1/owner/guardians/${guardianId}/contacts`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      organizationId,
      locationId: athleteLocationId,
      kind: "email",
      expectedContactId: null,
      expectedValue: null,
      expectedUpdatedAt: null,
      value: "marta@example.test",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Correo guardado. Ya puedes invitar a Marta Sintética al portal.");
    expect(screen.getByText(/marta@example\.test/)).toBeVisible();
    expect(screen.queryByText(/no tiene correo principal/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Contactos de Marta Sintética" })).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Invitar al portal" }));
    const confirm = screen.getByRole("group", { name: "Confirmar invitación de Marta Sintética" });
    expect(within(confirm).getByText("marta@example.test")).toBeVisible();
  });

  it("si la gimnasta no está en ningún grupo ni clase, explica qué falta en vez de ofrecer el correo", () => {
    render(
      <OwnerFamilyAccessManager
        organizationId={organizationId}
        locationId={pageLocationId}
        guardians={[guardianWithoutEmail({ contactLocationId: null })]}
        truncated={false}
      />
    );
    expect(screen.queryByRole("button", { name: /Añadir correo/ })).not.toBeInTheDocument();
    expect(screen.getByText("Para añadir su correo, su gimnasta tiene que estar en un grupo o apuntada a una clase.")).toBeVisible();
  });

  it("con las invitaciones apagadas no ofrece añadir correos", () => {
    render(
      <OwnerFamilyAccessManager
        organizationId={organizationId}
        locationId={pageLocationId}
        guardians={[guardianWithoutEmail()]}
        truncated={false}
        removeOnly
      />
    );
    expect(screen.queryByRole("button", { name: /Añadir correo/ })).not.toBeInTheDocument();
  });

  it("si el servidor no confirma el guardado, no aparece «Invitar al portal»", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(200, emptyContacts))
      .mockResolvedValueOnce(response(503, { detail: "Servicio no disponible" }));
    const user = userEvent.setup();
    render(
      <OwnerFamilyAccessManager
        organizationId={organizationId}
        locationId={pageLocationId}
        guardians={[guardianWithoutEmail()]}
        truncated={false}
      />
    );
    await user.click(screen.getByRole("button", { name: "Añadir correo de Marta Sintética" }));
    await user.type(await screen.findByLabelText("Correo electrónico"), "marta@example.test");
    await user.click(screen.getByRole("button", { name: "Guardar correo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No sabemos si se guardó el contacto");
    expect(screen.queryByRole("button", { name: "Invitar al portal" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar el correo de Marta Sintética" })).toBeDisabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
