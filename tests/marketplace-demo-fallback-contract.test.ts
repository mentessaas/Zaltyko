import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/app/api/marketplace/route.ts"),
  "utf8"
);

describe("fallback demo del marketplace", () => {
  it("no suplanta una búsqueda o filtro sin coincidencias", () => {
    expect(source).toContain("const normalizedSearch = search?.trim() || null;");
    expect(source).toContain("const hasCatalogueFilters");
    expect(source).toContain("!hasCatalogueFilters");
    expect(source).toContain("page === 1");
    expect(source).toContain("const shouldShowDemo");
  });
});
