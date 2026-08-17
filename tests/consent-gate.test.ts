/**
 * @vitest-environment jsdom
 *
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
 * ZAL-247 — se suma un bloque de integración que monta `PostHogProvider` de
 * verdad (React Testing Library sobre jsdom). Los tests unitarios anteriores
 * pasaban sin detectar los 3 bugs de integración porque solo ejercitaban
 * `trackPageView` de forma aislada: el hook sin montar, la doble emisión del
 * pageview inicial y el `initAnalytics` incondicional solo son observables
 * con el provider en el árbol.
 *
 * Estrategia: mockeamos `posthog-js` para que `trackPageView` no necesite la
 * red real. Los UTMs se inyectan via `vi.mock("@/lib/gtm/utm")` con un stub
 * que devuelve lo que el test configure (presente o ausente). Los tests
 * unitarios usan un stub de `window` en memoria; los de integración liberan
 * ese stub (`vi.unstubAllGlobals`) para trabajar sobre el jsdom real, que es
 * lo que React necesita para renderizar.
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

import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";

import {
  getConsentSnapshot,
  hasAnalyticsConsent,
  subscribeConsent,
} from "@/lib/consent/state";
import { readConsent, writeConsent } from "@/lib/consent/store";
import {
  __isPostHogLoadedForTests,
  __resetAnalyticsForTests,
  initAnalytics,
  trackPageView,
} from "@/lib/analytics";
import { PostHogProvider } from "@/components/PostHogProvider";

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
  // Como el test environment es `node` (no jsdom), necesitamos un stub
  // de `window` que satisfaga el contrato mínimo que requiere el store
  // canónico de ZAL-156.2: `localStorage`, `location`, y un mecanismo
  // para suscribirse y despachar `storage` events. Usamos un
  // `EventTarget` real para los listeners — el `store.ts` invoca
  // `window.addEventListener("storage", ...)` y los tests disparan
  // eventos vía `window.dispatchEvent(...)`.
  const target = new EventTarget();
  const stub = {
    localStorage: storage,
    sessionStorage: storage,
    location: { pathname: "/", search: "" },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  vi.stubGlobal("window", stub);
}

/**
 * Simula un `StorageEvent` en entorno node (donde `StorageEvent` no
 * existe). El listener del store solo lee `event.key`, así que basta
 * con un `Event` "storage" enriquecido con la propiedad `key`.
 */
function makeStorageEvent(key: string, newValue: string | null): Event {
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: key, configurable: true });
  Object.defineProperty(event, "newValue", {
    value: newValue,
    configurable: true,
  });
  return event;
}

beforeEach(async () => {
  posthogCapture.mockReset();
  posthogInit.mockReset();
  posthogDebug.mockReset();
  utmReadStub.mockReset();
  utmReadStub.mockReturnValue(null);

  // ZAL-247 — el estado de carga/init de posthog-js es module-level; sin
  // reset, un test con consent "contagia" al siguiente que asevera que
  // posthog-js NO se cargó.
  __resetAnalyticsForTests();

  // ZAL-156.2 — limpiamos el binding de `storage` event entre tests
  // porque el stub de `window` cambia en cada test (se recrea el
  // EventTarget). Sin este reset, el segundo test "hereda" el binding
  // del primero sobre un window que ya no existe, y los storage events
  // quedan colgados en un EventTarget inalcanzable.
  const { __resetConsentForTests } = await import("@/lib/consent/store");
  __resetConsentForTests();

  // Asegura un entorno browser con storage vacío antes de cualquier
  // operación de consent (necesario para ZAL-156.2: la primera llamada
  // a writeConsent/readConsent/subscribeConsent instala el listener de
  // `storage` event, que requiere addEventListener en window).
  stubBrowserEnvironment();
  // Limpia explícitamente la clave de consent.
  globalThis.window.localStorage.clear();

  // Reset consent a "unset" antes de cada test (purga localStorage).
  writeConsent("unset");
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

/**
 * ZAL-156.2 [GTM-DEP.2] — sincronización cross-tab y hardening del
 * store canónico. Cubre el `storage` event desde otra pestaña y el
 * test hook de reset.
 */
describe("ZAL-156.2 — sincronización cross-tab vía storage event", () => {
  it("storage event desde 'otra pestaña' notifica a los listeners con el valor nuevo", () => {
    writeConsent("granted");
    const cb = vi.fn();
    subscribeConsent(cb);
    cb.mockClear();

    // En un browser real, cuando otra pestaña hace `setItem`, esa misma
    // escritura queda visible para esta pestaña (localStorage es
    // compartido por origen). Simulamos esa escritura antes del evento.
    window.localStorage.setItem("zaltyko.consent.v1", "revoked");
    const event = makeStorageEvent("zaltyko.consent.v1", "revoked");
    window.dispatchEvent(event);

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ value: "revoked" })
    );
  });

  it("storage event con valor 'unset' (removeItem en otra pestaña) también notifica", () => {
    writeConsent("granted");
    const cb = vi.fn();
    subscribeConsent(cb);
    cb.mockClear();

    // En la práctica `removeItem` dispara un storage event con
    // `newValue: null`. El listener no debe distinguir — relee storage.
    window.localStorage.removeItem("zaltyko.consent.v1");
    const event = makeStorageEvent("zaltyko.consent.v1", null);
    window.dispatchEvent(event);

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ value: "unset" })
    );
  });

  it("storage event con key distinta a la del consent NO notifica", () => {
    writeConsent("unset");
    const cb = vi.fn();
    subscribeConsent(cb);
    cb.mockClear();

    const event = makeStorageEvent("alguna.otra.clave", "cualquiera");
    window.dispatchEvent(event);

    expect(cb).not.toHaveBeenCalled();
  });

  it("el storage event se instala perezosamente (no se añade hasta primer uso)", async () => {
    // Importamos el módulo de reset para limpiar estado entre tests.
    const { __resetConsentForTests } = await import("@/lib/consent/store");
    __resetConsentForTests();

    // Antes de cualquier operación de consent, no debería haber binding
    // de storage. Pero como jsdom no expone el listener set directamente,
    // verificamos el side effect: una vez que invocamos readConsent,
    // un storage event posterior SÍ debe disparar a los listeners.
    readConsent();
    const cb = vi.fn();
    subscribeConsent(cb);
    cb.mockClear();

    // Simulamos que otra pestaña acaba de escribir "granted" — la
    // escritura ya está visible en localStorage de esta pestaña.
    window.localStorage.setItem("zaltyko.consent.v1", "granted");
    const event = makeStorageEvent("zaltyko.consent.v1", "granted");
    window.dispatchEvent(event);

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ value: "granted" })
    );
  });

  it("__resetConsentForTests limpia el listener registry", async () => {
    const { __resetConsentForTests } = await import("@/lib/consent/store");
    writeConsent("unset");
    const cb = vi.fn();
    subscribeConsent(cb);
    cb.mockClear();

    __resetConsentForTests();

    // Tras el reset, escribir no debe notificar al listener antiguo.
    writeConsent("granted");
    expect(cb).not.toHaveBeenCalled();
  });
});

/**
 * ZAL-247 [GTM-DEP.4] — integración real del gate montando `PostHogProvider`.
 *
 * Estos casos son los que fallaban antes del fix:
 *   - el hook `usePageTracking` no estaba montado en ningún árbol, así que
 *     con `capture_pageview: false` la app no emitía ningún `$pageview`;
 *   - con consent previo se emitían DOS `$pageview` por mount (llamada
 *     directa + snapshot síncrono de `subscribeConsent`);
 *   - `initAnalytics` se llamaba incondicionalmente, cargando posthog-js y
 *     activando `capture_pageleave` para usuarios sin consent.
 */
describe("ZAL-247 — integración: PostHogProvider montado", () => {
  /** Cuenta solo los `$pageview` (ignora otros eventos). */
  function pageviewCalls(): Array<Record<string, unknown>> {
    return posthogCapture.mock.calls
      .filter((call) => call[0] === "$pageview")
      .map((call) => call[1] as Record<string, unknown>);
  }

  async function mountProvider() {
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
      result = render(createElement(PostHogProvider, null, "app"));
    });
    // Deja correr las microtareas de `trackPageView` / `initAnalytics`.
    await act(async () => {
      await Promise.resolve();
    });
    return result!;
  }

  beforeEach(async () => {
    // El `beforeEach` global instala un stub de `window` en memoria pensado
    // para los tests unitarios. React necesita el `window`/`document` reales
    // de jsdom, así que aquí soltamos el stub y trabajamos sobre el DOM real.
    vi.unstubAllGlobals();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");

    const { __resetConsentForTests } = await import("@/lib/consent/store");
    __resetConsentForTests();
    __resetAnalyticsForTests();
    window.localStorage.clear();
    window.history.pushState({}, "", "/pricing");

    posthogCapture.mockReset();
    posthogInit.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("consent 'unset' al montar → 0 eventos y posthog-js NO se carga", async () => {
    // storage vacío = "unset" (default-deny)
    await mountProvider();

    expect(pageviewCalls()).toHaveLength(0);
    expect(posthogInit).not.toHaveBeenCalled();
    expect(__isPostHogLoadedForTests()).toBe(false);
  });

  it("consent 'revoked' al montar → 0 eventos y posthog-js NO se carga", async () => {
    writeConsent("revoked");
    await mountProvider();

    expect(pageviewCalls()).toHaveLength(0);
    expect(posthogInit).not.toHaveBeenCalled();
    expect(__isPostHogLoadedForTests()).toBe(false);
  });

  it("consent 'granted' desde el arranque → exactamente 1 $pageview (no 2)", async () => {
    writeConsent("granted");
    await mountProvider();

    const calls = pageviewCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: "/pricing" });
    expect(posthogInit).toHaveBeenCalledTimes(1);
  });

  it("grant a mitad de sesión (sin reload) → exactamente 1 $pageview de la ruta actual", async () => {
    await mountProvider();
    expect(pageviewCalls()).toHaveLength(0);

    await act(async () => {
      writeConsent("granted");
      await Promise.resolve();
    });

    const calls = pageviewCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: "/pricing" });
  });

  it("grant → revoke → grant sobre la misma ruta no vuelve a contar la visita", async () => {
    writeConsent("granted");
    await mountProvider();
    expect(pageviewCalls()).toHaveLength(1);

    await act(async () => {
      writeConsent("revoked");
      writeConsent("granted");
      await Promise.resolve();
    });

    expect(pageviewCalls()).toHaveLength(1);
  });

  it("'revoked' tras 'granted' → la navegación posterior no emite eventos nuevos", async () => {
    writeConsent("granted");
    await mountProvider();
    expect(pageviewCalls()).toHaveLength(1);

    await act(async () => {
      writeConsent("revoked");
      await Promise.resolve();
    });

    await act(async () => {
      window.history.pushState({}, "", "/onboarding/owner");
      await Promise.resolve();
    });

    expect(pageviewCalls()).toHaveLength(1);
  });

  it("con consent, cada navegación emite su propio $pageview (incluida una ruta repetida)", async () => {
    writeConsent("granted");
    await mountProvider();

    await act(async () => {
      window.history.pushState({}, "", "/onboarding/owner");
      await Promise.resolve();
    });
    await act(async () => {
      window.history.pushState({}, "", "/pricing");
      await Promise.resolve();
    });

    expect(pageviewCalls().map((call) => call.path)).toEqual([
      "/pricing",
      "/onboarding/owner",
      "/pricing",
    ]);
  });

  it("al desmontar se restaura history.pushState y se corta el tracking", async () => {
    writeConsent("granted");
    const view = await mountProvider();
    expect(pageviewCalls()).toHaveLength(1);

    await act(async () => {
      view.unmount();
    });

    await act(async () => {
      window.history.pushState({}, "", "/otra-ruta");
      await Promise.resolve();
    });

    expect(pageviewCalls()).toHaveLength(1);
  });
});
