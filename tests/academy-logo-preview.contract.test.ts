import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("academy logo preview", () => {
  it("confirma el estado del logo en la ficha, también cuando falta", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/academies/AcademyEditSection.tsx"),
      "utf8"
    );
    expect(source).toContain("Logo público configurado");
    expect(source).toContain("Logo de ${academy.name}");
    expect(source).toContain("Añade un logo para que las familias reconozcan tu academia");
  });
});
