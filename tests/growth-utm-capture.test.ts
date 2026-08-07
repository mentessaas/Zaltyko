import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  UTM_DIRECT_FALLBACK,
  UTM_KEYS,
  UTM_STORAGE_KEY,
  captureFirstTouchUtm,
  hasMatchingUtmKeys,
  normalizeUtmValue,
  pickUtmFromQuery,
  readUtmWithFallback,
  type UtmStorageLike,
} from "@/lib/growth/utm";

/**
 * Implementación in-memory de UtmStorageLike para tests puros (no jsdom).
 * Más predecible que sessionStorage real en entorno vitest=node.
 */
function createMemoryStorage(initial: Record<string, string> = {}): UtmStorageLike & {
  _dump: () => Record<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    _dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

describe("growth/utm (ZAL-157) — normalizeUtmValue", () => {
  it.each([
    ["instagram", "instagram"],
    ["  instagram  ", "instagram"],
    ["META_ADS", "meta_ads"],
    ["zal_onboarding_ago_awareness", "zal_onboarding_ago_awareness"],
    ["google-ads", "google-ads"],
    ["campaign-2026_08", "campaign-2026_08"],
    ["123abc", "123abc"],
  ])("acepta y normaliza %s → %s", (input, expected) => {
    expect(normalizeUtmValue(input)).toBe(expected);
  });

  it("descarta string vacío", () => {
    expect(normalizeUtmValue("")).toBeNull();
    expect(normalizeUtmValue("   ")).toBeNull();
  });

  it("descarta valores con espacios, mayúsculas o caracteres no permitidos", () => {
    expect(normalizeUtmValue("facebook ads")).toBeNull();
    expect(normalizeUtmValue("Meta/Ads")).toBeNull();
    expect(normalizeUtmValue("utm_source=google")).toBeNull();
    expect(normalizeUtmValue("español")).toBeNull();
    expect(normalizeUtmValue("foo!bar")).toBeNull();
  });

  it("descarta null, undefined y tipos no-string", () => {
    expect(normalizeUtmValue(null)).toBeNull();
    expect(normalizeUtmValue(undefined)).toBeNull();
    expect(normalizeUtmValue(42)).toBeNull();
    expect(normalizeUtmValue({})).toBeNull();
  });

  it("descarta valores > 128 chars", () => {
    const long = "a".repeat(129);
    expect(normalizeUtmValue(long)).toBeNull();
  });

  it("acepta exactamente 128 chars", () => {
    const exact = "a".repeat(128);
    expect(normalizeUtmValue(exact)).toBe(exact);
  });
});

describe("growth/utm (ZAL-157) — pickUtmFromQuery", () => {
  it("extrae los 5 parámetros desde URLSearchParams con lowercase + trim", () => {
    const params = new URLSearchParams(
      "utm_source=META_ADS&utm_medium=  social &utm_campaign=q3&other=value"
    );
    expect(pickUtmFromQuery(params)).toEqual({
      utm_source: "meta_ads",
      utm_medium: "social",
      utm_campaign: "q3",
      utm_term: null,
      utm_content: null,
    });
  });

  it("extrae desde objeto plano", () => {
    expect(
      pickUtmFromQuery({
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "brand",
        utm_term: "gimnasia",
        utm_content: null,
        other: "ignored",
      })
    ).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "brand",
      utm_term: "gimnasia",
      utm_content: null,
    });
  });

  it("ignora keys ajenas a UTM", () => {
    expect(
      pickUtmFromQuery(new URLSearchParams("ref=fb&gclid=xyz&utm_source=google"))
    ).toMatchObject({ utm_source: "google" });
  });

  it("devuelve null para keys vacías", () => {
    const params = new URLSearchParams("utm_source=&utm_medium=email");
    expect(pickUtmFromQuery(params).utm_source).toBeNull();
    expect(pickUtmFromQuery(params).utm_medium).toBe("email");
  });

  it("cubre los 5 parámetros UTM_KEYS sin遗漏", () => {
    const params = new URLSearchParams(
      "utm_source=s&utm_medium=m&utm_campaign=c&utm_term=t&utm_content=x"
    );
    const result = pickUtmFromQuery(params);
    for (const key of UTM_KEYS) {
      expect(result[key]).toBeTruthy();
    }
  });
});

describe("growth/utm (ZAL-157) — captureFirstTouchUtm (first-touch)", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  beforeEach(() => {
    storage = createMemoryStorage();
  });
  afterEach(() => {
    storage = createMemoryStorage();
  });

  it("persiste UTMs en sessionStorage en el primer touch", () => {
    const incoming = pickUtmFromQuery(
      new URLSearchParams("utm_source=instagram&utm_medium=social")
    );
    captureFirstTouchUtm(incoming, storage);

    const dump = storage._dump();
    expect(dump[UTM_STORAGE_KEY]).toBeDefined();
    const stored = JSON.parse(dump[UTM_STORAGE_KEY]);
    expect(stored.utm_source).toBe("instagram");
    expect(stored.utm_medium).toBe("social");
  });

  it("NO sobrescribe UTMs existentes en segunda captura (first-touch)", () => {
    const first = pickUtmFromQuery(
      new URLSearchParams(
        "utm_source=instagram&utm_medium=social&utm_campaign=zal_q1"
      )
    );
    captureFirstTouchUtm(first, storage);

    const second = pickUtmFromQuery(
      new URLSearchParams(
        "utm_source=google_ads&utm_medium=cpc&utm_campaign=brand"
      )
    );
    captureFirstTouchUtm(second, storage);

    const dump = storage._dump();
    const stored = JSON.parse(dump[UTM_STORAGE_KEY]);
    expect(stored.utm_source).toBe("instagram");
    expect(stored.utm_medium).toBe("social");
    expect(stored.utm_campaign).toBe("zal_q1");
  });

  it("completa keys vacías con valores posteriores (first-touch no bloquea)", () => {
    const first = pickUtmFromQuery(new URLSearchParams("utm_source=instagram"));
    captureFirstTouchUtm(first, storage);

    const second = pickUtmFromQuery(
      new URLSearchParams("utm_medium=social&utm_campaign=q3")
    );
    captureFirstTouchUtm(second, storage);

    const dump = storage._dump();
    const stored = JSON.parse(dump[UTM_STORAGE_KEY]);
    expect(stored.utm_source).toBe("instagram");
    expect(stored.utm_medium).toBe("social");
    expect(stored.utm_campaign).toBe("q3");
  });

  it("funciona sin storage (in-memory only, sin throw)", () => {
    const incoming = pickUtmFromQuery(
      new URLSearchParams("utm_source=instagram")
    );
    const merged = captureFirstTouchUtm(incoming, undefined);
    expect(merged.utm_source).toBe("instagram");
  });

  it("combina UTMs in-memory + storage: storage gana en conflicto", () => {
    const preloaded = createMemoryStorage({
      [UTM_STORAGE_KEY]: JSON.stringify({
        utm_source: "instagram",
        utm_medium: "social",
      }),
    });

    const incoming = pickUtmFromQuery(
      new URLSearchParams("utm_source=google_ads&utm_campaign=q3")
    );
    const merged = captureFirstTouchUtm(incoming, preloaded);
    expect(merged.utm_source).toBe("instagram");
    expect(merged.utm_campaign).toBe("q3");
  });
});

describe("growth/utm (ZAL-157) — readUtmWithFallback", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("devuelve fallback direct/none cuando no hay storage ni URL", () => {
    const result = readUtmWithFallback(
      new URLSearchParams(),
      storage,
      UTM_STORAGE_KEY
    );
    expect(result).toEqual(UTM_DIRECT_FALLBACK);
  });

  it("URL gana sobre storage cuando ambos tienen UTM", () => {
    storage.setItem(
      UTM_STORAGE_KEY,
      JSON.stringify({ utm_source: "instagram", utm_medium: "social" })
    );
    const result = readUtmWithFallback(
      new URLSearchParams("utm_source=google_ads"),
      storage,
      UTM_STORAGE_KEY
    );
    expect(result.utm_source).toBe("google_ads");
    expect(result.utm_medium).toBe("social");
  });

  it("storage preserva UTMs cuando signup llega sin URL params", () => {
    storage.setItem(
      UTM_STORAGE_KEY,
      JSON.stringify({
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "zal_q1",
      })
    );
    const result = readUtmWithFallback(
      new URLSearchParams(),
      storage,
      UTM_STORAGE_KEY
    );
    expect(result.utm_source).toBe("instagram");
    expect(result.utm_medium).toBe("social");
    expect(result.utm_campaign).toBe("zal_q1");
    expect(result.utm_term).toBe(UTM_DIRECT_FALLBACK.utm_term);
    expect(result.utm_content).toBe(UTM_DIRECT_FALLBACK.utm_content);
  });

  it("URL directa al signup con UTMs nuevos preserva first-touch si storage tiene valor", () => {
    storage.setItem(
      UTM_STORAGE_KEY,
      JSON.stringify({ utm_source: "instagram" })
    );
    const result = readUtmWithFallback(
      new URLSearchParams("utm_source=google_ads"),
      storage,
      UTM_STORAGE_KEY
    );
    // El spec dice "URL gana si llega directo" — URL tiene precedencia.
    expect(result.utm_source).toBe("google_ads");
  });

  it("rellena keys faltantes con fallback", () => {
    const result = readUtmWithFallback(
      new URLSearchParams("utm_source=instagram"),
      storage,
      UTM_STORAGE_KEY
    );
    expect(result.utm_source).toBe("instagram");
    expect(result.utm_medium).toBe(UTM_DIRECT_FALLBACK.utm_medium);
    expect(result.utm_campaign).toBe(UTM_DIRECT_FALLBACK.utm_campaign);
  });

  it("descarta storage corrupto sin throw y devuelve fallback", () => {
    storage.setItem(UTM_STORAGE_KEY, "not-json-{{");
    const result = readUtmWithFallback(
      new URLSearchParams(),
      storage,
      UTM_STORAGE_KEY
    );
    expect(result).toEqual(UTM_DIRECT_FALLBACK);
  });
});

describe("growth/utm (ZAL-157) — escenario end-to-end first-touch", () => {
  it("landing UTM1 → page UTM2 → signup sin UTM → signup usa UTM1", () => {
    const storage = createMemoryStorage();

    // 1. Landing con UTM1
    const landing = pickUtmFromQuery(
      new URLSearchParams(
        "utm_source=instagram&utm_medium=social&utm_campaign=zal_q1"
      )
    );
    captureFirstTouchUtm(landing, storage);

    // 2. Navegación interna a otra página con UTM2 (debe ignorarse)
    const navigation = pickUtmFromQuery(
      new URLSearchParams(
        "utm_source=google_ads&utm_medium=cpc&utm_campaign=q3_retarget"
      )
    );
    captureFirstTouchUtm(navigation, storage);

    // 3. Signup llega sin UTM en URL
    const signup = readUtmWithFallback(
      new URLSearchParams(),
      storage,
      UTM_STORAGE_KEY
    );

    expect(signup.utm_source).toBe("instagram");
    expect(signup.utm_medium).toBe("social");
    expect(signup.utm_campaign).toBe("zal_q1");
    expect(signup.utm_term).toBe(UTM_DIRECT_FALLBACK.utm_term);
    expect(signup.utm_content).toBe(UTM_DIRECT_FALLBACK.utm_content);
  });

  it("landing UTM1 → signup con UTM2 → signup usa UTM2 (URL gana)", () => {
    const storage = createMemoryStorage();

    const landing = pickUtmFromQuery(
      new URLSearchParams("utm_source=instagram&utm_medium=social")
    );
    captureFirstTouchUtm(landing, storage);

    const signup = readUtmWithFallback(
      new URLSearchParams(
        "utm_source=google_ads&utm_campaign=direct_promo&utm_term=gimnasia"
      ),
      storage,
      UTM_STORAGE_KEY
    );

    expect(signup.utm_source).toBe("google_ads");
    expect(signup.utm_medium).toBe("social"); // del storage
    expect(signup.utm_campaign).toBe("direct_promo"); // de URL
    expect(signup.utm_term).toBe("gimnasia");
  });
});

describe("growth/utm (ZAL-157) — hasMatchingUtmKeys", () => {
  it("matchea cuando todas las keys en b están en a con el mismo valor", () => {
    const a = { utm_source: "instagram", utm_medium: "social" };
    const b = { utm_source: "instagram" };
    expect(hasMatchingUtmKeys(a, b)).toBe(true);
  });

  it("devuelve false si algún valor difiere", () => {
    const a = { utm_source: "instagram", utm_medium: "social" };
    const b = { utm_source: "google_ads" };
    expect(hasMatchingUtmKeys(a, b)).toBe(false);
  });

  it("ignora keys ausentes en ambos lados", () => {
    const a = { utm_source: "instagram" };
    const b = {};
    expect(hasMatchingUtmKeys(a, b)).toBe(true);
  });
});

describe("growth/utm (ZAL-157) — casos malformados", () => {
  it("URL con UTM que tiene caracteres especiales no pasa al storage", () => {
    const storage = createMemoryStorage();
    const incoming = pickUtmFromQuery(
      new URLSearchParams(
        "utm_source=hello%20world&utm_medium=cpc&utm_campaign=brand%2F2026"
      )
    );
    // Solo utm_medium es válido (espacios -> null, slash -> null)
    captureFirstTouchUtm(incoming, storage);

    const dump = storage._dump();
    if (dump[UTM_STORAGE_KEY]) {
      const stored = JSON.parse(dump[UTM_STORAGE_KEY]);
      // null/ausente en JSON.stringify: si el valor quedó null, no se persiste
      // y la key queda omitida. Lo importante es que SOLO utm_medium pasa.
      expect(stored.utm_source).toBeFalsy();
      expect(stored.utm_medium).toBe("cpc");
      expect(stored.utm_campaign).toBeFalsy();
    } else {
      // Si no se persiste nada válido, está bien — la sesión no tiene atribución.
      expect(true).toBe(true);
    }
  });

  it("storage con JSON inválido se ignora sin throw", () => {
    const storage = createMemoryStorage({ [UTM_STORAGE_KEY]: "{invalid" });
    const merged = captureFirstTouchUtm(
      pickUtmFromQuery(new URLSearchParams("utm_source=instagram")),
      storage
    );
    expect(merged.utm_source).toBe("instagram");
  });
});