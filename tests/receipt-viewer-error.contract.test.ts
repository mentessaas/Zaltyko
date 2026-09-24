import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/billing/ReceiptViewer.tsx", import.meta.url), "utf8");

describe("receipt viewer error UX contract", () => {
  it("distinguishes an empty history from a failed load", () => {
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain("setLoadError(true)");
    expect(source).toContain("No pudimos cargar los recibos.");
    expect(source).toContain("Reintentar");
    expect(source).toContain('role="alert"');
  });
});
