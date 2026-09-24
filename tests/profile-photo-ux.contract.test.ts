import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("profile photo UX contract", () => {
  it("prevalidates images and explains the save step after upload", () => {
    const source = readFileSync("src/components/profiles/ProfileEditForm.tsx", "utf8");
    expect(source).toContain("acceptedTypes.has(file.type)");
    expect(source).toContain("file.size > 5 * 1024 * 1024");
    expect(source).toContain("Imagen subida. Pulsa «Guardar cambios»");
    expect(source).toContain('role="status"');
  });
});
