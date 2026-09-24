import fs from "node:fs";
import path from "node:path";

describe("profile edit upload UX", () => {
  it("rejects empty images and exposes actionable feedback", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/profiles/ProfileEditForm.tsx"), "utf8");
    expect(source).toContain("file.size === 0 || file.size > 5 * 1024 * 1024");
    expect(source).toContain('role="alert" aria-live="assertive"');
    expect(source).toContain('aria-label="Quitar foto de perfil"');
  });
});
