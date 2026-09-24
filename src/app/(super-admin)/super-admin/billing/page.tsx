import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getGlobalStats } from "@/lib/superAdminService";
import { PRODUCT_PLANS, formatPlanAmount, getProductPlanPublicName } from "@/lib/plans/catalog";
import { getSubscriptionStatusLabel } from "@/lib/billing/subscription-status-labels";

export const dynamic = "force-dynamic";

export default async function SuperAdminBillingPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await getCurrentProfile(user.id);

  if (!profile || profile.role !== "super_admin") {
    redirect("/app");
  }

  const metrics = await getGlobalStats();
  const formatCurrency = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

  return (
    <div className="space-y-6 font-sans text-sm text-white/80">
      <header className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zaltyko-electric">Operaciones SaaS</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-white">Cobros globales</h1>
        <p className="mt-2 max-w-2xl text-white/65">
          Vista agregada de planes, suscripciones y facturación registrada. Las cifras se leen de la
          base operativa; no se estiman importes ni estados que no estén persistidos.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de facturación">
        {[
          ["Ingresos cobrados", formatCurrency.format(metrics.totals.revenue / 100)],
          ["Facturas pagadas", metrics.totals.paidInvoices.toLocaleString("es-ES")],
          ["Suscripciones", metrics.totals.subscriptions.toLocaleString("es-ES")],
          ["Cargos creados este mes", metrics.totals.chargesCreatedThisMonth.toLocaleString("es-ES")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/55">{label}</p>
            <p className="mt-3 font-display text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Distribución de planes</h2>
              <p className="mt-1 text-xs text-white/55">Suscripciones persistidas por plan comercial.</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
              {metrics.totals.plans} planes en catálogo
            </span>
          </div>
          <div className="mt-5 divide-y divide-white/10">
            {metrics.planDistribution.length === 0 ? (
              <p className="py-4 text-white/55">Todavía no hay suscripciones con plan asignado.</p>
            ) : (
              metrics.planDistribution.map((plan) => (
                <div key={`${plan.code}-${plan.nickname ?? "custom"}`} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-semibold text-white">{getProductPlanPublicName(plan.code, plan.nickname)}</p>
                    <p className="text-xs text-white/50">Código operativo: {plan.code}</p>
                  </div>
                  <span className="font-display text-xl font-semibold text-zaltyko-electric">{plan.total}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-display text-lg font-semibold text-white">Estado de suscripciones</h2>
          <p className="mt-1 text-xs text-white/55">Estados recibidos desde el ciclo de vida de Stripe.</p>
          <div className="mt-5 divide-y divide-white/10">
            {metrics.planStatuses.length === 0 ? (
              <p className="py-4 text-white/55">No hay estados de suscripción registrados.</p>
            ) : (
              metrics.planStatuses.map((status) => (
                <div key={status.status} className="flex items-center justify-between gap-4 py-3">
                  <span className="font-medium text-white/80">{getSubscriptionStatusLabel(status.status)}</span>
                  <span className="font-display text-xl font-semibold text-white">{status.total}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Referencia comercial</h2>
            <p className="mt-1 text-xs text-white/55">Precios públicos configurados para el catálogo actual.</p>
          </div>
          <Link href="/pricing" className="text-xs font-semibold text-zaltyko-electric hover:underline">Ver precios públicos →</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PRODUCT_PLANS.map((plan) => {
            const name = getProductPlanPublicName(plan.code, plan.publicName);
            const price = plan.priceEurCents === 0 ? "Incluido" : formatPlanAmount(plan.priceEurCents);
            return (
              <div key={plan.code} className="rounded-xl border border-white/10 bg-black/10 p-4">
                <p className="font-semibold text-white">{name}</p>
                <p className="mt-1 text-xs text-white/55">{price}{price !== "Incluido" ? " / mes" : ""}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
