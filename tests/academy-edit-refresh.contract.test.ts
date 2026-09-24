import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("academy edit refresh", () => {
  it("refresca el workspace sin recarga completa tras guardar", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/academies/AcademyEditSection.tsx"),
      "utf8"
    );
    expect(source).toContain('import { useRouter } from "next/navigation"');
    expect(source).toContain("router.refresh();");
    expect(source).not.toContain("window.location.reload()");
  });
});
