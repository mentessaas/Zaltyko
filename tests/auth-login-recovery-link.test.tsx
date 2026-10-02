// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
  it("muestra el enlace y conserva solo el destino interno seguro", () => {
    render(<LoginForm />);

    expect(
      screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" })
    ).toHaveAttribute(
      "href",
      "/auth/forgot-password?next=%2Fapp%2Facademy-1%2Fdashboard"
    );
  });
});
