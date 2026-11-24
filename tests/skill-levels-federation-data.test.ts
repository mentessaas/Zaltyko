import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import gaf from "@/modules/skill-levels/data/federation/rfeg-2026/gaf.json";
import gam from "@/modules/skill-levels/data/federation/rfeg-2026/gam.json";
import {
  isFederationLevelTemplatesFlagOn,
  MAX_ELEMENTS_PER_LEVEL,
  MAX_ELEMENTS_PER_TEMPLATE,
  SKILL_APPARATUS_BY_DISCIPLINE,
} from "@/modules/skill-levels/domain/skill-levels";

const files = [gaf, gam];
const sourceTextPaths = [
  process.env.RFEG_GAF_TEXT_PATH,
  process.env.RFEG_GAM_TEXT_PATH,
];
const catalogRoot = join(process.cwd(), "src/modules/element-library/data");
const catalogElements = new Map<string, { discipline: string; apparatus: string }>();
function collectCatalogKeys(directory: string, discipline: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const childDiscipline = entry.name.includes("fig-wag") ? "artistic_female"
        : entry.name.includes("fig-mag") ? "artistic_male" : discipline;
      collectCatalogKeys(path, childDiscipline);
    }
    else if (entry.name.endsWith(".json")) {
      const content = JSON.parse(readFileSync(path, "utf8")) as { elements?: Array<{ elementKey?: string }> };
      const apparatus = entry.name.replace(/\.json$/, "");
      for (const element of content.elements ?? []) {
        if (element.elementKey) catalogElements.set(element.elementKey, { discipline, apparatus });
      }
    }
  }
}
collectCatalogKeys(catalogRoot, "");

describe("plantillas federativas RFEG 2026", () => {
  it("tiene niveles ordenados y páginas dentro de cada documento", () => {
    expect(gaf.levels.map((level) => level.name)).toEqual(Array.from({ length: 10 }, (_, index) => `Nivel Base ${index + 1}`));
    expect(gam.levels.map((level) => level.name)).toEqual(Array.from({ length: 5 }, (_, index) => `Base ${index + 1}`));
    for (const file of files) {
      const maxPage = file.key.includes("gaf") ? 26 : 60;
      expect(file.federation).toBe("RFEG");
      expect(file.edition).toBe("rfeg-2026");
      expect(file.documentDate).toBe("2025-09-26");
      expect(file.consultedOn).toBe("2026-11-24");
      expect(file.sourceUrl).toBeNull();
      expect(file.validThrough).toBe("2026-12-31");
      expect(file.sportProfileVersion).toBe("rfeg-2026-v2");
      expect(file.levels.reduce((total, level) => total + level.requirements.length, 0))
        .toBeLessThanOrEqual(MAX_ELEMENTS_PER_TEMPLATE);
      for (const level of file.levels) {
        expect(level.page).toBeGreaterThan(0);
        expect(level.page).toBeLessThanOrEqual(maxPage);
        expect(level.requirements.length).toBeGreaterThan(0);
        expect(level.requirements.length, `${file.key}/${level.name}`).toBeLessThanOrEqual(MAX_ELEMENTS_PER_LEVEL);
        expect(new Set(level.requirements.map((requirement) => requirement.apparatus)))
          .toEqual(new Set(SKILL_APPARATUS_BY_DISCIPLINE[file.discipline]));
        for (const requirement of level.requirements) {
          expect(requirement.fact).not.toMatch(/La ficha (enumera|organiza|estructura)/i);
          expect(requirement.fact).not.toMatch(/^Secci[oó]n(?:es)?\s/i);
          expect(requirement.fact).not.toMatch(/\bseguido de\b|en este orden|coreograf[ií]a completa|consecutivas?|al iniciar el tercer vuelo|antes de la salida|serie de dos elementos/i);
          expect(requirement.fact.trim().length).toBeGreaterThan(2);
          expect(requirement.sourceApparatus).toBeTruthy();
          expect(requirement.page).toBeGreaterThan(0);
          expect(requirement.page).toBeLessThanOrEqual(maxPage);
          if (requirement.elementKey) {
            const catalogMatch = catalogElements.get(requirement.elementKey);
            expect(catalogMatch).toBeDefined();
            expect(catalogMatch?.discipline).toBe(file.discipline);
            expect(catalogMatch?.apparatus).toBe(requirement.apparatus);
          }
        }
      }
    }
    expect(gam.levels.slice(0, 2).flatMap((level) => level.requirements)
      .filter((requirement) => requirement.sourceApparatus.startsWith("Seta"))
      .every((requirement) => requirement.apparatus === "pommel_horse")).toBe(true);
    expect(files.flatMap((file) => file.levels.flatMap((level) => level.requirements))
      .filter((requirement) => requirement.elementKey).length).toBeGreaterThan(0);
  });

  it("mantiene la importación apagada por defecto", () => {
    expect(isFederationLevelTemplatesFlagOn({})).toBe(false);
    expect(isFederationLevelTemplatesFlagOn({ ZALTYKO_FEDERATION_LEVEL_TEMPLATES_ENABLED: "false" })).toBe(false);
    expect(isFederationLevelTemplatesFlagOn({ ZALTYKO_FEDERATION_LEVEL_TEMPLATES_ENABLED: "true" })).toBe(true);
  });

  it("cita páginas existentes y no contiene secuencias de ocho palabras del texto oficial local", (context) => {
    if (sourceTextPaths.some((path) => !path)) return context.skip();
    const paths = sourceTextPaths as [string, string];
    if (!paths.every(existsSync)) {
      throw new Error("Las rutas de extracción RFEG configuradas deben existir.");
    }
    const pdfWords = new Set<string>();
    const pageCounts = paths.map((path) => {
      const pages = readFileSync(path, "utf8").split("\f");
      return pages.length - (pages.at(-1)?.trim() ? 0 : 1);
    });
    for (const path of paths) {
      const words = readFileSync(path, "utf8").toLocaleLowerCase("es").match(/[\p{L}\p{N}]+/gu) ?? [];
      for (let index = 0; index <= words.length - 8; index += 1) pdfWords.add(words.slice(index, index + 8).join(" "));
    }
    const collectStrings = (value: unknown): string[] => {
      if (typeof value === "string") return [value];
      if (Array.isArray(value)) return value.flatMap(collectStrings);
      if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
      return [];
    };
    for (const file of files) {
      const sourceIndex = file.discipline === "artistic_female" ? 0 : 1;
      for (const phrase of collectStrings(file)) {
        const words = phrase.toLocaleLowerCase("es").match(/[\p{L}\p{N}]+/gu) ?? [];
        for (let index = 0; index <= words.length - 8; index += 1) {
          expect(pdfWords.has(words.slice(index, index + 8).join(" "))).toBe(false);
        }
      }
      for (const level of file.levels) {
        expect(level.page).toBeLessThanOrEqual(pageCounts[sourceIndex]);
        for (const requirement of level.requirements) {
          expect(requirement.page).toBeLessThanOrEqual(pageCounts[sourceIndex]);
        }
      }
    }
  });
});
