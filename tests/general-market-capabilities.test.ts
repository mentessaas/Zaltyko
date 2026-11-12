import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { generalMarketCoverageText } from "@/components/owner-dashboard/OwnerMarketCoverageNotice";
import {
  ADMINISTRATIVE_MARKET_REGISTRY,
  GENERAL_MARKET_COVERAGE_MESSAGE,
  OPERATIONAL_CURRENCIES,
  getAdministrativeMarketCapability,
  isFullAdministrativeMarket,
  resolveAdministrativeMarket,
} from "@/modules/organizations/domain/administrative-market-capabilities";
import {
  commercialMarketCheckoutNotice,
  isCommercialMarketLiveCheckoutEnabled,
} from "@/modules/organizations/domain/commercial-market-capabilities";
import {
  COUNTRY_OPTIONS,
  findCountryOption,
} from "@/modules/organizations/domain/country-catalog";

const VAGUE_PROMISES = /pronto|pr[oó]ximamente|en breve|\b20\d{2}\b|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i;

describe("catálogo de países del alta", () => {
  it("usa códigos ISO 3166-1 alfa-2 únicos con nombre en español y zonas IANA válidas", () => {
    expect(COUNTRY_OPTIONS.length).toBeGreaterThanOrEqual(240);
    const codes = COUNTRY_OPTIONS.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const country of COUNTRY_OPTIONS) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.name.trim().length, country.code).toBeGreaterThan(1);
      expect(country.timezones.length, country.code).toBeGreaterThan(0);
      for (const timezone of country.timezones) {
        expect(timezone, country.code).toMatch(/^[A-Z][A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/);
      }
    }
    // El servidor valida además cada zona con Intl (assertValidTimezone). Una
    // muestra estable, sin depender de la versión de tzdata del runtime.
    for (const timezone of ["Europe/Paris", "America/Bogota", "America/Argentina/Cordoba", "Asia/Tokyo", "Pacific/Auckland"]) {
      expect(() => new Intl.DateTimeFormat("es-ES", { timeZone: timezone }).format()).not.toThrow();
    }
    const names = COUNTRY_OPTIONS.map((country) => country.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es")));
    expect(findCountryOption("ES")?.name).toBe("España");
    expect(findCountryOption("MX")?.name).toBe("México");
    expect(findCountryOption("AR")?.name).toBe("Argentina");
    expect(findCountryOption("CI")?.name).toBe("Costa de Marfil");
    expect(findCountryOption("AQ")).toBeNull();
    expect(findCountryOption("ZZ")).toBeNull();
  });
});

describe("capacidades por mercado", () => {
  it("España y México conservan su registro completo", () => {
    expect(resolveAdministrativeMarket("ES")).toBe(ADMINISTRATIVE_MARKET_REGISTRY.ES);
    expect(resolveAdministrativeMarket("MX")).toBe(ADMINISTRATIVE_MARKET_REGISTRY.MX);
    expect(ADMINISTRATIVE_MARKET_REGISTRY.ES).toMatchObject({
      tier: "full",
      defaultCurrency: "EUR",
      currencies: ["EUR"],
      defaultTimezone: "Europe/Madrid",
      timezones: ["Europe/Madrid", "Atlantic/Canary"],
      sportCoverage: { mode: "discipline_identity" },
    });
    expect(ADMINISTRATIVE_MARKET_REGISTRY.MX).toMatchObject({
      tier: "full",
      defaultCurrency: "MXN",
      currencies: ["MXN"],
      timezoneRequired: true,
      sportCoverage: { mode: "general_identity_only" },
    });
    expect(isFullAdministrativeMarket("ES")).toBe(true);
    expect(isFullAdministrativeMarket("MX")).toBe(true);
    expect(isFullAdministrativeMarket("AR")).toBe(false);
  });

  it("el alta legacy sigue limitada a ES y MX", () => {
    expect(getAdministrativeMarketCapability("FR")).toBeNull();
    expect(getAdministrativeMarketCapability("AR")).toBeNull();
  });

  it("cualquier otro país recibe el nivel general con moneda a elegir y sus zonas", () => {
    const argentina = resolveAdministrativeMarket("AR");
    expect(argentina).toMatchObject({
      countryCode: "AR",
      label: "Argentina",
      tier: "general",
      selfServe: true,
      defaultCurrency: null,
      currencies: [...OPERATIONAL_CURRENCIES],
      defaultTimezone: null,
      timezoneRequired: true,
      sportCoverage: { mode: "general_country_identity" },
    });
    expect(argentina?.timezones).toContain("America/Argentina/Buenos_Aires");
    expect(argentina?.timezones).not.toContain("Europe/Madrid");

    expect(resolveAdministrativeMarket("FR")).toMatchObject({
      tier: "general",
      defaultTimezone: "Europe/Paris",
      timezones: ["Europe/Paris"],
      timezoneRequired: false,
    });
  });

  it("rechaza códigos fuera del catálogo y claves del prototipo", () => {
    for (const code of ["ZZ", "AQ", "es", "ESP", "", "toString", "__proto__", "constructor"]) {
      expect(resolveAdministrativeMarket(code), code).toBeNull();
    }
  });
});

describe("copy honesto del nivel general", () => {
  it("dice que lo específico del país llega más adelante, sin fechas ni promesas de funciones ya hechas", () => {
    for (const text of [
      GENERAL_MARKET_COVERAGE_MESSAGE,
      generalMarketCoverageText({ label: "Argentina" }),
      commercialMarketCheckoutNotice("AR", "Argentina") ?? "",
    ]) {
      expect(text).toContain("más adelante");
      expect(text).not.toMatch(VAGUE_PROMISES);
    }
    expect(GENERAL_MARKET_COVERAGE_MESSAGE).toContain(
      "federación, competiciones, cobros locales y facturación"
    );
    expect(generalMarketCoverageText({ label: "Argentina" })).toContain(
      "Tu academia está en Argentina"
    );
    expect(generalMarketCoverageText({ label: "Argentina" })).toContain(
      "nos centramos en España y México"
    );
  });

  it("la pantalla del plan solo avisa donde la contratación no está abierta y no abre ningún cobro", () => {
    expect(isCommercialMarketLiveCheckoutEnabled("ES")).toBe(true);
    expect(isCommercialMarketLiveCheckoutEnabled("MX")).toBe(false);
    expect(isCommercialMarketLiveCheckoutEnabled("AR")).toBe(false);
    expect(commercialMarketCheckoutNotice("ES", "España")).toBeNull();
    expect(commercialMarketCheckoutNotice("FR", "Francia")).toContain(
      "academias de Francia todavía no está disponible"
    );
    expect(commercialMarketCheckoutNotice("FR", "Francia")).toContain("plan Free");
    expect(commercialMarketCheckoutNotice("MX", "México")).not.toBeNull();
  });
});
