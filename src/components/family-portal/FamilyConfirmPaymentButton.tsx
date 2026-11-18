"use client";

import type { Stripe } from "@stripe/stripe-js";
// Sin efectos al importar: Stripe.js solo se descarga cuando la familia pulsa el botón.
import { loadStripe } from "@stripe/stripe-js/pure";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { familyRequest } from "@/components/family-portal/family-access-fetch";
import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import {
  FAMILY_CONFIRMATION_UNAVAILABLE_TEXT,
  familyConfirmationRetryText,
  familyConfirmationText,
} from "@/modules/family-portal/domain/family-portal-presentation";

// Cobro automático de cuotas (Fase 4, Tarea 5): el banco pide que la persona
// pagadora confirme el pago de una cuota. Con el botón confirma el MISMO
// cobro en la cuenta de su academia (Stripe.js con `stripeAccount` y la clave
// publicable). Lo que diga el navegador no cuenta: después se pide al
// servidor que lo relea en Stripe («Procesando…») y se refresca la página.
// Nunca se reintenta solo. La clave del cobro solo vive en una variable local
// mientras dura la confirmación: ni en el estado, ni en la página, ni en el registro.

const ENDPOINT = "/api/v1/family/automatic-payment/authentication";

const TEXT = {
  button: "Confirmar el pago",
  processing: "Procesando…",
  confirmed: "Pago confirmado",
  closed: "No se pudo confirmar. Tu academia te dirá cómo pagarla.",
  failed: "No se pudo preparar la confirmación del pago. Vuelve a intentarlo en un momento.",
  tooMany: "Has hecho demasiados intentos. Espera un minuto y vuelve a intentarlo.",
} as const;

type Start = { clientSecret?: unknown; connectedAccount?: unknown; paymentMethodId?: unknown };
type Check = { state?: unknown };
type Phase = "idle" | "working" | "processing" | "confirmed" | "retry" | "closed";

// Un Stripe.js por cuenta conectada: el de la plataforma no sirve aquí.
const stripePromises = new Map<string, Promise<Stripe | null>>();

function stripeForAccount(publishableKey: string, stripeAccount: string): Promise<Stripe | null> {
  const key = `${publishableKey}:${stripeAccount}`;
  let promise = stripePromises.get(key);
  if (!promise) {
    promise = loadStripe(publishableKey, { stripeAccount })
      .catch(() => null)
      .then((stripe) => {
        if (!stripe) stripePromises.delete(key);
        return stripe;
      });
    stripePromises.set(key, promise);
  }
  return promise;
}

export function FamilyConfirmPaymentButton({
  organizationId,
  invoiceId,
  deadline,
}: {
  organizationId: string;
  invoiceId: string;
  /** Último día para confirmar (YYYY-MM-DD de la sede). */
  deadline: string;
}) {
  const router = useRouter();
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  // Sin la clave publicable no hay con qué confirmar: ningún botón.
  if (!publishableKey) {
    return <p className={`mt-3 ${ownerTone.inlineWarning}`}>{FAMILY_CONFIRMATION_UNAVAILABLE_TEXT}</p>;
  }

  async function check() {
    setPhase("processing");
    const result = await familyRequest<Check>(ENDPOINT, { action: "check", organizationId, invoiceId });
    const state = result.ok ? result.data.state : null;
    if (state === "collected") setPhase("confirmed");
    else if (state === "action_required") setPhase("retry");
    else if (state === "closed") setPhase("closed");
    // `processing` o sin respuesta: sigue «Procesando…» hasta que lo diga el servidor.
    router.refresh();
  }

  async function confirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setPhase("working");
    try {
      const start = await familyRequest<Start>(ENDPOINT, { action: "start", organizationId, invoiceId });
      if (!start.ok) {
        setError(start.status === 429 ? TEXT.tooMany : start.message);
        // El cobro ya no espera (409): la página lo enseñará como esté.
        if (start.status === 409 || start.status === 404) router.refresh();
        setPhase("idle");
        return;
      }
      const { clientSecret, connectedAccount, paymentMethodId } = start.data;
      if (
        typeof clientSecret !== "string" ||
        clientSecret.length === 0 ||
        typeof connectedAccount !== "string" ||
        !connectedAccount.startsWith("acct_") ||
        typeof paymentMethodId !== "string" ||
        !paymentMethodId.startsWith("pm_")
      ) {
        setError(TEXT.failed);
        setPhase("idle");
        return;
      }
      const stripe = await stripeForAccount(publishableKey, connectedAccount);
      if (!stripe) {
        setError(TEXT.failed);
        setPhase("idle");
        return;
      }
      try {
        // El banco abre aquí su ventana. El resultado no se usa: lo decide el servidor.
        await stripe.confirmCardPayment(clientSecret, { payment_method: paymentMethodId });
      } catch {
        // Igual que un rechazo: el servidor dirá cómo quedó.
      }
      await check();
    } finally {
      busyRef.current = false;
    }
  }

  const showButton = phase === "idle" || phase === "working" || phase === "retry";
  const lead = phase === "retry" ? familyConfirmationRetryText(deadline) : familyConfirmationText(deadline);
  const status =
    phase === "processing"
      ? TEXT.processing
      : phase === "confirmed"
        ? TEXT.confirmed
        : phase === "closed"
          ? TEXT.closed
          : null;

  return (
    <div className="mt-3 space-y-2">
      {status === null ? <p className={ownerTone.inlineWarning}>{lead}</p> : null}
      {status !== null ? (
        <p className={phase === "closed" ? ownerTone.inlineWarning : ownerUi.muted} role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className={ownerTone.inlineWarning} role="alert">
          {error}
        </p>
      ) : null}
      {showButton ? (
        <button
          type="button"
          className={ownerUi.primaryButton}
          onClick={() => void confirm()}
          disabled={phase === "working"}
          aria-busy={phase === "working"}
        >
          {TEXT.button}
        </button>
      ) : null}
    </div>
  );
}
