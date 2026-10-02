// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { RegisterForm } from "@/components/RegisterForm";
import { describe, expect, it, vi } from "vitest";

const searchParams = vi.hoisted(
  () => new URLSearchParams("next=%2Fapp%2Facademy-1%2Fdashboard")
);
const routerPush = vi.hoisted(() => vi.fn());
const pushToast = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: {} }),
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
      expect(screen.getByRole("button", { name: "Crear cuenta con Google" })).toHaveAttribute(
        "aria-busy",
        "false"
      );
    });
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
});
