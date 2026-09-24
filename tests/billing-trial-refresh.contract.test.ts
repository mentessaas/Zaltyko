import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("billing trial refresh", () => {
  it("actualiza el resumen tras iniciar la prueba sin recargar la página", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/billing/BillingPanel.tsx"),
      "utf8"
    );
    expect(source).toContain("const loadSummary = useCallback");
    expect(source).toContain("await loadSummary();");
    expect(source).not.toContain("window.location.reload()");
  });
});
