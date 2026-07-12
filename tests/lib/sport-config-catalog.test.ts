import { describe, expect, it } from "vitest";

import {
  filterSeedCodes,
  getSportConfigSeedByVariant,
  getSportConfigSeedsByCountry,
  SPORT_CONFIG_SEEDS,
} from "@/lib/sport-config/catalog";

describe("sport config catalog", () => {
  it("keeps Spain GAF, GAM and GR as isolated configurations", () => {
    const gaf = getSportConfigSeedByVariant("ES", "artistic_female");
    const gam = getSportConfigSeedByVariant("ES", "artistic_male");
    const gr = getSportConfigSeedByVariant("ES", "rhythmic");

    expect(gaf?.code).toBe("ES:artistic_female");
    expect(gam?.code).toBe("ES:artistic_male");
    expect(gr?.code).toBe("ES:rhythmic");
    expect(new Set(SPORT_CONFIG_SEEDS.map((config) => config.code)).size).toBe(SPORT_CONFIG_SEEDS.length);
  });

  it("returns branch-specific apparatus without leaking rhythmic apparatus into artistic", () => {
    const gaf = getSportConfigSeedByVariant("ES", "artistic_female");
    const gam = getSportConfigSeedByVariant("ES", "artistic_male");
    const gr = getSportConfigSeedByVariant("ES", "rhythmic");

    expect(gaf?.evaluation.apparatus.map((item) => item.code)).toEqual(["vt", "ub", "bb", "fx"]);
    expect(gam?.evaluation.apparatus.map((item) => item.code)).toEqual([
      "fx",
      "ph",
      "sr",
      "vt",
      "pb",
      "hb",
    ]);
    expect(gr?.evaluation.apparatus.map((item) => item.code)).toEqual([
      "free_hands",
      "rope",
      "hoop",
      "ball",
      "clubs",
      "ribbon",
    ]);

    expect(gaf?.evaluation.apparatus.some((item) => item.code === "ribbon")).toBe(false);
    expect(gr?.evaluation.apparatus.some((item) => item.code === "ub")).toBe(false);
  });

  it("keeps terminology and programs configurable per country discipline branch", () => {
    const gaf = getSportConfigSeedByVariant("ES", "artistic_female");
    const gr = getSportConfigSeedByVariant("ES", "rhythmic");

    expect(gaf?.terminology.group).toBe("Grupo");
    expect(gr?.terminology.group).toBe("Grupo de entrenamiento");
    expect(gr?.terminology.team).toBe("Conjunto");
    expect(gaf?.programs.map((program) => program.code)).toEqual([
      "base",
      "via_olimpica",
    ]);
    expect(gr?.programs.map((program) => program.code)).toEqual([
      "recreativo",
      "base",
      "absoluto",
      "escolar",
      "conjuntos",
      "individual",
    ]);
  });

  it("returns country-specific onboarding options", () => {
    expect(getSportConfigSeedsByCountry("es").map((config) => config.defaultDisciplineVariant)).toEqual([
      "artistic_female",
      "artistic_male",
      "rhythmic",
    ]);
    expect(getSportConfigSeedsByCountry("CO")).toEqual([]);
  });

  it("reflects the real RFEG 2026 level/category structure per branch (confirmed against official PDFs 2026-07-12)", () => {
    const gaf = getSportConfigSeedByVariant("ES", "artistic_female");
    const gam = getSportConfigSeedByVariant("ES", "artistic_male");
    const gr = getSportConfigSeedByVariant("ES", "rhythmic");

    // GAF: 10 niveles Base + 10 niveles Via Olimpica (antes: 3-4 niveles compartidos con GAM)
    expect(gaf?.levels.filter((l) => l.programCode === "base")).toHaveLength(10);
    expect(gaf?.levels.filter((l) => l.programCode === "via_olimpica")).toHaveLength(10);
    expect(gaf?.ageCategories.map((c) => c.code)).toEqual([
      "pre_benjamin", "benjamin", "pre_alevin", "alevin", "infantil",
      "pre_juvenil", "juvenil", "senior", "junior", "senior_elite",
    ]);

    // GAM: 5 niveles Base + 8 niveles Via Olimpica - estructura distinta a GAF, nunca debe coincidir
    expect(gam?.levels.filter((l) => l.programCode === "base")).toHaveLength(5);
    expect(gam?.levels.filter((l) => l.programCode === "via_olimpica")).toHaveLength(8);
    expect(gam?.ageCategories.map((c) => c.code)).toEqual([
      "benjamin", "alevin", "infantil", "cadete", "juvenil", "senior", "junior", "senior_elite",
    ]);
    expect(gam?.levels.map((l) => l.code)).not.toEqual(gaf?.levels.map((l) => l.code));

    // GR: categorias reales del Campeonato de España Individual 2026
    expect(gr?.ageCategories.map((c) => c.code)).toEqual([
      "benjamin", "alevin", "infantil", "junior", "senior",
      "primera_categoria", "junior_honor", "senior_honor", "master",
    ]);
  });

  it("sanitizes requested active codes against the selected seed", () => {
    const gr = getSportConfigSeedByVariant("ES", "rhythmic");

    expect(filterSeedCodes(gr?.programs ?? [], ["base", "unknown", "base"])).toEqual(["base"]);
    expect(filterSeedCodes(gr?.programs ?? [], [])).toEqual([
      "recreativo",
      "base",
      "absoluto",
      "escolar",
      "conjuntos",
      "individual",
    ]);
  });

  it("falls back to a marked generic config for a country without its own seed, never to Spain silently", () => {
    const mxRhythmic = getSportConfigSeedByVariant("MX", "rhythmic");
    const doArtisticFemale = getSportConfigSeedByVariant("DO", "artistic_female");

    expect(mxRhythmic).not.toBeNull();
    expect(mxRhythmic?.country.code).toBe("GENERIC");
    expect(mxRhythmic?.isGenericFallback).toBe(true);
    expect(mxRhythmic?.federation).toBe("");
    // No debe filtrarse terminología/config de la RFEG hacia un país sin catálogo propio.
    expect(mxRhythmic?.code).not.toContain("ES:");

    expect(doArtisticFemale?.country.code).toBe("GENERIC");
    expect(doArtisticFemale?.isGenericFallback).toBe(true);
  });

  it("never marks a real country seed (Spain) as generic fallback", () => {
    const gaf = getSportConfigSeedByVariant("ES", "artistic_female");
    const gam = getSportConfigSeedByVariant("ES", "artistic_male");
    const gr = getSportConfigSeedByVariant("ES", "rhythmic");

    expect(gaf?.isGenericFallback).toBeFalsy();
    expect(gam?.isGenericFallback).toBeFalsy();
    expect(gr?.isGenericFallback).toBeFalsy();
    expect(gaf?.federation).toBe("RFEG");
  });

  it("returns null only for a variant with no seed anywhere, not even generic", () => {
    expect(getSportConfigSeedByVariant("MX", "unknown_variant")).toBeNull();
  });
});
