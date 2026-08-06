import { describe, expect, it } from "vitest";

import {
  isCategoryCodeAllowed,
  isLevelCodeAllowed,
  isProgramCodeAllowed,
  normalizeApparatusCodes,
} from "@/lib/sport-config/validation";

const gafConfig = {
  programs: [
    { code: "recreativo" },
    { code: "base" },
    { code: "via_olimpica" },
  ],
  levels: [
    { code: "base_1", programCode: "base" },
    { code: "vo_1", programCode: "via_olimpica" },
  ],
  categories: [{ code: "infantil" }, { code: "junior" }],
  apparatus: [
    { code: "vt", name: "Salto", shortName: null },
    { code: "ub", name: "Paralelas asimétricas", shortName: null },
    { code: "bb", name: "Barra de equilibrio", shortName: null },
    { code: "fx", name: "Suelo", shortName: null },
  ],
};

const rhythmicConfig = {
  programs: [
    { code: "recreativo" },
    { code: "base" },
    { code: "conjuntos" },
    { code: "individual" },
  ],
  levels: [
    { code: "alevin", programCode: "base" },
    { code: "conjunto_base", programCode: "conjuntos" },
  ],
  categories: [{ code: "alevin" }, { code: "infantil" }],
  apparatus: [
    { code: "free_hands", name: "Manos libres", shortName: null },
    { code: "hoop", name: "Aro", shortName: null },
    { code: "ball", name: "Pelota", shortName: null },
    { code: "ribbon", name: "Cinta", shortName: null },
  ],
};

describe("sport config validation", () => {
  it("rejects programs from another branch", () => {
    expect(isProgramCodeAllowed(gafConfig, "base")).toBe(true);
    expect(isProgramCodeAllowed(gafConfig, "conjuntos")).toBe(false);
    expect(isProgramCodeAllowed(rhythmicConfig, "conjuntos")).toBe(true);
    expect(isProgramCodeAllowed(rhythmicConfig, "via_olimpica")).toBe(false);
  });

  it("keeps levels scoped to the selected program", () => {
    expect(isLevelCodeAllowed(gafConfig, "base_1", "base")).toBe(true);
    expect(isLevelCodeAllowed(gafConfig, "base_1", "via_olimpica")).toBe(false);
    expect(isLevelCodeAllowed(rhythmicConfig, "conjunto_base", "conjuntos")).toBe(true);
    expect(isLevelCodeAllowed(rhythmicConfig, "conjunto_base", "individual")).toBe(false);
  });

  it("rejects categories and apparatus that are not in the selected config", () => {
    expect(isCategoryCodeAllowed(gafConfig, "junior")).toBe(true);
    expect(isCategoryCodeAllowed(gafConfig, "alevin")).toBe(false);

    expect(normalizeApparatusCodes(gafConfig, ["Salto", "fx"])).toEqual({
      ok: true,
      codes: ["vt", "fx"],
    });
    expect(normalizeApparatusCodes(gafConfig, ["ribbon"])).toEqual({
      ok: false,
      invalid: ["ribbon"],
    });
    expect(normalizeApparatusCodes(rhythmicConfig, ["Cinta"])).toEqual({
      ok: true,
      codes: ["ribbon"],
    });
    expect(normalizeApparatusCodes(rhythmicConfig, ["ub"])).toEqual({
      ok: false,
      invalid: ["ub"],
    });
  });

  it("supports active code lists for academy-level overrides", () => {
    const activeOnly = {
      activeProgramCodes: ["base"],
      activeApparatusCodes: ["vt", "fx"],
    };

    expect(isProgramCodeAllowed(activeOnly, "base")).toBe(true);
    expect(isProgramCodeAllowed(activeOnly, "via_olimpica")).toBe(false);
    expect(normalizeApparatusCodes(activeOnly, ["vt", "ribbon"])).toEqual({
      ok: false,
      invalid: ["ribbon"],
    });
  });
});
