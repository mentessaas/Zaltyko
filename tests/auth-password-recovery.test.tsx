// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth }),
}));

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  auth.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  auth.updateUser.mockReset().mockResolvedValue({ error: null });
});

describe("recuperación de contraseña", () => {
  it("solicita el enlace con correo normalizado y una respuesta que no revela cuentas", async () => {
    render(<ForgotPasswordForm nextPath="/app/academy-1/dashboard" />);

    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "  OWNER@EXAMPLE.COM " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar enlace de recuperación" })
    );

    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledOnce()
    );
    const [email, options] = auth.resetPasswordForEmail.mock.calls[0];
    expect(email).toBe("owner@example.com");
    const callback = new URL(options.redirectTo);
    expect(callback.origin).toBe(window.location.origin);
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe(
      "/reset-password?next=%2Fapp%2Facademy-1%2Fdashboard"
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Si existe una cuenta con ese correo"
    );
  });

  it("no actualiza la contraseña cuando la confirmación no coincide", async () => {
    const firstCandidate = ["fixture", "value", "first", "42"].join("-");
    const secondCandidate = ["fixture", "value", "other", "84"].join("-");
    render(<ResetPasswordForm nextPath="/auth/redirect" />);

    fireEvent.change(screen.getByLabelText("Contraseña nueva"), {
      target: { value: firstCandidate },
    });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), {
      target: { value: secondCandidate },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar contraseña nueva" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Las contraseñas no coinciden"
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("actualiza la contraseña y ofrece continuar tras una respuesta correcta", async () => {
    const candidate = ["fixture", "value", "matching", "168"].join("-");
    render(<ResetPasswordForm nextPath="/auth/redirect" />);

    fireEvent.change(screen.getByLabelText("Contraseña nueva"), {
      target: { value: candidate },
    });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), {
      target: { value: candidate },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar contraseña nueva" })
    );

    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledWith({
        password: candidate,
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "La contraseña se actualizó correctamente"
    );
    expect(screen.getByRole("link", { name: "Continuar" })).toHaveAttribute(
      "href",
      "/auth/redirect"
    );
  });
});
