import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("academy logo upload UX", () => {
  it("permite subir un logo con el mismo flujo seguro de imágenes y verlo antes de guardar", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/academies/AcademyEditForm.tsx"),
      "utf8"
    );
    expect(source).toContain('body.append("academyId", academy.id)');
    expect(source).toContain('body.append("folder", "academy-logo")');
    expect(source).toContain('fetch("/api/upload", { method: "POST", body })');
    expect(source).toContain('alt="Vista previa del logo de la academia"');
    expect(source).toContain("file.size === 0 || file.size > 5 * 1024 * 1024");
    expect(source).toContain("dark:bg-red-950/30 dark:text-red-200");
    expect(source).toContain('role="alert" aria-live="assertive"');
  });
});
