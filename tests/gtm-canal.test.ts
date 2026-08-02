/**
 * ZAL-159 [GTM-DEP.3] — cobertura de la taxonomía utm_source → canal.
 *
 * Regla: paid > social > email > organic > direct (precedencia).
 * Taxonomía reconciliada con Hermin (RESEARCH/DATA_GOVERNANCE_TAXONOMY_GTM.md §4):
 * - paid: google_ads, meta_ads, tiktok_ads
 * - social: instagram, tiktok, facebook, linkedin, whatsapp (whatsapp NO es direct)
 * - email: resend_email
 * - organic: google_organic
 * - google (alias): según medium
 * - direct: sin UTMs
 * - unknown: source/medium presentes pero no normalizables
 */

import { describe, expect, it } from "vitest";

import {
  derivar_canal,
  CANAL_LABELS,
  resolveCanal,
  type CanalRegistro,
} from "@/lib/gtm/canal";

describe("resolveCanal — paid sources", () => {
  it.each([
    ["google_ads", "paid"],
    ["meta_ads", "paid"],
    ["tiktok_ads", "paid"],
  ])("utm_source=%s → canal=%s", (source, expected) => {
    expect(resolveCanal({ utm_source: source })).toBe(expected);
  });
});

describe("resolveCanal — social sources", () => {
  it.each([
    ["instagram", "social"],
    ["tiktok", "social"],
    ["facebook", "social"],
    ["linkedin", "social"],
    ["whatsapp", "social"], // caso explícito: NO es direct
  ])("utm_source=%s → canal=%s", (source, expected) => {
    expect(resolveCanal({ utm_source: source })).toBe(expected);
  });
});

describe("resolveCanal — email y organic", () => {
  it("resend_email → email", () => {
    expect(resolveCanal({ utm_source: "resend_email" })).toBe("email");
  });
  it("google_organic → organic", () => {
    expect(resolveCanal({ utm_source: "google_organic" })).toBe("organic");
  });
});

describe("resolveCanal — google alias", () => {
  it("google + cpc → paid", () => {
    expect(
      resolveCanal({ utm_source: "google", utm_medium: "cpc" })
    ).toBe("paid");
  });
  it("google + organic → organic", () => {
    expect(
      resolveCanal({ utm_source: "google", utm_medium: "organic" })
    ).toBe("organic");
  });
  it("google + email → email", () => {
    expect(
      resolveCanal({ utm_source: "google", utm_medium: "email" })
    ).toBe("email");
  });
  it("google + social → social", () => {
    expect(
      resolveCanal({ utm_source: "google", utm_medium: "social" })
    ).toBe("social");
  });
  it("google sin medium → paid (default conservador para Search Ads)", () => {
    expect(resolveCanal({ utm_source: "google" })).toBe("paid");
  });
  it("google + medium informativo pero desconocido → unknown", () => {
    expect(
      resolveCanal({ utm_source: "google", utm_medium: "weird" })
    ).toBe("unknown");
  });
});

describe("resolveCanal — medium-only inference", () => {
  it.each([
    ["cpc", "paid"],
    ["ppc", "paid"],
    ["paid", "paid"],
    ["social", "social"],
    ["email", "email"],
    ["organic", "organic"],
  ])("utm_medium=%s sin source → canal=%s", (medium, expected) => {
    expect(resolveCanal({ utm_medium: medium })).toBe(expected);
  });

  it("medium desconocido sin source → unknown", () => {
    expect(resolveCanal({ utm_medium: "weird" })).toBe("unknown");
  });
});

describe("resolveCanal — edge cases", () => {
  it("sin UTMs → direct", () => {
    expect(resolveCanal({})).toBe("direct");
    expect(resolveCanal(null)).toBe("direct");
    expect(resolveCanal(undefined)).toBe("direct");
  });

  it("strings vacíos se tratan como ausentes → direct", () => {
    expect(resolveCanal({ utm_source: "", utm_medium: "  " })).toBe("direct");
  });

  it("normaliza case y espacios", () => {
    expect(resolveCanal({ utm_source: "  Google_Ads  " })).toBe("paid");
  });

  it("source no reconocido + medium conocido → unknown si medium no ayuda", () => {
    expect(
      resolveCanal({ utm_source: "spam_site", utm_medium: "cpc" })
    ).toBe("paid"); // medium=cpc gana
  });

  it("source no reconocido + medium ausente → unknown", () => {
    expect(resolveCanal({ utm_source: "spam_site" })).toBe("unknown");
  });
});

/**
 * ZAL-159 — tests de la firma canónica `derivar_canal(utm_source, utm_medium)`
 * (alias posicional, mismo cuerpo que `resolveCanal`). Esta es la firma del
 * spec y la que se documenta en la migración 0008 / trigger PL/pgSQL.
 *
 * Cobertura explícita de precedencia (paid > social > email > organic >
 * direct) por cada rama, más los casos conflictivos documentados en la
 * nota de Hermin §4.
 */
describe("derivar_canal — firma posicional del spec", () => {
  it.each<[string | null, string | null, CanalRegistro]>([
    // Cada rama de precedencia gana sobre la siguiente.
    ["google_ads", "email", "paid"],
    ["meta_ads", "social", "paid"],
    ["tiktok_ads", "organic", "paid"],
    ["instagram", "email", "social"],
    ["tiktok", "paid", "social"],
    ["whatsapp", "social", "social"], // explícito: whatsapp NO es direct
    ["resend_email", "paid", "email"], // email gana sobre paid si source=resend_email
    ["google_organic", "cpc", "organic"], // organic gana sobre paid si source=google_organic

    // Conflictivos con `google` alias.
    ["google", "cpc", "paid"],
    ["google", "organic", "organic"],
    ["google", "email", "email"],
    ["google", "social", "social"],
    ["google", null, "paid"], // default conservador Search Ads
    ["google", "weird", "unknown"],

    // Medium-only.
    [null, "cpc", "paid"],
    [null, "ppc", "paid"],
    [null, "paid", "paid"],
    [null, "social", "social"],
    [null, "email", "email"],
    [null, "organic", "organic"],
    [null, "weird", "unknown"],
    [null, "", "direct"],

    // Vacíos / nulos.
    ["", "", "direct"],
    [null, null, "direct"],
    [undefined, undefined, "direct"],

    // Source desconocido.
    ["spam_site", null, "unknown"],
    ["spam_site", "cpc", "paid"], // medium rescata
  ])(
    "derivar_canal(%p, %p) → %p",
    (source, medium, expected) => {
      expect(derivar_canal(source, medium)).toBe(expected);
    }
  );

  it("normaliza case y espacios (igual que resolveCanal)", () => {
    expect(derivar_canal("  Google_Ads  ", " CPC ")).toBe("paid");
    expect(derivar_canal("META_ADS", undefined)).toBe("paid");
  });

  it("whatsapp con medium arbitrario sigue siendo social (regla Hermin §4)", () => {
    expect(derivar_canal("whatsapp", "cpc")).toBe("social");
    expect(derivar_canal("whatsapp", "")).toBe("social");
  });
});

describe("CANAL_LABELS — etiqueta humana para dashboards", () => {
  it("expone label para cada canal del enum", () => {
    expect(CANAL_LABELS.paid).toBeTruthy();
    expect(CANAL_LABELS.social).toBeTruthy();
    expect(CANAL_LABELS.email).toBeTruthy();
    expect(CANAL_LABELS.organic).toBeTruthy();
    expect(CANAL_LABELS.direct).toBeTruthy();
    expect(CANAL_LABELS.unknown).toBeTruthy();
  });
});