// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh }),
}));

import { OwnerFamiliesDirectory } from "@/components/owner-dashboard/OwnerFamiliesDirectory";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.refresh.mockClear();
});

const baseProps = {
  organizationId: "80000000-0000-4000-8000-000000000001",
  organizationName: "Academia sintética",
  locations: [
    { id: "80000000-0000-4000-8000-000000000002", name: "Sede centro" },
    { id: "80000000-0000-4000-8000-000000000003", name: "Sede norte" },
  ],
  selectedLocationId: "80000000-0000-4000-8000-000000000002",
};

describe("directorio Owner de familias", () => {
  it("muestra gimnastas y responsables de la sede sin exponer otras academias", () => {
    render(
      <OwnerFamiliesDirectory
        {...baseProps}
        canManageBilling
        families={[
          {
            familyId: "80000000-0000-4000-8000-000000000004",
            athletes: [
              {
                athleteId: "80000000-0000-4000-8000-000000000005",
                athleteName: "Gimnasta sintética",
              },
            ],
            payers: [
              {
                familyPayerId: "80000000-0000-4000-8000-000000000006",
                givenName: "Responsable",
                familyName: "sintético",
                profileVersion: "2026-10-25T06:00:00.000000Z",
                displayName: "Responsable sintético",
                isPrimary: true,
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Familias de la sede" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Gimnasta sintética" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Gimnasta sintética", { selector: "li" })
    ).toHaveLength(1);
    expect(screen.getByText("Responsable sintético")).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vincular familias y responsables desde cuotas" })
    ).toHaveAttribute(
      "href",
      "/owner/monthly-invoices?organizationId=80000000-0000-4000-8000-000000000001&locationId=80000000-0000-4000-8000-000000000002"
    );
    expect(
      screen.getByRole("link", {
        name: "Abrir facturación de Gimnasta sintética",
      })
    ).toHaveAttribute(
      "href",
      "/owner/monthly-invoices?organizationId=80000000-0000-4000-8000-000000000001&locationId=80000000-0000-4000-8000-000000000002&familyId=80000000-0000-4000-8000-000000000004"
    );
  });

  it("explica el estado vacío sin invitar a crear cuentas ni enviar correo", () => {
    render(
      <OwnerFamiliesDirectory
        {...baseProps}
        canManageBilling={false}
        families={[]}
      />
    );

    expect(
      screen.getByRole("heading", {
        name: "Todavía no hay familias vinculadas en esta sede",
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/No se crean cuentas familiares ni se envían correos/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Vincular familias y responsables desde cuotas" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Abrir facturación de/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver inscripciones" })).toHaveAttribute(
      "href",
      "/owner/enrollments?organizationId=80000000-0000-4000-8000-000000000001&locationId=80000000-0000-4000-8000-000000000002"
    );
  });

  it("busca por gimnasta o responsable sin distinguir mayúsculas ni tildes", () => {
    render(
      <OwnerFamiliesDirectory
        {...baseProps}
        canManageBilling
        families={[
          {
            familyId: "80000000-0000-4000-8000-000000000004",
            athletes: [
              {
                athleteId: "80000000-0000-4000-8000-000000000005",
                athleteName: "Gimnasta Álvarez",
              },
            ],
            payers: [
              {
                familyPayerId: "80000000-0000-4000-8000-000000000006",
                givenName: "José",
                familyName: "Pérez",
                profileVersion: "2026-10-25T06:00:00.000000Z",
                displayName: "José Pérez",
                isPrimary: true,
              },
            ],
          },
          {
            familyId: "80000000-0000-4000-8000-000000000007",
            athletes: [
              {
                athleteId: "80000000-0000-4000-8000-000000000008",
                athleteName: "Otra gimnasta",
              },
            ],
            payers: [],
          },
        ]}
      />
    );

    const search = screen.getByRole("searchbox", {
      name: "Buscar gimnasta o responsable",
    });
    fireEvent.change(search, { target: { value: "jose perez" } });

    expect(screen.getByText("José Pérez")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Editar responsable José Pérez" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Otra gimnasta")).not.toBeInTheDocument();
    expect(screen.getByText("1 de 2 familias")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "sin coincidencia" } });
    expect(
      screen.getByRole("heading", { name: "No hay familias que coincidan" })
    ).toBeInTheDocument();
  });

  it("permite abrir y cancelar la edición del nombre sin ofrecer cambios de contacto", () => {
    render(
      <OwnerFamiliesDirectory
        {...baseProps}
        canManageBilling
        families={[
          {
            familyId: "80000000-0000-4000-8000-000000000004",
            athletes: [],
            payers: [
              {
                familyPayerId: "80000000-0000-4000-8000-000000000006",
                givenName: "José",
                familyName: "Pérez",
                profileVersion: "2026-10-25T06:00:00.000000Z",
                displayName: "José Pérez",
                isPrimary: true,
              },
            ],
          },
        ]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Editar responsable José Pérez" })
    );
    expect(
      screen.getByRole("form", { name: "Editar datos del responsable" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("José");
    expect(screen.getByLabelText("Apellidos")).toHaveValue("Pérez");
    expect(screen.queryByLabelText(/correo|teléfono/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("form", { name: "Editar datos del responsable" })
    ).not.toBeInTheDocument();
  });

  it("envía solo el nombre versionado del responsable y actualiza el directorio", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { replayed: false } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "40000000-0000-4000-8000-000000000001"
    );

    render(
      <OwnerFamiliesDirectory
        {...baseProps}
        canManageBilling
        families={[
          {
            familyId: "80000000-0000-4000-8000-000000000004",
            athletes: [],
            payers: [
              {
                familyPayerId: "80000000-0000-4000-8000-000000000006",
                givenName: "José",
                familyName: "Pérez",
                profileVersion: "2026-10-25T06:00:00.000000Z",
                displayName: "José Pérez",
                isPrimary: true,
              },
            ],
          },
        ]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Editar responsable José Pérez" })
    );
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Josefina" },
    });
    fireEvent.change(screen.getByLabelText("Apellidos"), {
      target: { value: "Pérez López" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/owner/families/payers/80000000-0000-4000-8000-000000000006",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "idempotency-key":
            "family-payer-40000000-0000-4000-8000-000000000001",
        }),
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toEqual({
      organizationId: baseProps.organizationId,
      locationId: baseProps.selectedLocationId,
      expectedProfileVersion: "2026-10-25T06:00:00.000000Z",
      givenName: "Josefina",
      familyName: "Pérez López",
    });
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Responsable actualizado."
    );
  });
});
