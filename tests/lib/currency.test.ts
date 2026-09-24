import { describe, expect, it } from "vitest";

import { formatCurrency, getCurrencyForCountry } from "@/lib/currency";

describe("currency helpers", () => {
  it("resolves country codes and localized country names", () => {
    expect(getCurrencyForCountry("MX")).toBe("MXN");
    expect(getCurrencyForCountry("Colombia")).toBe("COP");
    expect(getCurrencyForCountry("ES")).toBe("EUR");
  });

  it("formats a monetary value with the academy currency", () => {
    expect(formatCurrency(1234.5, "MXN", "es-MX")).toContain("1,234.50");
    expect(formatCurrency(1234.5, "COP", "es-CO")).toContain("1.234,5");
  });
});
