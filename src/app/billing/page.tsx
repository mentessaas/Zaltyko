"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useDevSession } from "@/components/dev-session-provider";

type PlanCode = "free" | "pro" | "premium";

interface BillingSummary {
  planCode: PlanCode;
  status: string;
  athleteLimit: number | null;
  classLimit: number | null;
  hasStripeCustomer: boolean;
}

const PLAN_INFO: Record<PlanCode, { title: string; description: string; price: string }> = {
  free: {
    title: "Free",
    description: "Hasta 50 atletas · ideal para academias en lanzamiento",
    price: "0 €",
  },
  pro: {
    title: "Pro",
    description: "Hasta 200 atletas · estadísticas y soporte prioritario",
    price: "19 €/mes",
  },
  premium: {
    title: "Premium",
    description: "Ilimitado · analítica avanzada e integraciones completas",
    price: "49 €/mes",
  },
};

export default function BillingPage() {
  const searchParams = useSearchParams();
  const { session, loading: loadingSession, refresh } = useDevSession();

  const academyId = useMemo(() => {
    const fromUrl = searchParams.get("academy");
    if (fromUrl) return fromUrl;
    return session?.academyId ?? null;
  }, [searchParams, session?.academyId]);

  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingAction, setLoadingAction] = useState<PlanCode | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!academyId || !session?.userId) {
        setSummary(null);
        setLoadingSummary(false);
        return;
      }

      setLoadingSummary(true);
      setError(null);
      try {
        const res = await fetch("/api/billing/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": session.userId,
          },
          body: JSON.stringify({ academyId }),
        });

        if (!res.ok) {
          throw new Error("No se pudo obtener la información de facturación");
        }

        const data = (await res.json()) as BillingSummary;
        setSummary(data);
      } catch (err: any) {
        setError(err.message ?? "Error desconocido");
      } finally {
        setLoadingSummary(false);
      }
    };

    load();
  }, [academyId, session?.userId]);

  const triggerCheckout = async (planCode: PlanCode) => {
    if (!academyId || !session?.userId) {
      setError("Activa la sesión demo antes de realizar el checkout.");
      return;
    }

    setLoadingAction(planCode);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
        },
        body: JSON.stringify({ academyId, planCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo iniciar el checkout");
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
    } finally {
      setLoadingAction(null);
    }
  };

  const openPortal = async () => {
    if (!academyId || !session?.userId) {
      setError("Activa la sesión demo antes de abrir el portal.");
      return;
    }

    setLoadingAction("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
        },
        body: JSON.stringify({ academyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo abrir el portal de Stripe");
      }

      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      }
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Facturación y planes</h1>
        <p className="text-muted-foreground">
          Escala tu academia de gimnasia y gestiona pagos desde un único lugar.
        </p>
      </header>

      {!academyId && !loadingSession && (
        <p className="rounded border border-amber-400/60 bg-amber-400/10 p-3 text-sm text-amber-200">
          Inicia el onboarding o refresca la sesión demo para obtener una academia asociada.
        </p>
      )}

      {error && (
        <p className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-medium">Plan actual</h2>
        {loadingSession || loadingSummary || !summary ? (
          <p className="text-sm text-muted-foreground">Cargando información…</p>
        ) : (
          <div className="space-y-2">
            <p className="text-lg font-semibold">{PLAN_INFO[summary.planCode].title}</p>
            <p className="text-sm text-muted-foreground">Estado: {summary.status}</p>
            <p className="text-sm text-muted-foreground">
              Límite atletas: {summary.athleteLimit ?? "Ilimitado"}
            </p>
            <p className="text-sm text-muted-foreground">
              Límite clases: {summary.classLimit ?? "Ilimitado"}
            </p>
            {summary.hasStripeCustomer && (
              <button
                onClick={openPortal}
                className="mt-3 rounded-md border px-3 py-2 text-sm"
                disabled={loadingAction === "portal"}
              >
                {loadingAction === "portal" ? "Abriendo portal…" : "Gestionar en Stripe"}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(Object.entries(PLAN_INFO) as [PlanCode, typeof PLAN_INFO[PlanCode]][]).map(
          ([code, info]) => {
            const isCurrent = summary?.planCode === code;
            const actionable = code !== "free";
            return (
              <article
                key={code}
                className={`rounded-lg border p-6 shadow-sm ${code === "pro" ? "border-primary" : ""}`}
              >
                <h3 className="text-lg font-semibold">{info.title}</h3>
                <p className="text-sm text-muted-foreground">{info.description}</p>
                <p className="mt-2 text-xl font-bold">{info.price}</p>
                <button
                  className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50"
                  disabled={!actionable || isCurrent || loadingAction === code || !academyId || !session?.userId}
                  onClick={() => triggerCheckout(code)}
                >
                  {isCurrent
                    ? "Plan actual"
                    : actionable
                    ? loadingAction === code
                      ? "Redirigiendo…"
                      : "Seleccionar"
                    : "Gestionado automáticamente"}
                </button>
              </article>
            );
          }
        )}
      </section>

      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200/80">
        <p>
          Academia activa: <strong>{session?.academyName ?? "Demo"}</strong> · ID:
          <code className="ml-2 rounded bg-black/40 px-2 py-1 text-xs">
            {academyId ?? "sin asignar"}
          </code>
        </p>
        <button
          className="mt-3 inline-flex items-center justify-center rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
          onClick={refresh}
          type="button"
        >
          Refrescar sesión demo
        </button>
      </div>
    </div>
  );
}
