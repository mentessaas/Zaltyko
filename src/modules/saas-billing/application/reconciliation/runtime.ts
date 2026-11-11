/**
 * Runtime of the reconciliation: Stripe configuration, the real Stripe
 * provider (or the injected one) and the clock.
 */
import { createSaasStripeClient, getSaasStripeConfig, type SaasStripeConfig } from "../saas-billing-config";
import { fail } from "./errors";
import type { StripeReconciliationProvider, SaasReconciliationDependencies, Runtime } from "./model";

export function providerFor(config: SaasStripeConfig): StripeReconciliationProvider {
  const stripe = createSaasStripeClient(config);
  return {
    async retrieveSubscription(reference) {
      return stripe.subscriptions.retrieve(reference, {
        expand: ["items.data.price", "latest_invoice"],
      });
    },
    async retrieveInvoice(reference) {
      return stripe.invoices.retrieve(reference, {
        expand: ["lines.data.price"],
      });
    },
  };
}

export function getRuntime(
  dependencies?: SaasReconciliationDependencies
): Runtime {
  const config = dependencies?.config ?? getSaasStripeConfig();
  if (!config) {
    throw fail(
      "FEATURE_NOT_AVAILABLE",
      "La integración SaaS de Stripe no está configurada",
      503,
      "PROVIDER_UNAVAILABLE"
    );
  }
  return {
    config,
    provider: dependencies?.provider ?? providerFor(config),
    now: dependencies?.now ?? (() => new Date()),
  };
}
