/** Formateo monetario compartido para academias internacionales. */
const COUNTRY_CURRENCIES: Record<string, string> = {
  ES: "EUR", MX: "MXN", AR: "ARS", CO: "COP", CL: "CLP", PE: "PEN",
  VE: "USD", EC: "USD", GT: "GTQ", CU: "CUP", BO: "BOB", DO: "DOP",
  HN: "HNL", PY: "PYG", SV: "USD", NI: "NIO", CR: "CRC", PA: "USD",
  UY: "UYU", PR: "USD", US: "USD", BR: "BRL", CA: "CAD", GB: "GBP",
  AU: "AUD", NZ: "NZD", CH: "CHF", JP: "JPY", KR: "KRW", ZA: "ZAR",
  DE: "EUR", FR: "EUR", IT: "EUR", PT: "EUR", NL: "EUR", BE: "EUR",
  ESPAÑA: "EUR", SPAIN: "EUR", MÉXICO: "MXN", MEXICO: "MXN", ARGENTINA: "ARS",
  COLOMBIA: "COP", CHILE: "CLP", PERÚ: "PEN", PERU: "PEN", VENEZUELA: "USD",
  ECUADOR: "USD", GUATEMALA: "GTQ", CUBA: "CUP", BOLIVIA: "BOB",
  "REPÚBLICA DOMINICANA": "DOP", "REPUBLICA DOMINICANA": "DOP", HONDURAS: "HNL",
  PARAGUAY: "PYG", "EL SALVADOR": "USD", NICARAGUA: "NIO", "COSTA RICA": "CRC",
  PANAMÁ: "USD", PANAMA: "USD", URUGUAY: "UYU", "PUERTO RICO": "USD", "ESTADOS UNIDOS": "USD", USA: "USD",
  BRASIL: "BRL", BRAZIL: "BRL", CANADÁ: "CAD", CANADA: "CAD", "REINO UNIDO": "GBP", UK: "GBP",
  AUSTRALIA: "AUD", "NUEVA ZELANDA": "NZD", SUIZA: "CHF", JAPÓN: "JPY", JAPON: "JPY", JAPAN: "JPY",
  ALEMANIA: "EUR", FRANCIA: "EUR", ITALIA: "EUR", PORTUGAL: "EUR",
};

export function getCurrencyForCountry(country: string | null | undefined): string {
  return COUNTRY_CURRENCIES[(country ?? "").trim().toUpperCase()] ?? "EUR";
}

/** Bizum is a Spain-specific rail; do not present it as a universal method. */
export function isBizumAvailableInCountry(country: string | null | undefined): boolean {
  const normalized = (country ?? "").trim().toUpperCase();
  return normalized === "ES" || normalized === "ESPAÑA" || normalized === "SPAIN";
}

export function formatCurrency(
  amount: number | null | undefined,
  currency = "EUR",
  locale = "es-ES"
): string {
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${numericAmount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function formatMinorCurrency(
  amountCents: number | null | undefined,
  currency = "EUR",
  locale = "es-ES"
): string {
  return formatCurrency(Number(amountCents ?? 0) / 100, currency, locale);
}
