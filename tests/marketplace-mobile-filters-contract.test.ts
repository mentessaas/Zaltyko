import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/marketplace/MarketplaceFilters.tsx"),
  "utf8"
);
const pageSource = readFileSync(
  join(process.cwd(), "src/app/(public)/marketplace/page.tsx"),
  "utf8"
);

describe("filtros del marketplace en móvil", () => {
  it("ofrece un disclosure móvil y conserva el panel completo en escritorio", () => {
    expect(source).toContain("<details className=\"group");
    expect(source).toContain("lg:hidden");
    expect(source).toContain("hidden lg:block");
    expect(source).toContain("Filtrar catálogo");
    expect(source).toContain("activeFilterCount");
  });

  it("mantiene semántica de grupos y selección múltiple", () => {
    expect(source).toContain("<fieldset className=\"space-y-2\">");
    expect(source).toContain("<legend");
    expect(source).toContain("selectedTypes.forEach");
    expect(source).toContain("selectedCategories.forEach");
    expect(source).toContain("Limpiar filtros");
  });

  it("comunica el resultado y ofrece recuperación cuando no hay coincidencias", () => {
    expect(pageSource).toContain("aria-live=\"polite\"");
    expect(pageSource).toContain("No encontramos resultados");
    expect(pageSource).toContain("Ver todo el marketplace");
  });

  it("serializa categorías y tipos repetidos sin convertirlos en una cadena inválida", () => {
    expect(pageSource).toContain("type?: string | string[]");
    expect(pageSource).toContain("for (const category of asQueryValues(searchParams.category)) params.append(\"category\", category);");
    expect(pageSource).toContain("for (const type of asQueryValues(searchParams.type)) params.append(\"type\", type);");
    expect(pageSource).not.toContain("params.set(\"category\", searchParams.category)");
    expect(pageSource).not.toContain("params.set(\"type\", searchParams.type)");
  });
});
