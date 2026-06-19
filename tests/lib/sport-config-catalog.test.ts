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
      "recreativo",
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
});
