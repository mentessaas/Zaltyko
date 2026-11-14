import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("international currency display contract", () => {



  it("uses academy country for event cards and category fees", () => {
    const eventCard = readFileSync(join(process.cwd(), "src/components/events/EventCard.tsx"), "utf8");
    const categories = readFileSync(join(process.cwd(), "src/components/events/EventCategoriesList.tsx"), "utf8");
    const landingCard = readFileSync(join(process.cwd(), "src/components/landing/EventCard.tsx"), "utf8");

    expect(eventCard).toContain("formatPrice(event.registrationFee, event.countryName)");
    expect(categories).toContain("formatPrice(category.registrationFee, countryName)");
    expect(landingCard).toContain("getCurrencyForCountry(event.countryName)");
    expect(eventCard).not.toContain("toFixed(2)} €");
    expect(categories).not.toContain("toFixed(2)} €");
  });

  it("allows promo-code totals to use the academy currency", () => {
    const source = readFileSync(join(process.cwd(), "src/components/billing/PromoCodeValidator.tsx"), "utf8");

    expect(source).toContain("currency?: string");
    expect(source).toContain("formatCurrency(result.discount.finalAmount, currency)");
    expect(source).not.toContain("finalAmount.toFixed(2)} EUR");
  });
});
