"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Wizard para que la academia conecte su cuenta Stripe.
 * Llama a /api/academy/stripe-connect/onboard y redirige al AccountLink de Stripe.
 *
 * Tras volver con ?done=1, podemos revalidar el estado de la cuenta vía el
 * propio endpoint. Sprint T4.5 añadirá polling del estado de onboarding
 * (charges_enabled, payouts_enabled) desde la API de Stripe.
 */
export function StripeOnboardingClient({
  academyId,
  returnUrl,
  done,
}: {
  academyId: string;
  returnUrl: string;
  done: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function connect() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/academy/stripe-connect/onboard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ academyId, returnUrl }),
        });
        if (res.ok) {
          const { url } = await res.json();
          if (url) window.location.href = url;
        } else {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? res.statusText);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      }
    });
  }

  if (done) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
          Onboarding finalizado
        </h1>
        <p style={{ color: "#475569", marginBottom: 24 }}>
          Has vuelto de Stripe. Verificamos tu estado en unos segundos.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          style={{
            padding: "10px 16px",
            background: "#0f172a",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Verificar estado
        </button>
        <p style={{ marginTop: 16, fontSize: 13, color: "#64748b" }}>
          ¿Quieres seguir configurando?{" "}
          <a href={`/app/${academyId}/store`} style={{ color: "#6366f1" }}>
            Volver a la tienda
          </a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "60px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Conecta tu cuenta de Stripe
      </h1>
      <p style={{ color: "#475569", marginBottom: 20, lineHeight: 1.5 }}>
        Para vender en la tienda y en el marketplace, Zaltyko usa Stripe Connect
        con <strong>destination charges</strong>: el dinero va directo a tu
        cuenta, y Zaltyko cobra una comisión sobre cada venta (10% por defecto,
        5% en plan Growth, 0% en Network).
      </p>
      <p style={{ color: "#475569", marginBottom: 24, lineHeight: 1.5, fontSize: 13 }}>
        Te redirigiremos a Stripe para que completes el KYC (datos fiscales,
        cuenta bancaria, verificación de identidad). Es un proceso de ~5
        minutos. Stripe no comparte tus datos bancarios con Zaltyko.
      </p>
      <button
        type="button"
        onClick={connect}
        disabled={pending}
        style={{
          padding: "12px 20px",
          background: "#635bff",
          color: "white",
          border: 0,
          borderRadius: 6,
          cursor: pending ? "wait" : "pointer",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        {pending ? "Conectando con Stripe…" : "Conectar con Stripe"}
      </button>
      {error && (
        <p style={{ color: "#dc2626", marginTop: 12, fontSize: 13 }}>
          Error: {error}
        </p>
      )}
    </div>
  );
}
