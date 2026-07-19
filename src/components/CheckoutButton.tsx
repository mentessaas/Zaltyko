"use client";

import { useState } from "react";
import { getStripe } from "@/utils/stripe";
import { logger } from "@/lib/logger";

interface CheckoutButtonProps {
  priceId: string;
}

export default function CheckoutButton({ priceId }: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priceId }),
      });

      const { sessionId } = await response.json();
      const stripe = await getStripe();
      // redirectToCheckout es un método legacy de Stripe.js v2; no está tipado en v3+
      await (stripe as unknown as { redirectToCheckout: (opts: { sessionId: string }) => Promise<void> })?.redirectToCheckout({ sessionId });
    } catch (error) {
      logger.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={isLoading}
      className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
    >
      {isLoading ? "Loading..." : "Subscribe"}
    </button>
  );
}
