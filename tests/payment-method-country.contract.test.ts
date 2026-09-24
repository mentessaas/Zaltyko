import { describe, expect, it } from "vitest";
import { isBizumAvailableInCountry } from "@/lib/currency";

describe("country-aware payment methods", () => {
  it("only exposes Bizum where it is a relevant rail", () => {
    expect(isBizumAvailableInCountry("ES")).toBe(true);
    expect(isBizumAvailableInCountry("España")).toBe(true);
    expect(isBizumAvailableInCountry("MX")).toBe(false);
    expect(isBizumAvailableInCountry("BR")).toBe(false);
  });
});
