/**
 * ZAL-160 [GTM-DEP.4] — cobertura del gate de consent para `page_view`.
 *
 * Cubre la matriz: cada estado de consent × cada combinación UTM.
 *
 *   consent \ UTM     | sin UTM        | con UTM en sessionStorage
 *   ------------------+----------------+------------------------------
 *   unset (default)   | descarta       | descarta
 *   granted           | emite          | emite + adjunta UTMs
 *   revoked           | descarta       | descarta
 *
 * También cubre: cambio de consent en caliente (grant post-mount re-trackea;
 * revoke no emite nada nuevo), SSR-safe, y persistencia por versión de clave.
 *
 * Estrategia: mockeamos `posthog-js` via `vi.mock("@/lib/analytics")` para
 * que `trackPageView` no necesite la red real ni cargue el módulo dinámico.
 * Los UTMs se inyectan via `vi.mock("@/lib/gtm/utm")` con un stub que
 * devuelve lo que el test configure (presente o ausente).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (deben ir antes de importar los módulos bajo test) --------------

const posthogCapture = vi.fn();
const posthogInit = vi.fn();
const posthogDebug = vi.fn();

vi.mock("posthog-js", () => {
  const posthog = {
    init: (...args: unknown[]) => posthogInit(...args),
    capture: (...args: unknown[]) => posthogCapture(...args),
    debug: (...args: unknown[]) => posthogDebug(...args),
  };
  return {
    default: posthog,
    posthog,
  };
});

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    getOptionalEnvVar: (key: string) =>
      key === "NEXT_PUBLIC_DISABLE_ANALYTICS" ? "false" : undefined,
    isProduction: () => false,
  };
});

const utmReadStub = vi.fn<[], Record<string, string> | null>(() => null);
vi.mock("@/lib/gtm/utm", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/gtm/utm")>("@/lib/gtm/utm");
  return {
    ...actual,
    readStoredUtm: (..._args: unknown[]) => utmReadStub(),
  };
});

import {
  getConsentSnapshot,
  hasAnalyticsConsent,
  subscribeConsent,
} from "@/lib/consent/state";
import { writeConsent } from "@/lib/consent/store";
import { initAnalytics, trackPageView } from "@/lib/analytics";

function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    key(index) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

function stubBrowserEnvironment(): void {
  const storage = makeMemoryStorage();
  vi.stubGlobal("window", {
    localStorage: storage,
    sessionStorage: storage,
    location: { pathname: "/", search: "" },
  });
}

beforeEach(async () => {
  posthogCapture.mockReset();
  posthogInit.mockReset();
  posthogDebug.mockReset();
  utmReadStub.mockReset();
  utmReadStub.mockReturnValue(null);

  // Reset consent a "unset" antes de cada test (purga localStorage).
  writeConsent("unset");

  // Asegura un entorno browser con storage vacío.
  stubBrowserEnvironment();
  // Limpia explícitamente la clave de consent.
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consent snapshot — default deny", () => {
  it("'unset' es el estado inicial (default-deny)", () => {
    expect(getConsentSnapshot().value).toBe("unset");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("'revoked' sigue siendo deny", () => {
    writeConsent("revoked");
    expect(getConsentSnapshot().value).toBe("revoked");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("'granted' es el único estado que permite tracking", () => {
    writeConsent("granted");
    expect(getConsentSnapshot().value).toBe("granted");
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it("'unset' en SSR-safe (sin window) — devuelve 'unset'", () => {
    vi.stubGlobal("window", undefined);
    expect(getConsentSnapshot().value).toBe("unset");
    expect(hasAnalyticsConsent()).toBe(false);
  });
});

describe("trackPageView × matriz consent × UTM", () => {
  beforeEach(async () => {
    await initAnalytics();
  });

  it("unset + sin UTM → descarta, NO llama posthog.capture", async () => {
    writeConsent("unset");
    utmReadStub.mockReturnValue(null);
    await trackPageView("/");
    expect(posthogCapture).not.toHaveBeenCalled();
  });

  it("unset + con UTM → descarta igualmente (consent es gate duro)", async () => {
    writeConsent("unset");
    utmReadStub.mockReturnValue({
      utm_source: "google_ads",
      utm_medium: "cpc",
      utm_campaign: "signup_latam",
    });
    await trackPageView("/onboarding/owner");
    expect(posthogCapture).not.toHaveBeenCalled();
  });

  it("granted + sin UTM → emite page_view sin propiedades UTM", async () => {
    writeConsent("granted");
    utmReadStub.mockReturnValue(null);
    await trackPageView("/pricing");
    expect(posthogCapture).toHaveBeenCalledTimes(1);
    expect(posthogCapture).toHaveBeenCalledWith(
      "$pageview",
      expect.objectContaining({ path: "/pricing" })
    );
    const call = posthogCapture.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("utm_source");
    expect(call).not.toHaveProperty("utm_medium");
  });

  it("granted + con UTM → emite page_view con UTMs adjuntos", async () => {
    writeConsent("granted");
    utmReadStub.mockReturnValue({
      utm_source: "google_ads",
      utm_medium: "cpc",
      utm_campaign: "signup_latam",
      utm_term: "academia",
      utm_content: "hero_v2",
      utm_landing_path: "/es/artistica",
    });
    await trackPageView("/onboarding/owner");
    expect(posthogCapture).toHaveBeenCalledTimes(1);
    expect(posthogCapture).toHaveBeenCalledWith(
      "$pageview",
      expect.objectContaining({
        path: "/onboarding/owner",
        utm_source: "google_ads",
        utm_medium: "cpc",
        utm_campaign: "signup_latam",
        utm_term: "academia",
        utm_content: "hero_v2",
        utm_landing_path: "/es/artistica",
      })
    );
  });

  it("granted + con UTM parcial → emite solo las claves presentes", async () => {
    writeConsent("granted");
    utmReadStub.mockReturnValue({
      utm_source: "meta_ads",
      // medium/campaign ausentes
    });
    await trackPageView("/pricing");
    expect(posthogCapture).toHaveBeenCalledTimes(1);
    const call = posthogCapture.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call.utm_source).toBe("meta_ads");
    expect(call).not.toHaveProperty("utm_medium");
    expect(call).not.toHaveProperty("utm_campaign");
  });

  it("revoked + sin UTM → descarta", async () => {
    writeConsent("revoked");
    utmReadStub.mockReturnValue(null);
    await trackPageView("/");
    expect(posthogCapture).not.toHaveBeenCalled();
  });

  it("revoked + con UTM → descarta (revocación apaga tracking)", async () => {
    writeConsent("revoked");
    utmReadStub.mockReturnValue({
      utm_source: "google_ads",
      utm_medium: "cpc",
    });
    await trackPageView("/pricing");
    expect(posthogCapture).not.toHaveBeenCalled();
  });
});

describe("subscribeConsent — cambio de estado en caliente", () => {
  it("dispara con el snapshot actual al suscribirse (idempotente)", () => {
    writeConsent("granted");
    const cb = vi.fn();
    subscribeConsent(cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ value: "granted" })
    );
  });

  it("grant post-mount → listener recibe el cambio", () => {
    writeConsent("unset");
    const cb = vi.fn();
    subscribeConsent(cb);
    cb.mockClear();
    writeConsent("granted");
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ value: "granted" })
    );
  });

  it("revoke post-mount → listener recibe el cambio", () => {
    writeConsent("granted");
    const cb = vi.fn();
    subscribeConsent(cb);
    cb.mockClear();
    writeConsent("revoked");
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ value: "revoked" })
    );
  });

  it("devuelve unsubscriber que detiene notificaciones", () => {
    writeConsent("unset");
    const cb = vi.fn();
    const unsubscribe = subscribeConsent(cb);
    cb.mockClear();
    unsubscribe();
    writeConsent("granted");
    expect(cb).not.toHaveBeenCalled();
  });

  it("múltiples listeners independientes reciben el mismo cambio", () => {
    writeConsent("unset");
    const cbA = vi.fn();
    const cbB = vi.fn();
    subscribeConsent(cbA);
    subscribeConsent(cbB);
    cbA.mockClear();
    cbB.mockClear();
    writeConsent("granted");
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledTimes(1);
  });
});

describe("persistencia de consent", () => {
  it("sobrevive a relectura (mismo tab)", () => {
    writeConsent("granted");
    expect(getConsentSnapshot().value).toBe("granted");
    writeConsent("revoked");
    expect(getConsentSnapshot().value).toBe("revoked");
    writeConsent("unset");
    expect(getConsentSnapshot().value).toBe("unset");
  });

  it("clave de storage versionada", () => {
    writeConsent("granted");
    expect(window.localStorage.getItem("zaltyko.consent.v1")).toBe("granted");
  });

  it("'unset' purga la clave (no deja basura)", () => {
    writeConsent("granted");
    expect(window.localStorage.getItem("zaltyko.consent.v1")).toBe("granted");
    writeConsent("unset");
    expect(window.localStorage.getItem("zaltyko.consent.v1")).toBeNull();
  });

  it("storage corrupto (valor inválido) se trata como 'unset'", () => {
    window.localStorage.setItem("zaltyko.consent.v1", "consentimiento_v2");
    expect(getConsentSnapshot().value).toBe("unset");
  });
});
