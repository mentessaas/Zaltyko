"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CreditCard, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SavedCard {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

interface Props {
  academyId: string;
}

interface SetupData {
  clientSecret: string;
  publishableKey: string;
  stripeAccountId: string;
}

/**
 * Tarjeta de metodo de pago para el portal de familias. Usa Stripe Elements
 * sobre la cuenta conectada de la academia: la tarjeta se captura y tokeniza en
 * Stripe. Zaltyko nunca ve el PAN.
 */
export function FamilyPaymentMethodCard({ academyId }: Props) {
  const [card, setCard] = useState<SavedCard | null>(null);
  const [connectReady, setConnectReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/payment-method?academyId=${academyId}`);
      const json = await res.json();
      if (res.ok) {
        setCard(json.hasCard ? (json.card as SavedCard) : null);
        setConnectReady(!!json.connectReady);
      }
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const startAddCard = async () => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/payment-method/setup-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "No se pudo iniciar el alta de tarjeta");
      }
      setSetup(json as SetupData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setWorking(false);
    }
  };

  const removeCard = async () => {
    setWorking(true);
    try {
      await fetch(`/api/family/payment-method`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });
      await loadStatus();
    } finally {
      setWorking(false);
    }
  };

  const stripePromise = useMemo<Promise<StripeJs | null> | null>(() => {
    if (!setup) return null;
    return loadStripe(setup.publishableKey, { stripeAccount: setup.stripeAccountId });
  }, [setup]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Método de pago</CardTitle>
        <CardDescription>
          Guarda una tarjeta para pagar las cuotas automáticamente. El pago se procesa de forma
          segura con Stripe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zaltyko-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : !connectReady ? (
          <p className="text-sm text-zaltyko-text-secondary">
            Esta academia aún no tiene activados los pagos con tarjeta.
          </p>
        ) : setup && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: setup.clientSecret, appearance: { theme: "stripe" } }}
          >
            <SetupForm
              academyId={academyId}
              onDone={async () => {
                setSetup(null);
                await loadStatus();
              }}
              onCancel={() => setSetup(null)}
            />
          </Elements>
        ) : card ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4" />
              <span className="capitalize">{card.brand}</span> ···· {card.last4}
              {card.expMonth && card.expYear ? (
                <span className="text-zaltyko-text-secondary">
                  {String(card.expMonth).padStart(2, "0")}/{card.expYear}
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={startAddCard} disabled={working}>
                Cambiar
              </Button>
              <Button variant="ghost" size="sm" onClick={removeCard} disabled={working}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={startAddCard} disabled={working}>
            {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            Añadir tarjeta
          </Button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}

function SetupForm({
  academyId,
  onDone,
  onCancel,
}: {
  academyId: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await stripe.confirmSetup({ elements, redirect: "if_required" });
      if (result.error) {
        setError(result.error.message ?? "No se pudo guardar la tarjeta");
        return;
      }
      const paymentMethodId = result.setupIntent?.payment_method;
      if (typeof paymentMethodId !== "string") {
        setError("No se pudo obtener el método de pago");
        return;
      }
      const res = await fetch(`/api/family/payment-method`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId, paymentMethodId }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "No se pudo guardar la tarjeta");
      }
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={!stripe || submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar tarjeta
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
