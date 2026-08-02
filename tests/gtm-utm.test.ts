/**
 * ZAL-157 [GTM-DEP.1] — cobertura del helper client-side UTM.
 *
 * Cubre: parsing desde URL, persistencia first-touch en sessionStorage,
 * precedencia sessionStorage > URL, merge con explicit, lectura para
 * signup, limpieza post-signup.
 *
 * El helper es client-only (usa sessionStorage + window.location), así
 * que los tests inyectan una `Storage` falsa y un `search`/`path`
 * explícitos para no depender del DOM.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureUtm,
  clearStoredUtm,
  readStoredUtm,
  readUtmForSignup,
  readUtmFromUrl,
  SESSION_STORAGE_KEY,
} from "@/lib/gtm/utm";

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

describe("readUtmFromUrl", () => {
  it("parsea los 5 parámetros UTM desde query string", () => {
    const search =
      "?utm_source=google_ads&utm_medium=cpc&utm_campaign=signup_latam&utm_term=academia%20gimnasia&utm_content=hero_v2";
    const utm = readUtmFromUrl(search);
    expect(utm).toEqual({
      utm_source: "google_ads",
      utm_medium: "cpc",
      utm_campaign: "signup_latam",
      utm_term: "academia_gimnasia",
      utm_content: "hero_v2",
    });
  });

  it("omite parámetros vacíos y devuelve objeto parcial", () => {
    const utm = readUtmFromUrl("?utm_source=meta_ads&utm_medium=&foo=bar");
    expect(utm).toEqual({ utm_source: "meta_ads" });
  });

  it("normaliza espacios a _ y colapsa caracteres no permitidos", () => {
    // "Google Ads (LATAM)": URLSearchParams ya decode %20 / + a espacio;
    // el regex colapsa espacios a _ y luego quita no permitidos
    // (paréntesis). "foo+bar": el `+` se decode a espacio, queda "foo bar",
    // colapsa a "foo_bar".
    const utm = readUtmFromUrl(
      "?utm_source=Google Ads (LATAM)&utm_campaign=foo+bar"
    );
    expect(utm.utm_source).toBe("google_ads_latam");
    expect(utm.utm_campaign).toBe("foo_bar");
  });

  it("acepta URLSearchParams directo", () => {
    const params = new URLSearchParams("utm_source=tiktok_ads&utm_medium=cpc");
    expect(readUtmFromUrl(params)).toEqual({
      utm_source: "tiktok_ads",
      utm_medium: "cpc",
    });
  });

  it("trunca valores a 200 caracteres", () => {
    const long = "a".repeat(300);
    const utm = readUtmFromUrl(`?utm_source=${long}`);
    expect(utm.utm_source?.length).toBe(200);
  });
});

describe("captureUtm — first-touch sessionStorage", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeMemoryStorage();
    vi.stubGlobal("window", {
      sessionStorage: storage,
      location: { search: "", pathname: "/" },
    });
  });

  it("persiste UTMs de la URL en sessionStorage si están presentes", () => {
    captureUtm({
      search: "?utm_source=google_ads&utm_medium=cpc",
      path: "/es/artistica",
      storage,
    });
    const stored = readStoredUtm(storage);
    expect(stored).toMatchObject({
      utm_source: "google_ads",
      utm_medium: "cpc",
      utm_landing_path: "/es/artistica",
    });
  });

  it("respeta first-touch: si sessionStorage ya tiene UTMs, no los sobrescribe con los de la URL", () => {
    // Primera captura en landing
    captureUtm({
      search: "?utm_source=meta_ads&utm_campaign=hero_v1",
      path: "/",
      storage,
    });
    // Segunda "visita" con UTMs distintos (navegación interna)
    const merged = captureUtm({
      search: "?utm_source=tiktok_ads&utm_campaign=footer_v3",
      path: "/pricing",
      storage,
    });
    expect(merged.utm_source).toBe("meta_ads");
    expect(merged.utm_campaign).toBe("hero_v1");
    expect(merged.utm_landing_path).toBe("/");
  });

  it("no hace nada si la URL no trae UTMs y storage está vacío", () => {
    const result = captureUtm({ search: "", path: "/", storage });
    expect(result).toEqual({});
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("guarda el landing path solo en la primera captura con UTMs", () => {
    captureUtm({
      search: "?utm_source=google_ads",
      path: "/es/ritmica",
      storage,
    });
    // Segunda navegación interna sin UTMs nuevos: NO actualiza el path
    captureUtm({ search: "", path: "/pricing", storage });
    expect(readStoredUtm(storage).utm_landing_path).toBe("/es/ritmica");
  });
});

describe("readUtmForSignup", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeMemoryStorage();
    vi.stubGlobal("window", {
      sessionStorage: storage,
      location: { search: "", pathname: "/onboarding/owner" },
    });
  });

  it("devuelve null si no hay UTMs en ninguna fuente (registro direct)", () => {
    expect(readUtmForSignup({ storage })).toBeNull();
  });

  it("mezcla explicit > sessionStorage > URL", () => {
    // Caso A: sessionStorage tiene source, URL no trae nada
    storage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ utm_source: "google_ads", utm_medium: "cpc" })
    );
    let result = readUtmForSignup({ storage });
    expect(result?.utm_source).toBe("google_ads");

    // Caso B: explicit gana sobre storage (override manual del form)
    result = readUtmForSignup({
      storage,
      explicit: { utm_source: "manual_override" },
    });
    expect(result?.utm_source).toBe("manual_override");

    // Caso C: cold start con UTMs directo en la URL del signup
    storage.clear();
    result = readUtmForSignup({
      storage,
      search: "?utm_source=meta_ads&utm_medium=paid_social",
    });
    expect(result).toEqual({
      utm_source: "meta_ads",
      utm_medium: "paid_social",
    });
  });

  it("clearStoredUtm purga sessionStorage", () => {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ utm_source: "x" }));
    clearStoredUtm(storage);
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});

describe("comportamiento SSR-safe", () => {
  it("no lanza si window no está definido", () => {
    vi.stubGlobal("window", undefined);
    expect(() => captureUtm()).not.toThrow();
    expect(readUtmForSignup()).toBeNull();
    expect(() => clearStoredUtm()).not.toThrow();
  });
});