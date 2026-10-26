// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/RegisterForm";

const routerPush = vi.hoisted(() => vi.fn());
const pushToast = vi.hoisted(() => vi.fn());
const signUp = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());
const ownerConsentPolicyVersion = "v1-2026-08-01";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp, getUser } }),
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

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/google-ads", () => ({
  trackGoogleAdsConversion: vi.fn(),
}));

vi.mock("@/lib/security/pwned-password", () => ({
  checkPwnedPassword: vi.fn().mockResolvedValue({ pwned: false }),
  PWNED_PASSWORD_MESSAGE: "Contraseña no disponible",
}));

vi.mock("@/lib/auth/use-hydrated", () => ({ useHydrated: () => true }));

beforeEach(() => {
  routerPush.mockReset();
  pushToast.mockReset();
  signUp.mockReset();
  getUser.mockReset();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function completeOwnerRegistration(
  user: ReturnType<typeof userEvent.setup>,
  acceptTerms = true
) {
  await user.type(
    screen.getByLabelText("Nombre completo"),
    "Persona sintética"
  );
  await user.type(
    screen.getByLabelText("Correo electrónico"),
    "owner@example.test"
  );
  await user.type(screen.getByLabelText("Contraseña"), "synthetic-password");
  if (acceptTerms) await user.click(screen.getByRole("checkbox"));
}

describe("registro Owner ante fallos de red", () => {
  it("un next del directorio no cambia el alta Owner ni omite su consentimiento", async () => {
    const previousUrl = window.location.href;
    window.history.replaceState({}, "", "/auth/register?next=%2Facademias%2Fqa");
    try {
      const user = userEvent.setup();
      signUp.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      render(<RegisterForm ownerEntry ownerConsentPolicyVersion={ownerConsentPolicyVersion} />);
      await completeOwnerRegistration(user);
      await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
      await waitFor(() => expect(signUp).toHaveBeenCalledOnce());
      expect(signUp.mock.calls[0][0].options).toMatchObject({
        data: {
          initial_role: "owner",
          directory_account: false,
          legal_consent_version: ownerConsentPolicyVersion,
          legal_consent_proof: "signup:register-form-v1",
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fauth%2Fredirect`,
      });
      expect(screen.queryByRole("radio", { name: /Proveedor/ })).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, "", previousUrl);
    }
  });

  it("muestra resultado incierto y evita un segundo alta automático o manual", async () => {
    const user = userEvent.setup();
    signUp.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<RegisterForm ownerEntry ownerConsentPolicyVersion={ownerConsentPolicyVersion} />);
    await completeOwnerRegistration(user);

    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No podemos confirmar si tu cuenta se creó. No repitas el alta todavía."
    );
    expect(
      screen.getByRole("link", { name: "Iniciar sesión" })
    ).toHaveAttribute("href", "/auth/login");
    expect(
      screen.getByRole("link", { name: "Recuperar contraseña" })
    ).toHaveAttribute("href", "/auth/forgot-password");
    expect(
      screen.getByRole("button", { name: "Alta pendiente de confirmar" })
    ).toBeDisabled();
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(alert).not.toHaveTextContent("Failed to fetch");
  });

  it("continúa Owner al setup canónico sin crear un perfil global legacy", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValueOnce({
      data: {
        user: { id: "synthetic-user" },
        session: { user: { id: "synthetic-user" } },
      },
      error: null,
    });
    getUser.mockResolvedValueOnce({
      data: { user: { id: "synthetic-user" } },
      error: null,
    });
    render(<RegisterForm ownerEntry ownerConsentPolicyVersion={ownerConsentPolicyVersion} />);
    await completeOwnerRegistration(user);

    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/owner/setup")
    );
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(signUp.mock.calls[0][0].options.data).toMatchObject({
      initial_role: "owner",
      legal_consent_version: expect.any(String),
      legal_consent_proof: expect.any(String),
    });
  });

  it("mantiene el POST de perfil existente para otros roles", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValueOnce({
      data: {
        user: { id: "synthetic-user" },
        session: { user: { id: "synthetic-user" } },
      },
      error: null,
    });
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<RegisterForm ownerConsentPolicyVersion={ownerConsentPolicyVersion} />);
    await user.click(screen.getByRole("radio", { name: /Entrenador/ }));
    await completeOwnerRegistration(user);

    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Persona sintética",
          role: "coach",
        }),
      })
    );
    expect(routerPush).toHaveBeenCalledWith("/onboarding/coach");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("no llama al perfil legacy si no se puede verificar la sesión Owner", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValueOnce({
      data: {
        user: { id: "synthetic-user" },
        session: { user: { id: "synthetic-user" } },
      },
      error: null,
    });
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "session unavailable" },
    });
    render(<RegisterForm ownerEntry ownerConsentPolicyVersion={ownerConsentPolicyVersion} />);
    await completeOwnerRegistration(user);

    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/auth/login?profile_setup=retry")
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(signUp).toHaveBeenCalledOnce();
  });

  it("conserva el resultado incierto y no permite repetir el alta", async () => {
    const user = userEvent.setup();
    signUp.mockRejectedValueOnce(new TypeError("network dropped"));
    render(<RegisterForm ownerEntry ownerConsentPolicyVersion={ownerConsentPolicyVersion} />);
    await completeOwnerRegistration(user);

    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No podemos confirmar si tu cuenta se creó"
    );
    expect(signUp).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Alta pendiente de confirmar" })
    ).toBeDisabled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no llama a Supabase si falta la aceptación de términos", async () => {
    const user = userEvent.setup();
    render(<RegisterForm ownerEntry ownerConsentPolicyVersion={ownerConsentPolicyVersion} />);
    await completeOwnerRegistration(user, false);

    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(signUp).not.toHaveBeenCalled();
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Aceptación necesaria",
        variant: "error",
      })
    );
  });
});
