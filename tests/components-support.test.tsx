/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMock = vi.hoisted(() => ({
  pushToast: vi.fn(),
}));
const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/components/ui/toast-provider", () => ({
  useToast: () => toastMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
}));

import { TicketResponseForm } from "@/components/support/TicketResponse";
import { TicketFilters } from "@/components/support/TicketFilters";
import { TicketList } from "@/components/support/TicketList";
import { TicketDetail } from "@/components/support/TicketDetail";
import { TogglePublicVisibility } from "@/components/admin/TogglePublicVisibility";
import { SuperAdminCreateAcademyDialog } from "@/app/(super-admin)/super-admin/components/SuperAdminCreateAcademyDialog";
import { SuperAdminCreateUserDialog } from "@/app/(super-admin)/super-admin/components/SuperAdminCreateUserDialog";

describe("TicketResponseForm", () => {
  beforeEach(() => {
    toastMock.pushToast.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("avisa cuando se intenta enviar una respuesta vacía", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<TicketResponseForm ticketId="ticket-1" />);
    await user.click(screen.getByRole("button", { name: "Enviar respuesta" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastMock.pushToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Escribe una respuesta",
      variant: "warning",
    }));
  });

  it("expone el error del API al usuario", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: "El ticket está cerrado" }),
    }));

    render(<TicketResponseForm ticketId="ticket-1" />);
    await user.type(screen.getByPlaceholderText("Escribe tu respuesta..."), "Necesito ayuda");
    await user.click(screen.getByRole("button", { name: "Enviar respuesta" }));

    await waitFor(() => {
      expect(toastMock.pushToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "No se pudo enviar la respuesta",
        description: "El ticket está cerrado",
        variant: "error",
      }));
    });
  });

  it("actualiza visibilidad a través del endpoint super-admin", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, data: { isPublic: true, changed: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TogglePublicVisibility
        academyId="11111111-1111-4111-8111-111111111111"
        currentValue={false}
        onToggle={onToggle}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publicar academia en el directorio público" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/super-admin/academies/11111111-1111-4111-8111-111111111111/public",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(onToggle).toHaveBeenCalledWith(true);
      expect(toastMock.pushToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Visibilidad actualizada",
        variant: "success",
      }));
    });
  });

  it.each([
    ["academia", SuperAdminCreateAcademyDialog, "Crear academia + dueño", "Crear academia"],
    ["usuario", SuperAdminCreateUserDialog, "Crear usuario", "Crear"],
  ] as const)("gestiona Escape y devuelve el foco al crear %s", async (_label, Dialog, title, submitLabel) => {
    const user = userEvent.setup();
    render(<Dialog />);

    const trigger = screen.getByRole("button", { name: new RegExp(`^${submitLabel === "Crear" ? "Crear usuario" : "Crear academia"}`) });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: title })).toBeVisible();

    const dialog = screen.getByRole("dialog", { name: title });
    const focusable = dialog.querySelectorAll<HTMLElement>("button, input, select");
    focusable[focusable.length - 1]?.focus();
    await user.tab();
    expect(focusable[0]).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

describe("TicketFilters", () => {
  beforeEach(() => {
    routerMock.push.mockReset();
  });

  it("envía la búsqueda y reinicia la página", async () => {
    const user = userEvent.setup();
    render(
      <TicketFilters
        showSearch
        showStatus={false}
        showPriority={false}
        showCategory={false}
      />,
    );

    await user.type(screen.getByRole("searchbox", { name: "Buscar tickets" }), "academia demo");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(routerMock.push).toHaveBeenCalledWith("?q=academia+demo");
  });
});

describe("TicketDetail", () => {
  beforeEach(() => {
    toastMock.pushToast.mockReset();
  });

  it("actualiza el estado al instante y muestra feedback de éxito", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);

    render(
      <TicketDetail
        ticket={{
          id: "ticket-1",
          title: "No puedo acceder",
          description: "El acceso falla.",
          status: "open",
          priority: "high",
          category: "technical",
          createdAt: "2026-09-13T08:00:00.000Z",
          updatedAt: "2026-09-13T08:00:00.000Z",
          createdBy: { id: "profile-1", fullName: "Ana", email: "ana@example.com" },
          responses: [],
        }}
        currentUserId="profile-admin"
        isAdmin
        onStatusChange={onStatusChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Resolver" }));

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith("resolved");
      expect(screen.getByText("Resuelto")).toBeInTheDocument();
      expect(toastMock.pushToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Estado actualizado",
        variant: "success",
      }));
      expect(routerMock.refresh).toHaveBeenCalled();
    });
  });

  it("mantiene la fecha y hora del soporte en la zona operativa configurada", () => {
    render(
      <TicketDetail
        ticket={{
          id: "ticket-timezone",
          title: "Cambio de día",
          description: "La fecha cruza medianoche en Madrid.",
          status: "open",
          priority: "medium",
          category: "technical",
          createdAt: "2026-09-13T22:30:00.000Z",
          updatedAt: "2026-09-13T22:30:00.000Z",
          createdBy: { id: "profile-1", fullName: "Ana", email: "ana@example.com" },
          responses: [{
            id: "response-1",
            message: "Respuesta nocturna",
            isInternal: false,
            createdAt: "2026-09-13T22:30:00.000Z",
            user: { id: "profile-2", fullName: "Soporte" },
          }],
        }}
        currentUserId="profile-admin"
        timeZone="Europe/Madrid"
      />,
    );

    expect(screen.getByText("14 sept 2026")).toBeInTheDocument();
    expect(screen.getByText("14 sept 2026 a las 00:30")).toBeInTheDocument();
  });

  it("revierte el estado optimista si el servidor rechaza el cambio", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(false);

    render(
      <TicketDetail
        ticket={{
          id: "ticket-2",
          title: "Error de cobro",
          description: "El cobro no se completa.",
          status: "open",
          priority: "urgent",
          category: "billing",
          createdAt: "2026-09-13T08:00:00.000Z",
          updatedAt: "2026-09-13T08:00:00.000Z",
          createdBy: { id: "profile-2", fullName: "Luis", email: "luis@example.com" },
          responses: [],
        }}
        currentUserId="profile-admin"
        isAdmin
        onStatusChange={onStatusChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Resolver" }));

    await waitFor(() => {
      expect(screen.getByText("Abierto")).toBeInTheDocument();
      expect(toastMock.pushToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "No se pudo actualizar el ticket",
        variant: "error",
      }));
    });
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe("TicketList", () => {
  it("usa la zona operativa en el listado del panel", () => {
    render(
      <TicketList
        isAdmin
        timeZone="Europe/Madrid"
        tickets={[{
          id: "ticket-list-timezone",
          title: "Cambio de día",
          description: "Descripción",
          status: "open",
          priority: "low",
          category: "other",
          createdAt: "2026-09-13T22:30:00.000Z",
          updatedAt: "2026-09-13T22:30:00.000Z",
        }]}
      />,
    );

    expect(screen.getByText("Creado: 14 sept 2026")).toBeInTheDocument();
  });
});
