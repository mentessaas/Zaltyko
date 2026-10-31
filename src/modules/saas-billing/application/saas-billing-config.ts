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
  prices: Record<SelfServePlanCode, Record<SaasBillingInterval, string>>;
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
      month: env[`${prefix}_PRICE_STARTER_MONTH`]?.trim(),
      year: env[`${prefix}_PRICE_STARTER_YEAR`]?.trim(),
    },
    growth: {
      month: env[`${prefix}_PRICE_GROWTH_MONTH`]?.trim(),
      year: env[`${prefix}_PRICE_GROWTH_YEAR`]?.trim(),
    },
  };

  if (
    !secretKey ||
    !webhookSecret ||
    !providerAccountReference ||
    !/^acct_[A-Za-z0-9]+$/u.test(providerAccountReference) ||
    !isStripeKeyForEnvironment(secretKey, environment) ||
    !webhookSecret.startsWith("whsec_") ||
    !prices.starter.month ||
    !prices.starter.year ||
    !prices.growth.month ||
    !prices.growth.year ||
    !Object.values(prices).every((plan) =>
      Object.values(plan).every(
        (price) =>
          typeof price === "string" && /^price_[A-Za-z0-9]+$/u.test(price)
      )
    )
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
  };
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
  return config.prices[planCode][billingInterval];
}

function isStripeKeyForEnvironment(
  key: string,
  environment: SaasStripeEnvironment
): boolean {
  return environment === "test"
    ? /^(sk|rk)_test_[A-Za-z0-9]+$/u.test(key)
    : /^(sk|rk)_live_[A-Za-z0-9]+$/u.test(key);
}
