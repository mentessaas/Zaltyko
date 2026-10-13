// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/RegisterForm";

const routerPush = vi.hoisted(() => vi.fn());
const pushToast = vi.hoisted(() => vi.fn());
const signUp = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp } }),
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
  it("muestra resultado incierto y evita un segundo alta automático o manual", async () => {
    const user = userEvent.setup();
    signUp.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<RegisterForm ownerEntry />);
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

  it("envía a la recuperación de perfil si falla la petición tras confirmar la sesión", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValueOnce({
      data: {
        user: { id: "synthetic-user" },
        session: { user: { id: "synthetic-user" } },
      },
      error: null,
    });
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<RegisterForm ownerEntry />);
    await completeOwnerRegistration(user);

    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/auth/login?profile_setup=retry")
    );
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Cuenta creada; configuración pendiente",
        variant: "warning",
        persistent: true,
      })
    );
    expect(pushToast.mock.calls.flat().join(" ")).not.toContain(
      "Failed to fetch"
    );
  });

  it("no llama a Supabase si falta la aceptación de términos", async () => {
    const user = userEvent.setup();
    render(<RegisterForm ownerEntry />);
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
