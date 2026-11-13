import { describe, expect, it } from "vitest";

import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";
import {
  isSpanishTaxTerritory,
  spanishTaxTerritoryCheckoutNotice,
  SPANISH_TAX_TERRITORIES,
} from "@/modules/organizations/domain/commercial-market-capabilities";
import {
  checkoutSessionMatchesSpanishVat,
  formatEuroCentsExact,
  quoteSpanishVat,
  resolveSaasCheckoutTaxPlan,
} from "@/modules/saas-billing/domain/spanish-vat";

const euros = (cents: number) => formatEuroCentsExact(cents).replace(/\s/gu, " ");

describe("IVA general del 21 % sobre los precios base aprobados", () => {
  it("mantiene los precios base sin IVA del catálogo", () => {
    expect(PRODUCT_PLAN_BY_CODE.pro.priceEurCents).toBe(1900);
    expect(PRODUCT_PLAN_BY_CODE.pro.annualPriceEurCents).toBe(19000);
    expect(PRODUCT_PLAN_BY_CODE.premium.priceEurCents).toBe(4900);
    expect(PRODUCT_PLAN_BY_CODE.premium.annualPriceEurCents).toBe(49000);
  });

  it.each([
    ["Starter mensual", 1900, 399, 2299, "22,99 €"],
    ["Starter anual", 19000, 3990, 22990, "229,90 €"],
    ["Growth mensual", 4900, 1029, 5929, "59,29 €"],
    ["Growth anual", 49000, 10290, 59290, "592,90 €"],
  ])("%s: base %i + IVA %i = %i (%s)", (_plan, base, tax, total, label) => {
    expect(quoteSpanishVat(base)).toEqual({
      baseCents: base,
      taxCents: tax,
      totalCents: total,
      ratePercent: 21,
    });
    expect(euros(total)).toBe(label);
  });

  it("rechaza bases que no son céntimos enteros", () => {
    expect(() => quoteSpanishVat(19.5)).toThrow(RangeError);
    expect(() => quoteSpanishVat(-1)).toThrow(RangeError);
  });
});

describe("contrato fiscal de Checkout", () => {
  const base = {
    environment: "live" as const,
    countryCode: "ES",
    taxTerritory: "peninsula_baleares" as const,
    taxRateReference: "txr_synthetic",
    frozenQaExperiment: false,
  };

  it("aplica el Tax Rate de IVA a Península y Baleares en Live y en test", () => {
    for (const environment of ["live", "test"] as const) {
      expect(resolveSaasCheckoutTaxPlan({ ...base, environment })).toEqual({
        kind: "es_vat_general",
        taxRateReference: "txr_synthetic",
      });
    }
  });

  it.each(["canarias", "ceuta", "melilla"] as const)(
    "rechaza la contratación con sede fiscal en %s",
    (territory) => {
      for (const environment of ["live", "test"] as const) {
        expect(
          resolveSaasCheckoutTaxPlan({ ...base, environment, taxTerritory: territory })
        ).toEqual({ kind: "territory_not_covered", territory });
      }
    }
  );

  it("exige el territorio fiscal a las academias de España", () => {
    expect(resolveSaasCheckoutTaxPlan({ ...base, taxTerritory: null })).toEqual({
      kind: "territory_required",
    });
    expect(resolveSaasCheckoutTaxPlan({ ...base, taxTerritory: undefined })).toEqual({
      kind: "territory_required",
    });
  });

  it("no abre Live sin Tax Rate configurado ni fuera de España", () => {
    expect(resolveSaasCheckoutTaxPlan({ ...base, taxRateReference: null })).toEqual({
      kind: "configuration_unavailable",
    });
    expect(resolveSaasCheckoutTaxPlan({ ...base, taxRateReference: "  " })).toEqual({
      kind: "configuration_unavailable",
    });
    for (const countryCode of ["MX", "FR", "PT", "ZZ", ""]) {
      expect(resolveSaasCheckoutTaxPlan({ ...base, countryCode })).toEqual({
        kind: "market_not_covered",
      });
    }
  });

  it("conserva el recorrido de test anterior y el ensayo QA congelado sin impuesto", () => {
    expect(
      resolveSaasCheckoutTaxPlan({ ...base, environment: "test", taxRateReference: null, taxTerritory: null })
    ).toEqual({ kind: "none" });
    expect(
      resolveSaasCheckoutTaxPlan({ ...base, environment: "test", countryCode: "MX", taxTerritory: null })
    ).toEqual({ kind: "none" });
    expect(
      resolveSaasCheckoutTaxPlan({ ...base, environment: "test", frozenQaExperiment: true })
    ).toEqual({ kind: "none" });
    // El ensayo congelado no existe en Live: allí rige el contrato completo.
    expect(
      resolveSaasCheckoutTaxPlan({ ...base, frozenQaExperiment: true, taxRateReference: null })
    ).toEqual({ kind: "configuration_unavailable" });
  });

  it("solo acepta una sesión de Stripe que cobra exactamente base + IVA", () => {
    const quote = quoteSpanishVat(1900);
    const taxed = {
      amount_subtotal: 1900,
      amount_total: 2299,
      total_details: { amount_tax: 399, amount_discount: 0 },
    };
    expect(checkoutSessionMatchesSpanishVat(taxed, quote)).toBe(true);
    expect(checkoutSessionMatchesSpanishVat({ ...taxed, amount_total: 1900, total_details: { amount_tax: 0 } }, quote)).toBe(false);
    expect(checkoutSessionMatchesSpanishVat({ ...taxed, amount_total: 2280, total_details: { amount_tax: 380 } }, quote)).toBe(false);
    expect(checkoutSessionMatchesSpanishVat({ ...taxed, total_details: { amount_tax: 399, amount_discount: 100 } }, quote)).toBe(false);
    expect(checkoutSessionMatchesSpanishVat({}, quote)).toBe(false);
  });
});

describe("aviso de territorio no cubierto", () => {
  it("explica que Canarias, Ceuta y Melilla siguen en Free sin prometer fechas", () => {
    expect(spanishTaxTerritoryCheckoutNotice("peninsula_baleares")).toBeNull();
    for (const territory of ["canarias", "ceuta", "melilla"] as const) {
      const notice = spanishTaxTerritoryCheckoutNotice(territory)!;
      expect(notice).toContain("todavía no está disponible");
      expect(notice).toContain("plan Free");
      expect(notice).not.toMatch(/pronto|pr[oó]ximamente|en breve|\b20\d{2}\b/i);
    }
  });

  it("solo reconoce los cuatro territorios fiscales", () => {
    expect(SPANISH_TAX_TERRITORIES).toEqual(["peninsula_baleares", "canarias", "ceuta", "melilla"]);
    expect(isSpanishTaxTerritory("peninsula_baleares")).toBe(true);
    expect(isSpanishTaxTerritory("baleares")).toBe(false);
    expect(isSpanishTaxTerritory(null)).toBe(false);
  });
});
