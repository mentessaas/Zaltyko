"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useDevSession } from "@/components/dev-session-provider";

type PlanCode = "free" | "pro" | "premium" | (string & Record<never, never>);

interface BillingSummary {
  planCode: PlanCode;
  status: string;
  athleteLimit: number | null;
  classLimit: number | null;
  hasStripeCustomer: boolean;
}

interface PlanSummary {
  code: string;
  nickname: string | null;
  priceEur: number;
  currency: string;
  billingInterval: string | null;
  athleteLimit: number | null;
}

interface InvoiceRow {
  id: string;
  status: string;
  amountDue: number | null;
  amountPaid: number | null;
  currency: string | null;
  billingReason: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  stripeInvoiceId: string;
}

const PLAN_COPY: Record<string, { title: string; description: string }> = {
  free: {
    title: "Free",
    description: "Hasta 50 atletas · ideal para academias en lanzamiento",
  },
  pro: {
    title: "Pro",
    description: "Hasta 200 atletas · estadísticas y soporte prioritario",
  },
  premium: {
    title: "Premium",
    description: "Ilimitado · analítica avanzada e integraciones completas",
  },
};

function formatPlanPrice(plan: PlanSummary) {
  const amount = (plan.priceEur ?? 0) / 100;
  const currency = plan.currency?.toUpperCase() ?? "EUR";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function resolvePlanTitle(plan: PlanSummary) {
  return PLAN_COPY[plan.code]?.title ?? plan.nickname ?? plan.code.toUpperCase();
}

function resolvePlanDescription(plan: PlanSummary) {
  return PLAN_COPY[plan.code]?.description ?? "Plan sincronizado automáticamente desde Stripe.";
}

function formatInvoiceAmount(invoice: InvoiceRow) {
  const currency = (invoice.currency ?? "eur").toUpperCase();
  const cents = invoice.amountPaid ?? invoice.amountDue ?? 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
}

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
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [history, setHistory] = useState<InvoiceRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  useEffect(() => {
    const loadPlans = async () => {
      if (!session?.userId) {
        setPlans([]);
        setLoadingPlans(false);
        return;
      }

      setLoadingPlans(true);
      try {
        const res = await fetch("/api/billing/plans", {
          method: "GET",
          headers: {
            "x-user-id": session.userId,
          },
        });

        if (!res.ok) {
          throw new Error("No se pudieron obtener los planes");
        }

        const data = (await res.json()) as PlanSummary[];
        setPlans(data);
      } catch (err) {
        console.error(err);
        setPlans([]);
      } finally {
        setLoadingPlans(false);
      }
    };

    loadPlans();
  }, [session?.userId]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!academyId || !session?.userId) {
        setHistory([]);
        return;
      }

      setLoadingHistory(true);
      try {
        const res = await fetch("/api/billing/history", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": session.userId,
          },
          body: JSON.stringify({ academyId }),
        });

        if (!res.ok) {
          throw new Error("No se pudo obtener el historial de facturación");
        }

        const data = (await res.json()) as InvoiceRow[];
        setHistory(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
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

  const currentPlanInfo = summary
    ? plans.find((plan) => plan.code === summary.planCode) ?? null
    : null;

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
            <p className="text-lg font-semibold">
              {currentPlanInfo
                ? resolvePlanTitle(currentPlanInfo)
                : PLAN_COPY[summary.planCode]?.title ?? summary.planCode.toUpperCase()}
            </p>
            <p className="text-sm text-muted-foreground">Estado: {summary.status}</p>
            <p className="text-sm text-muted-foreground">
              Límite atletas: {summary.athleteLimit ?? "Ilimitado"}
            </p>
            <p className="text-sm text-muted-foreground">
              Límite clases: {summary.classLimit ?? "Ilimitado"}
            </p>
            {currentPlanInfo && (
              <p className="text-sm text-muted-foreground">
                Cuota: {formatPlanPrice(currentPlanInfo)} /{" "}
                {currentPlanInfo.billingInterval ?? "mes"}
              </p>
            )}
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

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Planes disponibles</h2>
          {loadingPlans && <p className="text-sm text-muted-foreground">Sincronizando con Stripe…</p>}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.length === 0 && !loadingPlans && (
            <p className="text-sm text-muted-foreground">
              No hay planes disponibles. Comprueba la sincronización con Stripe.
            </p>
          )}
          {plans.map((plan) => {
            const code = plan.code as PlanCode;
            const isCurrent = summary?.planCode === plan.code;
            const isFree = plan.priceEur === 0;
            return (
              <article
                key={plan.code}
                className={`flex h-full flex-col rounded-lg border p-6 shadow-sm ${
                  plan.code === "pro" ? "border-primary" : ""
                }`}
              >
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{resolvePlanTitle(plan)}</h3>
                  <p className="text-sm text-muted-foreground">{resolvePlanDescription(plan)}</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatPlanPrice(plan)}{" "}
                    {plan.billingInterval ? (
                      <span className="text-sm font-normal text-muted-foreground">
                        / {plan.billingInterval}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="mt-4 flex flex-1 flex-col justify-end space-y-2">
                  {plan.athleteLimit != null && (
                    <p className="text-xs text-muted-foreground">
                      Hasta {plan.athleteLimit} atletas incluidos
                    </p>
                  )}
                  <button
                    className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50"
                    disabled={
                      isFree ||
                      isCurrent ||
                      loadingAction === code ||
                      !academyId ||
                      !session?.userId
                    }
                    onClick={() => triggerCheckout(code)}
                  >
                    {isCurrent
                      ? "Plan actual"
                      : isFree
                      ? "Incluido"
                      : loadingAction === code
                      ? "Redirigiendo…"
                      : "Seleccionar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-medium">Historial de facturación</h2>
            <p className="text-sm text-muted-foreground">
              Facturas emitidas durante los últimos ciclos de facturación.
            </p>
          </div>
          {loadingHistory && <p className="text-sm text-muted-foreground">Cargando…</p>}
        </div>

        {history.length === 0 && !loadingHistory ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay facturas registradas para esta academia.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Importe</th>
                  <th className="px-4 py-2 text-left">Estado</th>
                  <th className="px-4 py-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((invoice) => {
                  const created = new Date(invoice.createdAt);
                  return (
                    <tr key={invoice.id}>
                      <td className="px-4 py-3">
                        {new Intl.DateTimeFormat("es-ES", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(created)}
                      </td>
                      <td className="px-4 py-3">{formatInvoiceAmount(invoice)}</td>
                      <td className="px-4 py-3 capitalize">
                        {invoice.status.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.hostedInvoiceUrl || invoice.invoicePdf ? (
                          <a
                            href={invoice.hostedInvoiceUrl ?? invoice.invoicePdf ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            Ver factura
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
