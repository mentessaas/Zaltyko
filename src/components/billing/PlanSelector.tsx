"use client";

import { useState } from "react";

import type { BillingInterval, PlanSummary, BillingSummary, PlanCode } from "@/types/billing";
import { PRODUCT_PLAN_BY_CODE, getProductPlanPublicName } from "@/lib/plans/catalog";

const PLAN_COPY: Record<string, { title: string; description: string }> = {
  free: {
    title: PRODUCT_PLAN_BY_CODE.free.publicName,
    description: PRODUCT_PLAN_BY_CODE.free.shortDescription,
  },
  pro: {
    title: PRODUCT_PLAN_BY_CODE.pro.publicName,
    description: PRODUCT_PLAN_BY_CODE.pro.shortDescription,
  },
  premium: {
    title: PRODUCT_PLAN_BY_CODE.premium.publicName,
    description: PRODUCT_PLAN_BY_CODE.premium.shortDescription,
  },
};

function formatPlanPrice(plan: PlanSummary) {
  const catalogPlan = PRODUCT_PLAN_BY_CODE[plan.code as PlanCode];
  const amount = (plan.priceEur ?? catalogPlan?.priceEurCents ?? 0) / 100;
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

function resolvePlanDescription(plan: PlanSummary) {
  return PLAN_COPY[plan.code]?.description ?? "Plan sincronizado automáticamente desde Stripe.";
}

interface PlanSelectorProps {
  plans: PlanSummary[];
  currentSummary: BillingSummary | null;
  loading: boolean;
  onSelectPlan: (planCode: PlanCode, billingInterval?: BillingInterval) => void;
  loadingAction: PlanCode | null;
  disabled: boolean;
}

export function PlanSelector({
  plans,
  currentSummary,
  loading,
  onSelectPlan,
  loadingAction,
  disabled,
}: PlanSelectorProps) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  const annualAvailable = plans.some((plan) => Boolean(plan.stripeAnnualPriceId && plan.annualPriceEur));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Planes disponibles</h2>
        {loading && <p className="text-sm text-muted-foreground">Sincronizando con Stripe…</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periodicidad de facturación">
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm font-medium ${billingInterval === "month" ? "bg-primary text-white" : "border border-border"}`}
          onClick={() => setBillingInterval("month")}
        >
          Mensual
        </button>
        <button
          type="button"
          disabled={!annualAvailable}
          className={`rounded-full px-4 py-2 text-sm font-medium ${billingInterval === "year" ? "bg-primary text-white" : "border border-border"} disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => setBillingInterval("year")}
          title={annualAvailable ? "Pagar una vez al año" : "La facturación anual se está configurando"}
        >
          Anual{annualAvailable ? " · ahorra 2 meses" : " · próximamente"}
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            No hay planes disponibles. Comprueba la sincronización con Stripe.
          </p>
        )}
        {plans.map((plan) => {
          const code = plan.code as PlanCode;
          const isCurrent = currentSummary?.planCode === plan.code;
          const isFree = plan.priceEur === 0;
          const isAnnual = billingInterval === "year";
          const annualReady = Boolean(plan.stripeAnnualPriceId && plan.annualPriceEur);
          const displayPrice = isAnnual && annualReady ? plan.annualPriceEur ?? 0 : plan.priceEur;
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
                  {formatPlanPrice({ ...plan, priceEur: displayPrice })}{" "}
                  {isAnnual && annualReady ? (
                    <span className="text-sm font-normal text-muted-foreground">/ año</span>
                  ) : plan.billingInterval ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      / {plan.billingInterval}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="mt-4 flex flex-1 flex-col justify-end space-y-2">
                {plan.athleteLimit != null && (
                  <p className="text-xs text-muted-foreground">
                    Hasta {plan.athleteLimit} gimnastas incluidos
                  </p>
                )}
                <button
                  className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50"
                  disabled={isFree || isCurrent || loadingAction === code || disabled || (isAnnual && !annualReady)}
                  onClick={() => onSelectPlan(code, billingInterval)}
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
  );
}
