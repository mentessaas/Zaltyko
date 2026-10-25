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
  pushToast.mockReset();
  searchParams.delete("error");
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
  AuthPageShell: ({
    children,
    description,
  }: {
    children: React.ReactNode;
    description: string;
  }) => (
    <main>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock("@/utils/seo", () => ({ default: () => null }));

import LoginForm from "@/components/login-form";

describe("enlace de recuperación en el login activo", () => {
  it("enfoca el alta que viene del CTA de academia en el rol owner", () => {
    render(<RegisterForm ownerEntry />);

    expect(screen.getByText("Cuenta de dirección de academia")).toBeVisible();
    expect(
      screen.getByText(
        "Primero crearás tu cuenta personal; después, configurarás tu academia."
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("radiogroup", { name: "Tipo de cuenta" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre completo")).toBeVisible();
    expect(screen.getByLabelText("Correo electrónico")).toBeVisible();
    expect(screen.getByLabelText("Contraseña")).toBeVisible();
  });

  it("permite consultar academias públicas antes del alta aunque el catálogo externo siga apagado", () => {
    render(<RegisterForm />);

    expect(
      screen.getByRole("link", {
        name: "Buscar academias públicas",
      })
    ).toHaveAttribute("href", "/academias");
    expect(
      screen.getByText(/Solo aparecen fichas públicas/)
    ).toBeVisible();
    expect(
      screen.queryByText(/solicitar su reclamación gratuita/)
    ).not.toBeInTheDocument();
  });

  it("solo anuncia reclamación cuando catálogo y reclamaciones están habilitados", () => {
    render(
      <RegisterForm
        directoryDiscoveryEnabled
        directoryClaimsEnabled
      />
    );

    expect(screen.getByText(/solicitar su reclamación gratuita/)).toBeVisible();
  });

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

  it("no permite editar ni enviar el alta antes de hidratar y habilita los campos después", () => {
    const markup = renderToString(
      <RegisterForm ownerEntry ownerConsentPolicyVersion="v1-2026-08-01" />
    );
    const document = new DOMParser().parseFromString(markup, "text/html");
    for (const name of ["fullName", "email", "password", "termsAccepted"]) {
      expect(document.querySelector(`[name="${name}"]`)).toHaveAttribute("disabled");
    }
    expect(document.querySelector('button[type="submit"]')).toHaveAttribute("disabled");

    render(<RegisterForm ownerEntry ownerConsentPolicyVersion="v1-2026-08-01" />);
    expect(screen.getByLabelText("Nombre completo")).toBeEnabled();
    expect(screen.getByLabelText("Correo electrónico")).toBeEnabled();
    expect(screen.getByLabelText("Contraseña")).toBeEnabled();
    expect(screen.getByRole("checkbox")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Crear cuenta", exact: true })).toBeEnabled();
  });

  it("explica y habilita Google solo después de aceptar los términos", async () => {
    const user = userEvent.setup();
    render(<RegisterForm ownerConsentPolicyVersion="v1-2026-08-01" />);

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
    render(<RegisterForm ownerConsentPolicyVersion="v1-2026-08-01" />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: "Crear cuenta con Google" }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({ scopes: "openid email profile" }),
      })
    ));
    const options = signInWithOAuth.mock.calls[0][0].options;
    const callbackUrl = new URL(options.redirectTo);
    expect(callbackUrl.pathname).toBe("/auth/callback");
    expect(callbackUrl.searchParams.get("legal_consent_version")).toBe(
      "v1-2026-08-01"
    );
    expect(callbackUrl.searchParams.get("legal_consent_proof")).toBe(
      "signup:register-form-v1"
    );
    expect(callbackUrl.searchParams.get("next")).toContain(
      "/auth/redirect?initial_role=owner"
    );
  });

  it("muestra los errores de consentimiento al volver del callback OAuth", async () => {
    searchParams.set("error", "consent_invalid");
    render(<LoginForm />);

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "No pudimos confirmar tu aceptación",
          variant: "error",
        })
      );
    });
    searchParams.delete("error");
  });

  it("informa cuando la cuenta no tiene acceso activo", async () => {
    searchParams.set("error", "access_disabled");
    render(<LoginForm />);

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Esta cuenta no tiene acceso activo",
          variant: "error",
        })
      );
    });
    searchParams.delete("error");
  });
});
