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
 * - direct: sin UTMs o UTM inválido
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    expect(resolveCanal({ utm_source: "google", utm_medium: "cpc" })).toBe(
      "paid"
    );
  });
  it("google + organic → organic", () => {
    expect(resolveCanal({ utm_source: "google", utm_medium: "organic" })).toBe(
      "organic"
    );
  });
  it("google + email → email", () => {
    expect(resolveCanal({ utm_source: "google", utm_medium: "email" })).toBe(
      "email"
    );
  });
  it("google + social → social", () => {
    expect(resolveCanal({ utm_source: "google", utm_medium: "social" })).toBe(
      "social"
    );
  });
  it("google sin medium → direct", () => {
    expect(resolveCanal({ utm_source: "google" })).toBe("direct");
  });
  it("google + medium desconocido → direct", () => {
    expect(resolveCanal({ utm_source: "google", utm_medium: "weird" })).toBe(
      "direct"
    );
  });
});

describe("resolveCanal — medium-only inference", () => {
  it.each([
    ["cpc", "paid"],
    ["social", "social"],
    ["email", "email"],
    ["organic", "organic"],
  ])("utm_medium=%s sin source → canal=%s", (medium, expected) => {
    expect(resolveCanal({ utm_medium: medium })).toBe(expected);
  });

  it("medium desconocido sin source → direct", () => {
    expect(resolveCanal({ utm_medium: "weird" })).toBe("direct");
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

  it("source no reconocido + medium conocido → aplica el medium", () => {
    expect(resolveCanal({ utm_source: "spam_site", utm_medium: "cpc" })).toBe(
      "paid"
    ); // medium=cpc gana
  });

  it("source no reconocido + medium ausente → direct", () => {
    expect(resolveCanal({ utm_source: "spam_site" })).toBe("direct");
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
    ["tiktok", "organic", "social"],
    ["whatsapp", "social", "social"], // explícito: whatsapp NO es direct
    ["resend_email", "organic", "email"],
    ["google_organic", "email", "email"],

    // El medium también participa en la precedencia global.
    ["instagram", "cpc", "paid"],
    ["resend_email", "cpc", "paid"],
    ["google_organic", "cpc", "paid"],
    ["google_ads", "social", "paid"],

    // Conflictivos con `google` alias.
    ["google", "cpc", "paid"],
    ["google", "organic", "organic"],
    ["google", "email", "email"],
    ["google", "social", "social"],
    ["google", null, "direct"],
    ["google", "weird", "direct"],

    // Medium-only.
    [null, "cpc", "paid"],
    [null, "social", "social"],
    [null, "email", "email"],
    [null, "organic", "organic"],
    [null, "weird", "direct"],
    [null, "", "direct"],

    // Vacíos / nulos.
    ["", "", "direct"],
    [null, null, "direct"],
    [undefined, undefined, "direct"],

    // Source desconocido.
    ["spam_site", null, "direct"],
    ["spam_site", "cpc", "paid"], // medium rescata
  ])("derivar_canal(%p, %p) → %p", (source, medium, expected) => {
    expect(derivar_canal(source, medium)).toBe(expected);
  });

  it("normaliza case y espacios (igual que resolveCanal)", () => {
    expect(derivar_canal("  Google_Ads  ", " CPC ")).toBe("paid");
    expect(derivar_canal("META_ADS", undefined)).toBe("paid");
  });

  it("whatsapp es social salvo que medium=cpc active la precedencia paid", () => {
    expect(derivar_canal("whatsapp", "cpc")).toBe("paid");
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
  });
});

describe("migración 0008 — snapshot first-touch", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0008_academies_canal_registro.sql"),
    "utf8"
  );

  it("usa una función SQL pura e inmutable con fallback direct", () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION "academies_canal_registro_value"'
    );
    expect(migration).toContain("IMMUTABLE");
    expect(migration).toContain("ELSE 'direct'");
    expect(migration).not.toContain("'unknown'");
  });

  it("limita el UPDATE trigger a la primera captura de una pre-registrada", () => {
    expect(migration).toContain('OLD."canal_registro" IS NULL');
    expect(migration).toContain("OLD.\"canal_registro\" = 'direct'");
    expect(migration).toContain(
      '"academies_canal_registro_norm"(OLD."utm_source") = \'\''
    );
    expect(migration).toContain(
      '"academies_canal_registro_norm"(NEW."utm_source") <> \'\''
    );
  });

  // F1 (QA ZAL-176): `trim()` de SQL solo recorta espacios, `String.trim()`
  // de JS recorta todo el whitespace. Sin normalización compartida,
  // "\tgoogle_ads" daba paid en TS y direct en Postgres.
  it("normaliza el whitespace igual que TS en vez de usar trim() a secas", () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION "academies_canal_registro_norm"'
    );
    expect(migration).toContain("'^[[:space:]]+|[[:space:]]+$'");
    expect(migration).not.toContain("lower(coalesce(trim(");
  });

  // F2 (QA ZAL-176 + bloqueante de Platform & Security en ZAL-174): el
  // trigger anterior era `BEFORE UPDATE OF utm_source, utm_medium`, así que
  // un `UPDATE academies SET canal_registro = 'organic'` no se interceptaba.
  it("intercepta cualquier UPDATE, no solo el de las columnas UTM", () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION "academies_canal_registro_update_guard"'
    );
    expect(migration).toContain('BEFORE UPDATE ON "academies"');
    expect(migration).not.toContain(
      'BEFORE UPDATE OF "utm_source", "utm_medium"'
    );
    expect(migration).toContain('NEW."canal_registro" := OLD."canal_registro"');
  });

  it("desactiva el guard solo para el backfill y lo reactiva después", () => {
    const disable = migration.indexOf(
      'DISABLE TRIGGER "academies_canal_registro_bu"'
    );
    const backfill = migration.indexOf('UPDATE "academies"\n\tSET');
    const enable = migration.indexOf(
      'ENABLE TRIGGER "academies_canal_registro_bu"'
    );
    expect(disable).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(-1);
    expect(enable).toBeGreaterThan(-1);
    expect(disable).toBeLessThan(backfill);
    expect(backfill).toBeLessThan(enable);
  });

  it("no promete en el COMMENT más inmutabilidad de la que aplica", () => {
    expect(migration).not.toContain("Snapshot inmutable tras la primera");
    expect(migration).toContain("academies_canal_registro_bu");
  });
});

// F1 — lado TS de la paridad. Los mismos valores se verificaron contra
// Postgres 14.20 al aplicar la migración (evidencia en ZAL-159).
describe("derivar_canal — paridad de whitespace con la función SQL", () => {
  it.each([
    ["\tgoogle_ads", null, "paid"],
    ["instagram\n", null, "social"],
    [null, "\r\ncpc\r\n", "paid"],
    ["  \t Meta_Ads \n ", null, "paid"],
    ["  whatsapp  ", null, "social"],
    ["\t\n  \r", "  \t", "direct"],
  ] as const)("source=%j medium=%j → %s", (source, medium, expected) => {
    expect(derivar_canal(source, medium)).toBe(expected);
  });
});
