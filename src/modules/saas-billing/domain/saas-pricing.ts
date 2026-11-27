/** Base amounts in cents; Stripe applies the existing exclusive Spanish VAT rate. */
export const SAAS_PLAN_PRICE_EUR_CENTS = {
  club: { month: 2397, year: 23967 },
  /** Fixed Stripe discount before VAT; rounds to a 4.10 EUR gross discount. */
  founderMonthlyDiscount: 339,
} as const;

export const SAAS_LOCATION_PRICE_EUR_CENTS = {
  month: 1653,
  year: 16529,
} as const;
