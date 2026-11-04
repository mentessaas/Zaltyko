export type AdministrativeMarketCode = "ES" | "MX";

export type SportCoverageMode =
  | "discipline_identity"
  | "general_identity_only";

export interface AdministrativeMarketCapability {
  countryCode: AdministrativeMarketCode;
  label: string;
  selfServe: true;
  defaultCurrency: "EUR" | "MXN";
  currencies: readonly ("EUR" | "MXN")[];
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
  AdministrativeMarketCapability
>;

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
