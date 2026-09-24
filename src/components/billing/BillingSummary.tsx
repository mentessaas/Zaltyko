"use client";

import type { BillingSummary, PlanSummary } from "@/types/billing";
import { getProductPlanPublicName } from "@/lib/plans/catalog";
import { getSubscriptionStatusLabel } from "@/lib/billing/subscription-status-labels";

const PLAN_COPY: Record<string, { title: string; description: string }> = {
  free: {
    title: "Free",
    description: "Hasta 30 gimnastas · ideal para academias en lanzamiento",
  },
  pro: {
    title: "Starter",
    description: "Hasta 75 gimnastas · portal familiar limitado y pagos recurrentes",
  },
  premium: {
    title: "Growth",
    description: "Hasta 200 gimnastas · soporte prioritario",
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
  return getProductPlanPublicName(plan.code, PLAN_COPY[plan.code]?.title ?? plan.nickname);
}

interface BillingSummaryProps {
  summary: BillingSummary | null;
  currentPlan: PlanSummary | null;
  loading: boolean;
  onOpenPortal: () => void;
  isOpeningPortal: boolean;
}

export function BillingSummary({
  summary,
  currentPlan,
  loading,
  onOpenPortal,
  isOpeningPortal,
}: BillingSummaryProps) {
  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-medium">Plan actual</h2>
        <p className="text-sm text-muted-foreground">Cargando información…</p>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-medium">Plan actual</h2>
        <p className="text-sm text-muted-foreground">Selecciona una academia para ver su plan.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-medium">Plan actual</h2>
      <div className="space-y-2">
        <p className="text-lg font-semibold">
          {currentPlan
            ? resolvePlanTitle(currentPlan)
            : getProductPlanPublicName(summary.planCode, PLAN_COPY[summary.planCode]?.title)}
        </p>
        <p className="text-sm text-muted-foreground">Estado: {getSubscriptionStatusLabel(summary.status)}</p>
        <p className="text-sm text-muted-foreground">
          Límite gimnastas: {summary.athleteLimit ?? "Ilimitado"}
        </p>
        <p className="text-sm text-muted-foreground">
          Límite clases: {summary.classLimit ?? "Ilimitado"}
        </p>
        {currentPlan && (
          <p className="text-sm text-muted-foreground">
            Cuota: {formatPlanPrice(currentPlan)} / {currentPlan.billingInterval ?? "mes"}
          </p>
        )}
        {summary.hasStripeCustomer && (
          <button
            onClick={onOpenPortal}
            className="mt-3 rounded-md border px-3 py-2 text-sm"
            disabled={isOpeningPortal}
          >
            {isOpeningPortal ? "Abriendo portal…" : "Gestionar en Stripe"}
          </button>
        )}
      </div>
    </section>
  );
}
