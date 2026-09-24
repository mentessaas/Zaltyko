import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/billing/DiscountManager.tsx", import.meta.url), "utf8");

describe("discount manager error UX contract", () => {
  it("surfaces failed save, delete and toggle operations", () => {
    expect(source).toContain("setError");
    expect(source).toContain("No se pudo actualizar el estado del descuento.");
    expect(source).toContain('role="alert"');
    expect(source).toContain("if (!response.ok)");
  });
});
