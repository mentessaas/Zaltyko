import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import seedFile from "@/content/competencia/semilla-2026-11.json";
import {
  CompetitiveSeedSchema,
  CompetitorCreateSchema,
  CompetitorUpdateSchema,
  OpportunityInputSchema,
  PricingPlanSchema,
  SectionUpdateSchema,
  SourceCreateSchema,
  parseCompetitorFilters,
} from "@/lib/competencia/contracts";
import { SECTION_KEYS, slugify } from "@/lib/competencia/domain";
import { computeDiff } from "@/lib/competencia/mutations";
import { reviewDueOn, reviewState } from "@/lib/competencia/review";

/**
 * Panel de inteligencia competitiva: semilla versionada, contratos de entrada,
 * vigencia de los datos e historial. Sin base de datos ni red.
 */

const REQUIRED_SLUGS = [
  "rg-manager",
  "scoregym-club",
  "gimnasiatotal",
  "clybo",
  "oneclub",
  "clupik",
  "jackrabbit-class",
  "iclasspro",
  "flipbiz",
];

describe("semilla de competencia", () => {
  const seed = CompetitiveSeedSchema.parse(seedFile);

  it("incluye las nueve empresas de la lista sin duplicados", () => {
    const slugs = seed.competitors.map((competitor) => competitor.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of REQUIRED_SLUGS) expect(slugs).toContain(slug);
  });

  it("solo referencia flujos, fuentes y competidores que existen", () => {
    const flowKeys = new Set(seed.flows.map((flow) => flow.key));
    const slugs = new Set(
      seed.competitors.map((competitor) => competitor.slug)
    );
    for (const competitor of seed.competitors) {
      const refs = new Set(competitor.sources.map((source) => source.ref));
      expect(refs.size).toBe(competitor.sources.length);
      for (const section of Object.values(competitor.sections)) {
        for (const ref of section?.sourceRefs ?? [])
          expect(refs.has(ref), `${competitor.slug}: ${ref}`).toBe(true);
      }
      for (const plan of competitor.pricing) {
        if (plan.sourceRef) expect(refs.has(plan.sourceRef)).toBe(true);
      }
      for (const coverage of competitor.flows) {
        expect(
          flowKeys.has(coverage.flow),
          `${competitor.slug}: ${coverage.flow}`
        ).toBe(true);
        if (coverage.sourceRef) expect(refs.has(coverage.sourceRef)).toBe(true);
      }
    }
    for (const opportunity of seed.opportunities) {
      for (const slug of opportunity.competitorSlugs)
        expect(slugs.has(slug)).toBe(true);
    }
  });

  it("no presenta como verificado un dato vacío, inferido o sin fecha", () => {
    for (const competitor of seed.competitors) {
      for (const [key, section] of Object.entries(competitor.sections)) {
        if (!section) continue;
        expect(SECTION_KEYS).toContain(key);
        if (section.dataStatus === "verificado") {
          expect(
            section.lastVerifiedOn,
            `${competitor.slug}.${key}`
          ).not.toBeNull();
          expect(section.content.trim(), `${competitor.slug}.${key}`).not.toBe(
            ""
          );
          expect(section.evidenceLevel, `${competitor.slug}.${key}`).not.toBe(
            "inferido"
          );
        }
        if (!section.content.trim())
          expect(section.dataStatus).not.toBe("verificado");
      }
    }
  });

  it("no publica identificadores fiscales de personas físicas", () => {
    const text = JSON.stringify(seedFile);
    expect(text).not.toMatch(/\b\d{8}[A-HJ-NP-TV-Z]\b/);
  });

  it("todas las fuentes tienen URL http(s), fecha y afirmación", () => {
    for (const competitor of seed.competitors) {
      expect(competitor.sources.length).toBeGreaterThan(0);
      for (const source of competitor.sources) {
        expect(source.url).toMatch(/^https?:\/\//);
        expect(source.accessedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(source.claim.length).toBeGreaterThan(3);
      }
    }
  });
});

describe("contratos del panel", () => {
  it("crea un competidor con los mínimos y normaliza vacíos a null", () => {
    const parsed = CompetitorCreateSchema.parse({
      name: "  Nuevo Club Soft ",
      website: null,
      competitorType: "adyacente",
      countries: ["es", "ES", "mx"],
      summary: "",
    });
    expect(parsed.name).toBe("Nuevo Club Soft");
    expect(parsed.website).toBeNull();
    expect(parsed.summary).toBeNull();
    expect(parsed.countries).toEqual(["ES", "MX"]);
    expect(parsed.researchStatus).toBe("pendiente");
  });

  it("rechaza URLs que no son http(s) y tipos desconocidos", () => {
    expect(
      CompetitorCreateSchema.safeParse({
        name: "X Soft",
        website: "javascript:alert(1)",
        competitorType: "directo",
      }).success
    ).toBe(false);
    expect(
      CompetitorCreateSchema.safeParse({
        name: "X Soft",
        competitorType: "enemigo",
      }).success
    ).toBe(false);
    expect(
      SourceCreateSchema.safeParse({
        url: "ftp://ejemplo.com",
        accessedOn: "2026-11-10",
        sourceType: "web_oficial",
        claim: "Precio publicado",
        evidenceLevel: "declarado",
      }).success
    ).toBe(false);
  });

  it("no acepta una actualización vacía y permite archivar", () => {
    expect(CompetitorUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      CompetitorUpdateSchema.parse({ lifecycleStatus: "archivado" })
    ).toEqual({ lifecycleStatus: "archivado" });
  });

  it("valida secciones, precios sin importe y oportunidades", () => {
    expect(
      SectionUpdateSchema.parse({
        content: "",
        dataStatus: "pendiente_revision",
        evidenceLevel: "sin_evidencia",
        lastVerifiedOn: null,
        reviewAfterDays: "90",
      }).reviewAfterDays
    ).toBe(90);
    expect(
      SectionUpdateSchema.safeParse({
        content: "x",
        dataStatus: "verificado",
        evidenceLevel: "declarado",
        lastVerifiedOn: "10/11/2026",
        reviewAfterDays: 90,
      }).success
    ).toBe(false);
    const plan = PricingPlanSchema.parse({
      planName: "A consultar",
      priceAmount: null,
      billingPeriod: "consultar",
      vatMode: "desconocido",
      dataStatus: "verificado",
    });
    expect(plan.priceAmount).toBeNull();
    expect(plan.currency).toBe("EUR");
    expect(
      OpportunityInputSchema.safeParse({
        title: "Prueba",
        classification: "copiar",
        confidence: "alta",
        status: "hipotesis",
      }).success
    ).toBe(false);
  });

  it("lee filtros con null y descarta valores inválidos sin fallar", () => {
    const filters = parseCompetitorFilters(
      new URLSearchParams(
        "q=rg&type=enemigo&country=es&discipline=ritmica&lifecycle="
      )
    );
    expect(filters.q).toBe("rg");
    expect(filters.type).toBeNull();
    expect(filters.country).toBe("ES");
    expect(filters.discipline).toBe("ritmica");
    expect(filters.lifecycle ?? null).toBeNull();
  });

  it("genera slugs estables sin acentos", () => {
    expect(slugify("Clybo’ Gimnasia Rítmica")).toBe("clybo-gimnasia-ritmica");
  });
});

describe("vigencia de los datos", () => {
  it("calcula la fecha de revisión y el estado", () => {
    const base = {
      content: "Precio 35 €",
      dataStatus: "verificado",
      lastVerifiedOn: "2026-11-10",
      reviewAfterDays: 60,
    };
    expect(reviewDueOn(base)).toBe("2027-01-09");
    expect(reviewState(base, "2026-12-01")).toBe("al_dia");
    expect(reviewState(base, "2027-01-09")).toBe("toca_revisar");
    expect(
      reviewState({ ...base, dataStatus: "desactualizado" }, "2026-12-01")
    ).toBe("desactualizado");
    expect(
      reviewState({ ...base, dataStatus: "pendiente_revision" }, "2026-12-01")
    ).toBe("pendiente");
    expect(reviewState({ ...base, content: "  " }, "2026-12-01")).toBe(
      "sin_datos"
    );
    expect(reviewState({ ...base, lastVerifiedOn: null }, "2026-12-01")).toBe(
      "pendiente"
    );
  });
});

describe("historial de cambios", () => {
  it("solo registra los campos que cambian", () => {
    expect(
      computeDiff(
        { name: "A", summary: null, countries: ["ES"] },
        { name: "A", summary: "Nuevo", countries: ["ES"] }
      )
    ).toEqual({
      summary: { from: null, to: "Nuevo" },
    });
    expect(computeDiff(null, { name: "A", website: undefined })).toEqual({
      name: { from: null, to: "A" },
    });
  });
});
