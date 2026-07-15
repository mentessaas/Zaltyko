"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, ExternalLink, Loader2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ConnectStatus {
  connected: boolean;
  ready: boolean;
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

interface Props {
  academyId: string;
}

/**
 * Tarjeta de conexión de Stripe Connect (Standard) para la academia.
 * Sustituye al antiguo formulario de "pega tu Stripe Secret Key" (BYO-keys).
 * La academia conecta su propia cuenta; Zaltyko nunca ve claves ni fondos.
 */
export function StripeConnectCard({ academyId }: Props) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/connect/status?academyId=${academyId}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.message || "No se pudo cargar el estado de Stripe");
      }
      setStatus(json.data as ConnectStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void loadStatus();
    // Si volvemos del onboarding, refrescar el estado desde Stripe.
    const params = new URLSearchParams(window.location.search);
    if (params.get("connect") === "return") {
      void fetch(`/api/payments/connect/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      }).then(() => loadStatus());
    }
  }, [academyId, loadStatus]);

  const startOnboarding = async () => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/connect/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.message || "No se pudo iniciar la conexión con Stripe");
      }
      window.location.href = json.data.onboardingUrl as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setWorking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobros con tarjeta (Stripe)</CardTitle>
        <CardDescription>
          Conecta tu cuenta de Stripe para cobrar las cuotas con tarjeta. El dinero llega
          directamente a tu cuenta bancaria: Zaltyko nunca guarda tus claves ni retiene fondos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zaltyko-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando estado…
          </div>
        ) : status?.ready ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" /> Stripe conectado y listo para cobrar.
          </div>
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" /> Conexión iniciada pero incompleta
              {status.status ? ` (${status.status})` : ""}. Completa el proceso en Stripe.
            </div>
            <Button onClick={startOnboarding} disabled={working}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Continuar en Stripe
            </Button>
          </div>
        ) : (
          <Button onClick={startOnboarding} disabled={working}>
            {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            Conectar con Stripe
          </Button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
