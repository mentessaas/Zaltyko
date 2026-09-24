import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("profile language availability contract", () => {
  it("does not present untranslated languages as selectable", () => {
    const source = readFileSync(
      new URL("../src/components/profiles/UserPreferencesForm.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('disabled={lang.value !== "es"}');
    expect(source).toContain("(próximamente)");
    expect(source).toContain('aria-describedby="language-help"');
    expect(source).toContain("La interfaz está disponible ahora en español.");
  });
});
