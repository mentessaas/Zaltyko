"use client";

import { useRef, useState } from "react";
import { logger } from "@/lib/logger";

interface CheckoutButtonProps {
  academyId: string;
  planCode: "pro" | "premium";
}

export default function CheckoutButton({ academyId, planCode }: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const handleCheckout = async () => {
    setIsLoading(true);
    setError(null);

    try {
      idempotencyKeyRef.current ??= crypto.randomUUID();
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({ academyId, planCode }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; data?: { checkoutUrl?: string }; message?: string }
        | null;
      const checkoutUrl = payload?.ok === true ? payload.data?.checkoutUrl : undefined;
      if (!response.ok || !checkoutUrl) {
        throw new Error(payload?.message || "No se pudo iniciar el checkout");
      }

      window.location.assign(checkoutUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar el checkout";
      setError(message);
      logger.error("Error iniciando checkout:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return <>
    <button
      type="button"
      onClick={handleCheckout}
      disabled={isLoading}
      aria-describedby={error ? "checkout-error" : undefined}
      className="rounded-lg bg-zaltyko-primary px-4 py-2 font-semibold text-white transition-colors hover:bg-zaltyko-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? "Abriendo checkout…" : "Suscribirme"}
    </button>
    {error && <p id="checkout-error" role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  </>;
}
