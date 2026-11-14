import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureRouterTransitionStart: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

function browser(path: string) {
  const location = new URL(path, "https://club.example.test");
  const replaceState = vi.fn((_state: unknown, _unused: string, url: string) => {
    location.href = new URL(url, location.origin).href;
  });
  vi.stubGlobal("window", { location, history: { state: null, replaceState } });
  return { location, replaceState };
}

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("credencial de la invitación al portal de familias", () => {
  it("limpia la dirección antes de consumirla, la guarda solo en memoria y la revela una vez", async () => {
    const token = "a".repeat(43);
    const page = browser(`/familia/aceptar?utm=x#token=${token}`);
    const helper = await import("@/lib/auth/family-invitation-fragment");
    expect(helper.captureFamilyInvitationFragment()).toBe(true);
    expect(page.location.href).toBe("https://club.example.test/familia/aceptar");
    expect(page.replaceState).toHaveBeenCalledWith(null, "", "/familia/aceptar");
    expect(helper.takeFamilyInvitationToken()).toBe(token);
    expect(helper.takeFamilyInvitationToken()).toBeNull();
  });

  it.each(["#token=short", `#token=${"a".repeat(43)}&token=${"b".repeat(43)}`, `#token=${"a".repeat(43)}&next=/owner`])(
    "limpia fragmentos mal formados o ambiguos sin aceptarlos: %s", async (fragment) => {
      const page = browser(`/familia/aceptar${fragment}`);
      const helper = await import("@/lib/auth/family-invitation-fragment");
      helper.captureFamilyInvitationFragment();
      expect(page.location.hash).toBe("");
      expect(helper.takeFamilyInvitationToken()).toBeNull();
    }
  );

  it("falla cerrado si no puede limpiar el historial", async () => {
    const page = browser(`/familia/aceptar#token=${"a".repeat(43)}`);
    page.replaceState.mockImplementation(() => { throw new Error("history unavailable"); });
    const helper = await import("@/lib/auth/family-invitation-fragment");
    expect(helper.captureFamilyInvitationFragment()).toBe(true);
    expect(helper.takeFamilyInvitationToken()).toBeNull();
  });

  it("no toca otras rutas ni interpreta sus fragmentos", async () => {
    const page = browser("/familia#cuotas");
    const helper = await import("@/lib/auth/family-invitation-fragment");
    expect(helper.captureFamilyInvitationFragment()).toBe(false);
    expect(page.replaceState).not.toHaveBeenCalled();
    expect(helper.takeFamilyInvitationToken()).toBeNull();
  });

  it("no inicia Sentry en la página de aceptación y no reenvía su navegación", async () => {
    const page = browser("/familia/aceptar#token=invalid");
    const instrumentation = await import("../instrumentation-client");
    expect(page.location.hash).toBe("");
    expect(sentry.init).not.toHaveBeenCalled();
    instrumentation.onRouterTransitionStart("/familia/aceptar", "push");
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
  });

  it("descarta la credencial al navegar fuera aunque la página no la consumiera", async () => {
    const page = browser(`/familia/aceptar#token=${"a".repeat(43)}`);
    const instrumentation = await import("../instrumentation-client");
    instrumentation.onRouterTransitionStart("/familia", "push");
    page.location.href = "https://club.example.test/familia/aceptar";
    const helper = await import("@/lib/auth/family-invitation-fragment");
    helper.captureFamilyInvitationFragment();
    expect(helper.takeFamilyInvitationToken()).toBeNull();
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
  });

  it("conserva Sentry en el resto y limpia una aceptación a la que se llega navegando", async () => {
    const page = browser("/familia");
    const instrumentation = await import("../instrumentation-client");
    expect(sentry.init).toHaveBeenCalledTimes(1);
    page.location.href = `https://club.example.test/familia/aceptar#token=${"b".repeat(43)}`;
    instrumentation.onRouterTransitionStart("/familia/aceptar", "push");
    expect(page.location.hash).toBe("");
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
    const helper = await import("@/lib/auth/family-invitation-fragment");
    expect(helper.takeFamilyInvitationToken()).toBe("b".repeat(43));
  });
});
