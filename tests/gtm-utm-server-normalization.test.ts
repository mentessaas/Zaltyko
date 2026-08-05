/**
 * ZAL-157 [GTM-DEP.1] — regresión P1 de ZAL-198: normalización server-side
 * y contrato completo de los cinco UTM.
 *
 * Antes, los schemas de los endpoints aceptaban el literal externo
 * (`"  Google Ads (LATAM)  "`, `"  CPC  "`, `" Campaign With Spaces "`) y lo
 * escribían tal cual en `academies.utm_*`: la normalización solo existía en
 * el capturador cliente, que un caller externo puede saltarse. Además,
 * "¿hay touch?" miraba solo `utm_source`/`utm_medium`, descartando touches
 * formados por campaign/term/content.
 *
 * Estos tests atacan los schemas reales de los endpoints (no una copia), que
 * es donde el body externo entra al sistema.
 */

import { describe, expect, it } from "vitest";

import { CreateAcademyBodySchema } from "@/app/api/academies/academies.lib";
import { hasAnyUtm } from "@/lib/gtm/utm";
import { UtmPayloadSchema } from "@/lib/gtm/utm-payload-schema";
import { ClaimAcademyBodySchema } from "@/lib/onboarding/owner-claim";

const VALID_ACADEMY_BODY = {
  name: "Club Demo",
  country: "España",
  region: "Madrid",
  city: "Madrid",
  disciplineVariant: "rhythmic" as const,
};

const VALID_CLAIM_BODY = {
  academyId: "00000000-0000-0000-0000-000000000001",
  fullName: "Maria Garcia",
};

describe("UtmPayloadSchema — normalización server-side (ZAL-198 P1)", () => {
  it("normaliza los literales que reportó la revisión", () => {
    const parsed = UtmPayloadSchema.parse({
      utm_source: "  Google Ads (LATAM)  ",
      utm_medium: "  CPC  ",
      utm_campaign: " Campaign With Spaces ",
    });

    expect(parsed.utm_source).toBe("google_ads_latam");
    expect(parsed.utm_medium).toBe("cpc");
    expect(parsed.utm_campaign).toBe("campaign_with_spaces");
  });

  it("devuelve los cinco UTM más el landing path aunque el body venga vacío", () => {
    expect(UtmPayloadSchema.parse({})).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
      utm_landing_path: null,
    });
  });

  it("degrada a null los valores que no dejan nada tras normalizar", () => {
    const parsed = UtmPayloadSchema.parse({
      utm_source: "   ",
      utm_medium: "!!!",
      utm_campaign: "",
      utm_term: null,
    });

    expect(parsed.utm_source).toBeNull();
    expect(parsed.utm_medium).toBeNull();
    expect(parsed.utm_campaign).toBeNull();
    expect(parsed.utm_term).toBeNull();
  });

  it("neutraliza payloads con inyección de marcado o comillas", () => {
    const parsed = UtmPayloadSchema.parse({
      utm_content: "<script>alert(1)</script>",
      utm_term: "o'brien; drop table academies",
    });

    expect(parsed.utm_content).toBe("scriptalert1/script");
    expect(parsed.utm_term).toBe("obrien_drop_table_academies");
    expect(parsed.utm_content).not.toContain("<");
    expect(parsed.utm_term).not.toContain(";");
  });

  it("trunca a 200 caracteres el valor normalizado", () => {
    const parsed = UtmPayloadSchema.parse({ utm_campaign: "a".repeat(400) });
    expect(parsed.utm_campaign).toHaveLength(200);
  });

  it("rechaza valores por encima del cap crudo en vez de truncar en silencio", () => {
    const result = UtmPayloadSchema.safeParse({
      utm_campaign: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("descarta landing paths que no son rutas internas", () => {
    expect(
      UtmPayloadSchema.parse({ utm_landing_path: "https://evil.test/x" })
        .utm_landing_path
    ).toBeNull();
    expect(
      UtmPayloadSchema.parse({ utm_landing_path: "//evil.test" })
        .utm_landing_path
    ).toBeNull();
    expect(
      UtmPayloadSchema.parse({ utm_landing_path: "/es/trampolin?x=1" })
        .utm_landing_path
    ).toBe("/es/trampolin");
  });
});

describe("Schemas de endpoint — normalización aplicada en el borde", () => {
  it("CreateAcademyBodySchema normaliza el UTM del body", () => {
    const parsed = CreateAcademyBodySchema.parse({
      ...VALID_ACADEMY_BODY,
      utm: {
        utm_source: "  Google Ads (LATAM)  ",
        utm_medium: "  CPC  ",
        utm_campaign: " Campaign With Spaces ",
      },
    });

    expect(parsed.utm).toMatchObject({
      utm_source: "google_ads_latam",
      utm_medium: "cpc",
      utm_campaign: "campaign_with_spaces",
    });
  });

  it("ClaimAcademyBodySchema normaliza el UTM del body", () => {
    const parsed = ClaimAcademyBodySchema.parse({
      ...VALID_CLAIM_BODY,
      utm: {
        utm_source: "  Meta Ads  ",
        utm_content: "HERO V1",
      },
    });

    expect(parsed.utm).toMatchObject({
      utm_source: "meta_ads",
      utm_content: "hero_v1",
    });
  });

  it("ambos endpoints siguen aceptando bodies sin UTM", () => {
    expect(CreateAcademyBodySchema.parse(VALID_ACADEMY_BODY).utm).toBeUndefined();
    expect(ClaimAcademyBodySchema.parse(VALID_CLAIM_BODY).utm).toBeUndefined();
  });

  it("ambos endpoints rechazan un UTM por encima del cap crudo", () => {
    const oversized = { utm_source: "a".repeat(501) };
    expect(
      CreateAcademyBodySchema.safeParse({
        ...VALID_ACADEMY_BODY,
        utm: oversized,
      }).success
    ).toBe(false);
    expect(
      ClaimAcademyBodySchema.safeParse({ ...VALID_CLAIM_BODY, utm: oversized })
        .success
    ).toBe(false);
  });
});

describe("hasAnyUtm — contrato de los cinco parámetros (ZAL-198 P1)", () => {
  it("reconoce un touch formado solo por campaign, term o content", () => {
    expect(hasAnyUtm({ utm_campaign: "zal_ago" })).toBe(true);
    expect(hasAnyUtm({ utm_term: "academia" })).toBe(true);
    expect(hasAnyUtm({ utm_content: "hero_v1" })).toBe(true);
  });

  it("reconoce los touches con source o medium", () => {
    expect(hasAnyUtm({ utm_source: "instagram" })).toBe(true);
    expect(hasAnyUtm({ utm_medium: "social" })).toBe(true);
  });

  it("no cuenta el landing path como atribución", () => {
    expect(hasAnyUtm({ utm_landing_path: "/precios" } as never)).toBe(false);
  });

  it("trata como sin touch los payloads vacíos, nulos o indefinidos", () => {
    expect(hasAnyUtm(null)).toBe(false);
    expect(hasAnyUtm(undefined)).toBe(false);
    expect(hasAnyUtm({})).toBe(false);
    expect(
      hasAnyUtm({
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_term: null,
        utm_content: null,
      })
    ).toBe(false);
  });

  it("no cuenta cadenas vacías como touch", () => {
    expect(hasAnyUtm({ utm_source: "", utm_medium: "" })).toBe(false);
  });
});
