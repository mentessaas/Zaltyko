import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Super Admin academies table contract", () => {
  const source = readFileSync(
    "src/app/(super-admin)/super-admin/components/SuperAdminAcademiesTable.tsx",
    "utf8"
  );

  it("exposes an accessible detail action for every academy row", () => {
    expect(source).toContain("href={`/super-admin/academies/${academy.id}`}");
    expect(source).toContain("aria-label={`Ver detalle de ${academy.name ?? \"la academia\"}`}");
    expect(source).toContain("Selecciona <span className=\"font-semibold text-white/70\">Ver detalle</span>");
  });

  it("keeps the wide table usable on narrow screens instead of clipping actions", () => {
    expect(source).toContain('className="overflow-x-auto"');
    expect(source).toContain("table-fixed");
    expect(source).toContain("min-w-[820px]");
  });
});
