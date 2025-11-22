import Stripe from "stripe";
import { getOptionalEnvVar, isTest } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secretKey = getOptionalEnvVar("STRIPE_SECRET_KEY");

  // Durante el build, retornar un cliente dummy si no hay clave
  const isBuildTime =
    typeof window === "undefined" &&
    (process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_PHASE === "phase-development-build");

  if (!secretKey) {
    if (isBuildTime || isTest()) {
      // Retornar un cliente dummy para permitir que el build continúe
      return new Stripe("sk_test_dummy_key_for_build", {
        apiVersion: "2024-06-20",
      });
    }
    throw new Error("STRIPE_SECRET_KEY debe estar definido para operaciones de facturación");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2024-06-20",
    });
  }

  return stripeClient;
}


