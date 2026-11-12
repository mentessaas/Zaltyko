import { findCountryOption } from "@/modules/organizations/domain/country-catalog";

/** Mercados completos: con funciones específicas de su país y disciplina. */
export type AdministrativeMarketCode = "ES" | "MX";

/**
 * `full`: España y México, con sus capacidades revisadas.
 * `general`: cualquier otro país del catálogo; funciones generales de gestión
 * y ninguna regla, cobro ni facturación específicos de su país (decisión de
 * producto del 12-11-2026: el alta es abierta y lo local llega más adelante).
 */
export type AdministrativeMarketTier = "full" | "general";

export type SportCoverageMode =
  | "discipline_identity"
  | "general_identity_only"
  | "general_country_identity";

/** Monedas en las que hoy se registran cuotas. No hay conversión entre ellas. */
export const OPERATIONAL_CURRENCIES = ["EUR", "MXN"] as const;
export type OperationalCurrency = (typeof OPERATIONAL_CURRENCIES)[number];

export const OPERATIONAL_CURRENCY_LABELS: Record<OperationalCurrency, string> = {
  EUR: "Euro (EUR)",
  MXN: "Peso mexicano (MXN)",
};

export interface AdministrativeMarketCapability {
  countryCode: string;
  label: string;
  tier: AdministrativeMarketTier;
  selfServe: true;
  /** null: la academia debe elegir la moneda de forma explícita. */
  defaultCurrency: OperationalCurrency | null;
  currencies: readonly OperationalCurrency[];
  defaultTimezone: string | null;
  timezones: readonly string[];
  timezoneRequired: boolean;
  sportCoverage: {
    mode: SportCoverageMode;
    message: string;
  };
}

export const ADMINISTRATIVE_MARKET_REGISTRY = {
  ES: {
    countryCode: "ES",
    label: "España",
    tier: "full",
    selfServe: true,
    defaultCurrency: "EUR",
    currencies: ["EUR"],
    defaultTimezone: "Europe/Madrid",
    timezones: ["Europe/Madrid", "Atlantic/Canary"],
    timezoneRequired: false,
    sportCoverage: {
      mode: "discipline_identity",
      message:
        "La academia puede elegir artística y rítmica. El perfil de identidad no activa por sí solo requisitos federativos.",
    },
  },
  MX: {
    countryCode: "MX",
    label: "México",
    tier: "full",
    selfServe: true,
    defaultCurrency: "MXN",
    currencies: ["MXN"],
    defaultTimezone: null,
    timezones: [
      "America/Mexico_City",
      "America/Cancun",
      "America/Merida",
      "America/Monterrey",
      "America/Matamoros",
      "America/Chihuahua",
      "America/Ojinaga",
      "America/Hermosillo",
      "America/Mazatlan",
      "America/Bahia_Banderas",
      "America/Tijuana",
      "America/Ciudad_Juarez",
    ],
    timezoneRequired: true,
    sportCoverage: {
      mode: "general_identity_only",
      message:
        "Puedes gestionar administrativamente tu club y conservar las disciplinas elegidas. Esta cobertura general no aplica categorías ni requisitos federativos mexicanos.",
    },
  },
} as const satisfies Record<
  AdministrativeMarketCode,
  AdministrativeMarketCapability & { countryCode: AdministrativeMarketCode }
>;

/** Texto común del nivel general. Sin fechas: no hay compromiso de calendario. */
export const GENERAL_MARKET_COVERAGE_MESSAGE =
  "Puedes gestionar tu academia con las funciones generales: gimnastas y familias, grupos, clases, asistencia y cuotas registradas a mano. Las funciones específicas de tu país (federación, competiciones, cobros locales y facturación) llegarán más adelante; por ahora no se aplica ninguna regla federativa.";

/**
 * Solo los mercados completos (ES y MX). Lo usa también el alta legacy
 * `/api/onboarding/owner`, que sigue limitada a ellos.
 */
export function getAdministrativeMarketCapability(
  countryCode: string
): AdministrativeMarketCapability | null {
  if (
    !Object.prototype.hasOwnProperty.call(
      ADMINISTRATIVE_MARKET_REGISTRY,
      countryCode
    )
  ) {
    return null;
  }
  return ADMINISTRATIVE_MARKET_REGISTRY[
    countryCode as AdministrativeMarketCode
  ];
}

export function isFullAdministrativeMarket(countryCode: string): boolean {
  return getAdministrativeMarketCapability(countryCode) !== null;
}

/**
 * Alta canónica: ES y MX conservan su registro; cualquier otro país del
 * catálogo ISO recibe el nivel general (moneda elegida entre las soportadas y
 * una de sus zonas horarias). Códigos fuera del catálogo: null.
 */
export function resolveAdministrativeMarket(
  countryCode: string
): AdministrativeMarketCapability | null {
  const full = getAdministrativeMarketCapability(countryCode);
  if (full) return full;
  const country = findCountryOption(countryCode);
  if (!country || country.timezones.length === 0) return null;
  return {
    countryCode: country.code,
    label: country.name,
    tier: "general",
    selfServe: true,
    defaultCurrency: null,
    currencies: OPERATIONAL_CURRENCIES,
    defaultTimezone:
      country.timezones.length === 1 ? (country.timezones[0] ?? null) : null,
    timezones: country.timezones,
    timezoneRequired: country.timezones.length > 1,
    sportCoverage: {
      mode: "general_country_identity",
      message: GENERAL_MARKET_COVERAGE_MESSAGE,
    },
  };
}
