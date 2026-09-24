import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("international currency display contract", () => {
  it("uses the academy currency for family pending totals without mixing currencies", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/my-dashboard/MyDashboardPage.tsx"),
      "utf8",
    );

    expect(source).toContain("pendingTotalsByCurrency");
    expect(source).toContain("formatMinorCurrency(pendingTotals[0][1], pendingTotals[0][0])");
    expect(source).not.toContain('currency: "EUR"');
  });

  it("uses the academy country for event registration fees", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/events/[eventId]/register/page.tsx"),
      "utf8",
    );

    expect(source).toContain("getCurrencyForCountry(event.academyCountry)");
    expect(source).toContain("formatMinorCurrency");
    expect(source).not.toContain('currency: "EUR"');
  });

  it("does not hardcode EUR in campaign discount labels", () => {
    const source = readFileSync(join(process.cwd(), "src/components/billing/CampaignManager.tsx"), "utf8");

    expect(source).toContain("getCurrencyForCountry(academyCountry)");
    expect(source).toContain("formatCurrency(discount.discountValue, currency)");
    expect(source).not.toContain("discount.discountValue} EUR");
  });

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
