import { describe, expect, it } from "vitest";
import { getCurrencyForCountry } from "@/lib/currency";

describe("international academy currency", () => {
  it.each([
    ["BR", "BRL"], ["Brasil", "BRL"], ["CA", "CAD"], ["Canada", "CAD"],
    ["GB", "GBP"], ["Australia", "AUD"], ["JP", "JPY"], ["ES", "EUR"],
  ])("maps %s to %s", (country, expected) => {
    expect(getCurrencyForCountry(country)).toBe(expected);
  });
});
