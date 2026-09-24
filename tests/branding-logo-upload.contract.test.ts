import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical branding logo upload", () => {
  it("expone subida de logo en los ajustes que usan las academias modernas", () => {
    const editor = fs.readFileSync(path.join(process.cwd(), "src/components/settings/BrandingEditor.tsx"), "utf8");
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/app/[academyId]/settings/page.tsx"), "utf8");
    expect(editor).toContain("academyId: string");
    expect(editor).toContain('body.append("folder", "academy-logo")');
    expect(editor).toContain('fetch("/api/upload", { method: "POST", body })');
    expect(editor).toContain('role="alert"');
    expect(page).toContain("academyId={context.academyId}");
  });
});
