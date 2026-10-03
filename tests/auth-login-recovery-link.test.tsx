// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { RegisterForm } from "@/components/RegisterForm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchParams = vi.hoisted(
  () => new URLSearchParams("next=%2Fapp%2Facademy-1%2Fdashboard")
);
const routerPush = vi.hoisted(() => vi.fn());
const pushToast = vi.hoisted(() => vi.fn());
const signInWithOAuth = vi.hoisted(() => vi.fn());

beforeEach(() => {
  signInWithOAuth.mockReset().mockResolvedValue({
    data: { url: null },
    error: { message: "test" },
  });
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}));

vi.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ pushToast }),
}));

vi.mock("@/components/auth/AuthPageShell", () => ({
  AuthPageShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("@/utils/seo", () => ({ default: () => null }));

import LoginForm from "@/components/login-form";

describe("enlace de recuperación en el login activo", () => {
  it("renderiza Google desactivado hasta que cargue la interfaz cliente", () => {
    const markup = renderToString(<LoginForm />);

    expect(markup).toContain("Preparando Google...");
    expect(markup).toContain('disabled=""');
  });

  it("mantiene también el botón de registro desactivado hasta la hidratación", () => {
    const markup = renderToString(<RegisterForm />);

    expect(markup).toContain("Preparando Google...");
    expect(markup).toContain('aria-busy="true"');
  });

  it("retira el estado de preparación después de hidratar el registro", async () => {
    render(<RegisterForm />);

    await waitFor(() => {
      const button = screen.getByRole("button", {
        name: "Crear cuenta con Google",
      });
      expect(button).toHaveAttribute("aria-busy", "false");
      expect(button).toBeDisabled();
    });
  });

  it("explica y habilita Google solo después de aceptar los términos", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const button = await screen.findByRole("button", {
      name: "Crear cuenta con Google",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "aria-describedby",
      "google-signup-consent-hint"
    );
    expect(
      screen.getByText(
        "Para continuar con Google, acepta primero los términos y la política de privacidad."
      )
    ).toBeVisible();

    await user.click(screen.getByRole("checkbox"));

    expect(button).toBeEnabled();
    expect(
      screen.queryByText(
        "Para continuar con Google, acepta primero los términos y la política de privacidad."
      )
    ).not.toBeInTheDocument();
  });

  it("activa Google tras hidratar y conserva el destino seguro del enlace de recuperación", async () => {
    render(<LoginForm />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Entrar con Google" })).toBeEnabled();
    });
    expect(
      screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" })
    ).toHaveAttribute(
      "href",
      "/auth/forgot-password?next=%2Fapp%2Facademy-1%2Fdashboard"
    );
  });

  it("solicita a Google identidad, correo y perfil al iniciar sesión", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const button = await screen.findByRole("button", { name: "Entrar con Google" });
    await user.click(button);

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({ scopes: "openid email profile" }),
      })
    ));
  });

  it("solicita los scopes básicos de identidad al crear cuenta con Google", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: "Crear cuenta con Google" }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({ scopes: "openid email profile" }),
      })
    ));
  });
});
