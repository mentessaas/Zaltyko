import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CITY_COUNTRY_CODES,
  findCitiesByRegionAsync,
  findLoadedCitiesByRegion,
  getLoadedCities,
  loadCities,
} from "@/lib/geo-loader";

const root = process.cwd();
const citiesDir = join(root, "src", "data", "geo", "cities");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

describe("city lists load per country on demand", () => {
  it("has exactly one lazy loader per country JSON file", () => {
    const files = readdirSync(citiesDir).filter(name => name.endsWith(".json")).map(name => name.slice(0, -5)).sort();
    expect([...CITY_COUNTRY_CODES].sort()).toEqual(files);
    expect(files.length).toBeGreaterThanOrEqual(21);
  });

  it("never imports a country list statically, so no bundle carries every country", () => {
    const offenders = sourceFiles(join(root, "src")).flatMap(file => {
      const source = readFileSync(file, "utf8");
      const repoPath = relative(root, file).split(sep).join("/");
      const staticImport = /(?:^|\n)\s*import[^;()]*?from\s*["'][^"']*data\/geo\/cities[^"']*["']/.test(source);
      const required = /require\(\s*["'][^"']*data\/geo\/cities/.test(source);
      const dynamicOutsideLoader = repoPath !== "src/lib/geo-loader.ts" && /import\(\s*["'][^"']*data\/geo\/cities/.test(source);
      return staticImport || required || dynamicOutsideLoader ? [repoPath] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("loads a country once, caches it and answers region lookups", async () => {
    expect(findLoadedCitiesByRegion("es", "andalucia")).toEqual([]);
    const first = await loadCities("ES");
    const second = await loadCities("es");
    expect(second).toBe(first);
    expect(getLoadedCities("es")).toBe(first);
    expect(findLoadedCitiesByRegion("es", "andalucia")).toContainEqual({ value: "almeria", label: "Almería" });
    expect(await findCitiesByRegionAsync("mx", "jal")).not.toHaveLength(0);
  });

  it("answers unknown countries, regions and empty selections with an empty list", async () => {
    expect(await loadCities("zz")).toEqual({});
    expect(await loadCities("__proto__")).toEqual({});
    expect(await findCitiesByRegionAsync("es", "no-existe")).toEqual([]);
    expect(await findCitiesByRegionAsync("es", "")).toEqual([]);
    expect(await findCitiesByRegionAsync(null, "andalucia")).toEqual([]);
  });
});
