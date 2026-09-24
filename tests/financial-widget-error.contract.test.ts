import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/dashboard/FinancialMetricsWidget.tsx", import.meta.url), "utf8");

describe("financial metrics error UX contract", () => {
  it("does not silently disappear when metrics fail", () => {
    expect(source).toContain("setError(true)");
    expect(source).toContain("No pudimos cargar las métricas financieras.");
    expect(source).toContain("Reintentar");
    expect(source).toContain('role="alert"');
  });
});
