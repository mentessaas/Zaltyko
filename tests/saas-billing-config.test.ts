import { describe, expect, it } from "vitest";
import {
  getSaasStripeConfig,
  getSaasStripeWebhookVerificationConfig,
} from "@/modules/saas-billing/application/saas-billing-config";

function env(
  environment: "test" | "live",
  values: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const prefix = `STRIPE_SAAS_${environment.toUpperCase()}`;
  return {
    STRIPE_SAAS_ENVIRONMENT: environment,
    [`${prefix}_SECRET_KEY`]: `${environment === "test" ? "rk_test" : "rk_live"}_synthetic`,
    [`${prefix}_WEBHOOK_SECRET`]: "whsec_synthetic",
    [`${prefix}_ACCOUNT_REFERENCE`]: "acct_synthetic",
    [`${prefix}_PRICE_STARTER_MONTH`]: "price_startermonth",
    [`${prefix}_PRICE_STARTER_YEAR`]: "price_starteryear",
    [`${prefix}_PRICE_GROWTH_MONTH`]: "price_growthmonth",
    [`${prefix}_PRICE_GROWTH_YEAR`]: "price_growthyear",
    ...values,
  };
}

describe("SaaS Stripe environment configuration", () => {
  it.each(["test", "live"] as const)(
    "loads every allowlisted field only from the %s prefix",
    (environment) => {
      const current = env(environment, {
        STRIPE_SAAS_PORTAL_ENABLED: "true",
        [`STRIPE_SAAS_${environment.toUpperCase()}_PORTAL_ENABLED`]: "true",
        STRIPE_WEBHOOK_SECRET: "whsec_legacy_must_not_override",
      });
      const config = getSaasStripeConfig(current);

      expect(config).toMatchObject({
        environment,
        secretKey: `${environment === "test" ? "rk_test" : "rk_live"}_synthetic`,
        webhookSecret: "whsec_synthetic",
        providerAccountReference: "acct_synthetic",
        portalEnabled: true,
        prices: {
          starter: { month: "price_startermonth", year: "price_starteryear" },
          growth: { month: "price_growthmonth", year: "price_growthyear" },
        },
      });
    }
  );

  it("fails closed instead of falling back to the other environment or legacy secrets", () => {
    const onlyLive = env("live");
    delete onlyLive.STRIPE_SAAS_TEST_SECRET_KEY;
    delete onlyLive.STRIPE_SAAS_TEST_WEBHOOK_SECRET;
    delete onlyLive.STRIPE_SAAS_TEST_ACCOUNT_REFERENCE;
    delete onlyLive.STRIPE_SAAS_TEST_PRICE_STARTER_MONTH;
    delete onlyLive.STRIPE_SAAS_TEST_PRICE_STARTER_YEAR;
    delete onlyLive.STRIPE_SAAS_TEST_PRICE_GROWTH_MONTH;
    delete onlyLive.STRIPE_SAAS_TEST_PRICE_GROWTH_YEAR;
    onlyLive.STRIPE_SAAS_ENVIRONMENT = "test";
    onlyLive.STRIPE_WEBHOOK_SECRET = "whsec_legacy";
    onlyLive.STRIPE_SECRET_KEY = "sk_test_legacy";

    expect(getSaasStripeConfig(onlyLive)).toBeNull();
    expect(getSaasStripeWebhookVerificationConfig(onlyLive)).toBeNull();
  });

  it.each([
    ["mode mismatch", { STRIPE_SAAS_TEST_SECRET_KEY: "rk_live_wrong_mode" }],
    ["missing account", { STRIPE_SAAS_TEST_ACCOUNT_REFERENCE: "" }],
    ["invalid account", { STRIPE_SAAS_TEST_ACCOUNT_REFERENCE: "acct_bad-value" }],
    ["missing monthly price", { STRIPE_SAAS_TEST_PRICE_STARTER_MONTH: "" }],
    ["non-Price reference", { STRIPE_SAAS_TEST_PRICE_GROWTH_YEAR: "prod_not_a_price" }],
    ["invalid webhook secret", { STRIPE_SAAS_TEST_WEBHOOK_SECRET: "" }],
  ])("rejects an incomplete or malformed test configuration: %s", (_case, values) => {
    expect(getSaasStripeConfig(env("test", values))).toBeNull();
  });

  it("keeps webhook verification minimal but bound to the configured mode", () => {
    const values = env("test");
    delete values.STRIPE_SAAS_TEST_ACCOUNT_REFERENCE;
    delete values.STRIPE_SAAS_TEST_PRICE_STARTER_MONTH;
    delete values.STRIPE_SAAS_TEST_PRICE_STARTER_YEAR;
    delete values.STRIPE_SAAS_TEST_PRICE_GROWTH_MONTH;
    delete values.STRIPE_SAAS_TEST_PRICE_GROWTH_YEAR;

    expect(getSaasStripeWebhookVerificationConfig(values)).toEqual({
      environment: "test",
      secretKey: "rk_test_synthetic",
      webhookSecret: "whsec_synthetic",
    });
  });

  it("enables the Portal only for the explicit true value", () => {
    expect(getSaasStripeConfig(env("test", {
      STRIPE_SAAS_TEST_PORTAL_ENABLED: "TRUE",
    }))?.portalEnabled).toBe(true);
    expect(getSaasStripeConfig(env("test", {
      STRIPE_SAAS_TEST_PORTAL_ENABLED: "yes",
    }))?.portalEnabled).toBe(false);
  });
});
