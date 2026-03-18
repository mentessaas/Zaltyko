"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StudentChargesTab } from "./StudentChargesTab";
import { BillingRiskWidget } from "@/components/dashboard/BillingRiskWidget";

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

function getInvoiceStatusInfo(status: string | null) {
  const statusLower = (status ?? "").toLowerCase();
  switch (statusLower) {
    case "paid":
    case "complete":
      return { label: "Pagada", variant: "success" as const };
    case "open":
    case "due":
    case "unpaid":
      return { label: "Pendiente", variant: "pending" as const };
    case "past_due":
    case "overdue":
      return { label: "Vencida", variant: "error" as const };
    case "void":
    case "cancelled":
      return { label: "Cancelada", variant: "outline" as const };
    case "draft":
      return { label: "Borrador", variant: "outline" as const };
    case "trialing":
      return { label: "En prueba", variant: "active" as const };
    default:
      return { label: status ?? "Desconocido", variant: "default" as const };
  }
}

function formatPeriod(periodStart: string | null, periodEnd: string | null): string {
  if (!periodStart || !periodEnd) return "—";
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const startMonth = start.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
  const endMonth = end.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
  return startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`;
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
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <p className="text-lg font-semibold">
                {currentPlanInfo
                  ? resolvePlanTitle(currentPlanInfo)
                  : PLAN_COPY[summary.planCode]?.title ?? summary.planCode.toUpperCase()}
              </p>
              <Badge variant={summary.status === "active" ? "success" : summary.status === "past_due" ? "error" : "pending"}>
                {summary.status === "active" ? "Activo" : summary.status === "past_due" ? "Pendiente de pago" : summary.status === "trialing" ? "En período de prueba" : summary.status === "canceled" ? "Cancelado" : summary.status}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Límite atletas:</span> {summary.athleteLimit ?? "Ilimitado"}
              </p>
              <p>
                <span className="font-medium text-foreground">Límite clases:</span> {summary.classLimit ?? "Ilimitado"}
              </p>
            </div>
            {currentPlanInfo && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Cuota:</span> {formatPlanPrice(currentPlanInfo)} /{" "}
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
                  className="mt-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                  disabled={loadingAction === "portal"}
                >
                  {loadingAction === "portal" ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Abriendo portal…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                      Gestionar en Stripe
                    </span>
                  )}
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
                <th className="px-4 py-3 font-medium">Período</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Importe</th>
                <th className="px-4 py-3 font-medium">Notas</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No hay facturas registradas todavía.
                  </td>
                </tr>
              ) : (
                history.map((invoice) => {
                  const statusInfo = getInvoiceStatusInfo(invoice.status);
                  return (
                    <tr key={invoice.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {invoice.createdAt
                          ? new Date(invoice.createdAt).toLocaleDateString("es-ES", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {formatPeriod(invoice.periodStart, invoice.periodEnd)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatInvoiceAmount(invoice)}</td>
                      <td className="px-4 py-3">
                        {"—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {invoice.hostedInvoiceUrl && (
                          <a
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                            Ver
                          </a>
                        )}
                        {invoice.invoicePdf && (
                          <a
                            href={invoice.invoicePdf}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-primary ml-3 inline-flex items-center gap-1 text-xs"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                            PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
        </TabsContent>

        <TabsContent value="charges" className="space-y-6">
          <BillingRiskWidget academyId={academyId} />
          <StudentChargesTab academyId={academyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


