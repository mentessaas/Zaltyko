import Stripe from "stripe";

export type SaasStripeEnvironment = "test" | "live";
export type SelfServePlanCode = "starter" | "growth";
export type SaasBillingInterval = "month" | "year";

export interface SaasStripeConfig {
  environment: SaasStripeEnvironment;
  secretKey: string;
  webhookSecret: string;
  providerAccountReference: string;
  portalEnabled: boolean;
  prices: Record<SelfServePlanCode, Record<SaasBillingInterval, string | null>>;
  /** Price IDs anteriores de Starter; solo para reconocer contratos vigentes. */
  legacyPrices: Record<"starter", Record<SaasBillingInterval, string | null>>;
  locationPrices: Record<SaasBillingInterval, string>;
  /**
   * Tax Rate de Stripe (txr_…) del IVA general español, 21 % exclusivo.
   * Opcional para no cerrar el recorrido de test existente; Checkout Live
   * no se abre sin él (ver resolveSaasCheckoutTaxPlan).
   */
  taxRates?: { esVatGeneral: string | null };
}

export interface SaasStripeWebhookVerificationConfig {
  environment: SaasStripeEnvironment;
  secretKey: string;
  webhookSecret: string;
}

/** Minimal mode-specific credentials needed to verify a signed SaaS event. */
export function getSaasStripeWebhookVerificationConfig(
  env: NodeJS.ProcessEnv = process.env
): SaasStripeWebhookVerificationConfig | null {
  const environment = env.STRIPE_SAAS_ENVIRONMENT;
  if (environment !== "test" && environment !== "live") return null;
  const prefix = `STRIPE_SAAS_${environment.toUpperCase()}`;
  const secretKey = env[`${prefix}_SECRET_KEY`]?.trim();
  const webhookSecret = env[`${prefix}_WEBHOOK_SECRET`]?.trim();
  if (
    !secretKey ||
    !webhookSecret?.startsWith("whsec_") ||
    !isStripeKeyForEnvironment(secretKey, environment)
  ) {
    return null;
  }
  return { environment, secretKey, webhookSecret };
}

/** Returns null until every allowlisted platform setting is explicitly set. */
export function getSaasStripeConfig(
  env: NodeJS.ProcessEnv = process.env
): SaasStripeConfig | null {
  const environment = env.STRIPE_SAAS_ENVIRONMENT;
  if (environment !== "test" && environment !== "live") return null;

  const prefix = `STRIPE_SAAS_${environment.toUpperCase()}`;
  const secretKey = env[`${prefix}_SECRET_KEY`]?.trim();
  const webhookSecret = env[`${prefix}_WEBHOOK_SECRET`]?.trim();
  const providerAccountReference = env[`${prefix}_ACCOUNT_REFERENCE`]?.trim();
  const prices = {
    starter: {
      month: env[`${prefix}_PRICE_CLUB_MONTH`]?.trim(),
      year: env[`${prefix}_PRICE_CLUB_YEAR`]?.trim(),
    },
    growth: {
      month: env[`${prefix}_PRICE_GROWTH_MONTH`]?.trim(),
      year: env[`${prefix}_PRICE_GROWTH_YEAR`]?.trim(),
    },
  };
  const locationPrices = {
    month: env[`${prefix}_PRICE_LOCATION_MONTH`]?.trim(),
    year: env[`${prefix}_PRICE_LOCATION_YEAR`]?.trim(),
  };
  const legacyPrices = {
    starter: {
      month: env[`${prefix}_PRICE_STARTER_MONTH`]?.trim(),
      year: env[`${prefix}_PRICE_STARTER_YEAR`]?.trim(),
    },
  };
  const requiredPrices = [prices.starter.month, prices.starter.year, ...Object.values(locationPrices),
    ...Object.values(legacyPrices.starter), ...Object.values(prices.growth)];
  const suppliedPrices = [
    ...Object.values(prices).flatMap((plan) => Object.values(plan)),
    ...Object.values(locationPrices),
  ].filter((price): price is string => Boolean(price));

  if (
    !secretKey ||
    !webhookSecret ||
    !providerAccountReference ||
    !/^acct_[A-Za-z0-9]+$/u.test(providerAccountReference) ||
    !isStripeKeyForEnvironment(secretKey, environment) ||
    !webhookSecret.startsWith("whsec_") ||
    requiredPrices.some((price) => !price) ||
    !suppliedPrices.every((price) => /^price_[A-Za-z0-9]+$/u.test(price))
  ) {
    return null;
  }

  return {
    environment,
    secretKey,
    webhookSecret,
    providerAccountReference,
    portalEnabled:
      env[`${prefix}_PORTAL_ENABLED`]?.trim().toLowerCase() === "true",
    prices: prices as SaasStripeConfig["prices"],
    legacyPrices: legacyPrices as SaasStripeConfig["legacyPrices"],
    locationPrices: locationPrices as SaasStripeConfig["locationPrices"],
    taxRates: {
      esVatGeneral: stripeTaxRateReference(env[`${prefix}_TAX_RATE_ES_IVA21`]),
    },
  };
}

/** Un valor mal escrito se trata como ausente: Live queda cerrado, no sin IVA. */
function stripeTaxRateReference(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /^txr_[A-Za-z0-9]+$/u.test(trimmed) ? trimmed : null;
}

export function createSaasStripeClient(config: SaasStripeConfig): Stripe {
  return new Stripe(config.secretKey, {
    apiVersion: "2026-08-26.dahlia",
    timeout: 10_000,
  });
}

export function priceForPlan(
  config: SaasStripeConfig,
  planCode: SelfServePlanCode,
  billingInterval: SaasBillingInterval
): string {
  const price = config.prices[planCode][billingInterval];
  if (!price) throw new Error("El precio de este plan heredado no está configurado");
  return price;
}

export function priceForLocation(config: SaasStripeConfig, billingInterval: SaasBillingInterval): string {
  return config.locationPrices[billingInterval];
}

function isStripeKeyForEnvironment(
  key: string,
  environment: SaasStripeEnvironment
): boolean {
  return environment === "test"
    ? /^(sk|rk)_test_[A-Za-z0-9]+$/u.test(key)
    : /^(sk|rk)_live_[A-Za-z0-9]+$/u.test(key);
}
