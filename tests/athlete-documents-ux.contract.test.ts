import fs from "node:fs";
import path from "node:path";

describe("athlete documents list", () => {
  it("keeps document statuses readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/athletes/AthleteDocumentsList.tsx"), "utf8");
    expect(source).toContain("dark:bg-green-950/40 dark:text-green-300");
    expect(source).toContain("dark:bg-red-950/40 dark:text-red-300");
    expect(source).toContain("dark:bg-yellow-950/40 dark:text-yellow-300");
  });

  it("labels document actions for keyboard and screen-reader users", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/athletes/AthleteDocumentsList.tsx"), "utf8");
    expect(source).toContain('aria-label={`Descargar');
    expect(source).toContain('aria-label="Eliminar documento"');
    expect(source).toContain('type="button"');
  });
});
