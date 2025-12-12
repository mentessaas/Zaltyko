"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StudentChargesTab } from "./StudentChargesTab";

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

interface BillingPanelProps {
  academyId: string;
  userId: string;
}

export function BillingPanel({ academyId, userId }: BillingPanelProps) {
  const searchParams = useSearchParams();
  const defaultTab = searchParams?.get("tab") === "student-charges" ? "charges" : "plans";
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
      setLoadingSummary(true);
      setError(null);
      try {
        const res = await fetch("/api/billing/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
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
  }, [academyId, userId]);

  useEffect(() => {
    const loadPlans = async () => {
      setLoadingPlans(true);
      try {
        const res = await fetch("/api/billing/plans", {
          method: "GET",
          headers: {
            "x-user-id": userId,
          },
        });

        if (!res.ok) {
          throw new Error("No se pudieron obtener los planes");
        }

        const data = (await res.json()) as PlanSummary[];
        setPlans(data);
      } catch (err: any) {
        setError(err.message ?? "Error desconocido");
        setPlans([]);
      } finally {
        setLoadingPlans(false);
      }
    };

    loadPlans();
  }, [userId]);

  useEffect(() => {
    const loadHistory = async () => {
      setLoadingHistory(true);
      try {
        const res = await fetch("/api/billing/history", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
          body: JSON.stringify({ academyId }),
        });

        if (!res.ok) {
          throw new Error("No se pudo obtener el historial de facturación");
        }

        const data = (await res.json()) as InvoiceRow[];
        setHistory(data);
      } catch (err: any) {
        setError(err.message ?? "Error desconocido");
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [academyId, userId]);

  const triggerCheckout = async (planCode: PlanCode) => {
    setLoadingAction(planCode);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ academyId, planCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Mostrar mensaje más descriptivo según el error
        const errorMessage = data?.message || data?.error || "No se pudo iniciar el checkout";
        if (data?.error === "STRIPE_NOT_CONFIGURED") {
          throw new Error("Stripe no está configurado. Los pagos no están disponibles en este momento. Contacta con soporte.");
        }
        throw new Error(errorMessage);
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("No se recibió una URL de checkout válida");
      }
    } catch (err: any) {
      setError(err.message ?? "Error desconocido al iniciar el checkout");
    } finally {
      setLoadingAction(null);
    }
  };

  const openPortal = async () => {
    setLoadingAction("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
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

  const currentPlanInfo = useMemo(
    () => (summary ? plans.find((plan) => plan.code === summary.planCode) ?? null : null),
    [summary, plans]
  );

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          <TabsTrigger value="plans">Planes y facturación</TabsTrigger>
          <TabsTrigger value="charges">Cobros a alumnos</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-8">
          <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-medium">Plan actual</h2>
        {loadingSummary || !summary ? (
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
              <TooltipOnboarding
                tooltipId="tooltip_payments"
                message="Configura pagos una sola vez y deja de perseguir a padres cada mes."
              >
                <button
                  onClick={openPortal}
                  className="mt-3 rounded-md border px-3 py-2 text-sm"
                  disabled={loadingAction === "portal"}
                >
                  {loadingAction === "portal" ? "Abriendo portal…" : "Gestionar en Stripe"}
                </button>
              </TooltipOnboarding>
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
                    disabled={isFree || isCurrent || loadingAction === code}
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

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Historial de facturas</h2>
          {loadingHistory && <p className="text-sm text-muted-foreground">Cargando…</p>}
        </div>
        <div className="overflow-hidden rounded-lg border bg-card shadow">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Importe</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No hay facturas registradas todavía.
                  </td>
                </tr>
              ) : (
                history.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      {invoice.createdAt
                        ? new Date(invoice.createdAt).toLocaleDateString("es-ES")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 capitalize">{invoice.status}</td>
                    <td className="px-4 py-3">{formatInvoiceAmount(invoice)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {invoice.billingReason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {invoice.hostedInvoiceUrl && (
                        <a
                          href={invoice.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          Ver factura
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
        </TabsContent>

        <TabsContent value="charges">
          <StudentChargesTab academyId={academyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


