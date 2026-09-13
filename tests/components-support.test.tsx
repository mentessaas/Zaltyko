/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMock = vi.hoisted(() => ({
  pushToast: vi.fn(),
}));

vi.mock("@/components/ui/toast-provider", () => ({
  useToast: () => toastMock,
}));

import { TicketResponseForm } from "@/components/support/TicketResponse";

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
});
