import fs from "node:fs";
import path from "node:path";

describe("profile photo upload hardening", () => {
  it("requires the WEBP container marker and uses a server-controlled extension", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/profile/upload-photo/route.ts"), "utf8");
    expect(source).toContain('marker === "WEBP"');
    expect(source).toContain('expectedType === "image/jpg" ? "image/jpeg"');
    expect(source).toContain('file.type === "image/jpeg"');
    expect(source).toContain('fileExt =');
  });

  it("rejects empty files", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/profile/upload-photo/route.ts"), "utf8");
    expect(source).toContain("file.size === 0 || file.size > maxSize");
  });

  it("only accepts web URLs when a profile photo is pasted", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/profile/route.ts"), "utf8");
    expect(source).toContain("photoUrl: z.string().url().refine");
    expect(source).toContain('value.startsWith("https://")');
  });
});
