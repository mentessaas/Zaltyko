// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/login-form";

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());
const routerRefresh = vi.hoisted(() => vi.fn());
const pushToast = vi.hoisted(() => vi.fn());
const signInWithPassword = vi.hoisted(() => vi.fn());
const signInWithOtp = vi.hoisted(() => vi.fn());
const signInWithOAuth = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => new URLSearchParams());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
    refresh: routerRefresh,
  }),
  useSearchParams: () => searchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword, signInWithOtp, signInWithOAuth, getUser },
  }),
}));

vi.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ pushToast }),
}));

vi.mock("@/components/auth/AuthPageShell", () => ({
  AuthPageShell: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <main>
      {children}
      <footer>{footer}</footer>
    </main>
  ),
}));

vi.mock("@/lib/auth/use-hydrated", () => ({ useHydrated: () => true }));

beforeEach(() => {
  routerPush.mockReset();
  routerReplace.mockReset();
  routerRefresh.mockReset();
  pushToast.mockReset();
  signInWithPassword.mockReset();
  signInWithOtp.mockReset();
  signInWithOAuth.mockReset();
  getUser.mockReset();
  mockFetch.mockReset();
  searchParams.delete("next");
  searchParams.delete("callbackUrl");
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function enterCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Correo electrónico"),
    "owner@example.test"
  );
  await user.type(screen.getByLabelText("Contraseña"), "synthetic-password");
}

describe("recuperación Owner explícita desde el login activo", () => {
  it("solo después de confirmar y verificar la sesión continúa a Owner setup, sin POST de perfil", async () => {
    const user = userEvent.setup();
    getUser.mockResolvedValue({
      data: { user: { id: "synthetic-user" } },
      error: null,
    });
    render(<LoginForm profileSetupRetry sessionAvailableForRecovery />);

    expect(
      screen.getByRole("button", { name: "Continuar con la configuración" })
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Crea una cuenta" })
    ).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Continuar con la configuración" })
    );

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/owner/setup")
    );
    expect(getUser).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("muestra un error de red al verificar la sesión y permite reintentar sin crear perfil", async () => {
    const user = userEvent.setup();
    getUser.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<LoginForm profileSetupRetry sessionAvailableForRecovery />);

    await user.click(
      screen.getByRole("button", { name: "Continuar con la configuración" })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("problema de conexión");
    expect(alert).not.toHaveTextContent("Failed to fetch");
    expect(
      screen.getByRole("button", { name: "Continuar con la configuración" })
    ).toBeEnabled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();

    getUser.mockResolvedValueOnce({
      data: { user: { id: "synthetic-user" } },
      error: null,
    });
    await user.click(
      screen.getByRole("button", { name: "Continuar con la configuración" })
    );

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/owner/setup")
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no continúa si la sesión deja de ser válida y ofrece iniciar sesión de nuevo", async () => {
    const user = userEvent.setup();
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "expired" },
    });
    render(<LoginForm profileSetupRetry sessionAvailableForRecovery />);

    await user.click(
      screen.getByRole("button", { name: "Continuar con la configuración" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu sesión ha caducado"
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Correo electrónico")).toBeVisible();
  });

  it("verifica la autenticación después del login sin recuperar automáticamente", async () => {
    const user = userEvent.setup();
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "synthetic-user" } },
      error: null,
    });
    getUser.mockResolvedValue({
      data: { user: { id: "synthetic-user" } },
      error: null,
    });
    render(<LoginForm profileSetupRetry />);
    await enterCredentials(user);

    await user.click(
      screen.getByRole("button", {
        name: "Iniciar sesión para recuperar el perfil",
      })
    );

    expect(
      await screen.findByRole("button", {
        name: "Continuar con la configuración",
      })
    ).toBeVisible();
    expect(getUser).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("no presenta confirmación ni hace POST si el login no funciona y restaura el botón", async () => {
    const user = userEvent.setup();
    signInWithPassword.mockRejectedValueOnce(new TypeError("network failure"));
    render(<LoginForm profileSetupRetry />);
    await enterCredentials(user);

    await user.click(
      screen.getByRole("button", {
        name: "Iniciar sesión para recuperar el perfil",
      })
    );

    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description:
            "Ha ocurrido un problema de conexión. Inténtalo de nuevo.",
          variant: "error",
        })
      )
    );
    expect(
      screen.getByRole("button", {
        name: "Iniciar sesión para recuperar el perfil",
      })
    ).toBeEnabled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("mantiene el enlace mágico en recuperación y vuelve a pedir confirmación sin aceptar un next externo", async () => {
    searchParams.set("next", "//attacker.example");
    const user = userEvent.setup();
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm profileSetupRetry />);

    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "owner@example.test"
    );
    await user.click(
      screen.getByRole("button", { name: "Enviarme un enlace mágico" })
    );

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledOnce());
    const magicRedirect = new URL(
      signInWithOtp.mock.calls[0][0].options.emailRedirectTo
    );
    expect(magicRedirect.pathname).toBe("/auth/callback");
    expect(magicRedirect.searchParams.get("next")).toBe(
      "/auth/login?profile_setup=retry"
    );
    expect(
      screen.getByRole("button", {
        name: "Iniciar sesión para recuperar el perfil",
      })
    ).toBeVisible();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("mantiene Google en recuperación con un retorno interno fijo", async () => {
    searchParams.set("callbackUrl", "//attacker.example");
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    const user = userEvent.setup();
    render(<LoginForm profileSetupRetry />);

    await user.click(screen.getByRole("button", { name: "Entrar con Google" }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledOnce());
    const redirectTo = new URL(
      signInWithOAuth.mock.calls[0][0].options.redirectTo
    );
    expect(redirectTo.pathname).toBe("/auth/callback");
    expect(redirectTo.searchParams.get("next")).toBe(
      "/auth/login?profile_setup=retry"
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("mantiene el destino seguro en login normal y fija el destino de recuperación", async () => {
    searchParams.set("next", "//attacker.example");
    const user = userEvent.setup();
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "synthetic-user" } },
      error: null,
    });
    render(<LoginForm />);
    await enterCredentials(user);

    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/auth/redirect")
    );

    searchParams.set("next", "//attacker.example");
    getUser.mockResolvedValue({
      data: { user: { id: "synthetic-user" } },
      error: null,
    });
    render(<LoginForm profileSetupRetry sessionAvailableForRecovery />);
    await user.click(
      screen.getByRole("button", { name: "Continuar con la configuración" })
    );
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/owner/setup")
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
