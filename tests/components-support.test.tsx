/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMock = vi.hoisted(() => ({
  pushToast: vi.fn(),
}));
const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("@/components/ui/toast-provider", () => ({
  useToast: () => toastMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { TicketResponseForm } from "@/components/support/TicketResponse";
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

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
