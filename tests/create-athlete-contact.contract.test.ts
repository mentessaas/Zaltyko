import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("create athlete contact contract", () => {
  it("permite completar una relación personalizada cuando se elige Otro", () => {
    const source = readFileSync("src/components/athletes/CreateAthleteDialog.tsx", "utf8");
    expect(source).toContain("!RELATIONSHIP_OPTIONS.includes(contact.relationship as any)");
    expect(source).toContain("Especifica la relación *");
    expect(source).toContain("Relación personalizada del contacto");
  });
});
