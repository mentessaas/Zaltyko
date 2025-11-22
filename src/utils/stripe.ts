import { type Stripe, loadStripe } from "@stripe/stripe-js";
import StripeServer from "stripe";
import { getOptionalEnvVar } from "@/lib/env";

let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    const publishableKey = getOptionalEnvVar("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    if (!publishableKey) {
      throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be set");
    }
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};

// Lazy initialization para evitar errores durante el build
let stripeServerInstance: StripeServer | null = null;

export const stripe = new Proxy({} as StripeServer, {
  get(_target, prop) {
    if (!stripeServerInstance) {
      const secretKey = getOptionalEnvVar("STRIPE_SECRET_KEY");
      // Durante el build, retornar un cliente dummy si no hay clave
      const isBuildTime =
        typeof window === "undefined" &&
        (process.env.NEXT_PHASE === "phase-production-build" ||
          process.env.NEXT_PHASE === "phase-development-build");

      if (!secretKey) {
        if (isBuildTime) {
          stripeServerInstance = new StripeServer("sk_test_dummy_key_for_build", {
            apiVersion: "2024-06-20",
          });
        } else {
          throw new Error("STRIPE_SECRET_KEY debe estar definido para operaciones de facturación");
        }
      } else {
        stripeServerInstance = new StripeServer(secretKey, {
          apiVersion: "2024-06-20",
        });
      }
    }
    return stripeServerInstance[prop as keyof StripeServer];
  },
});
