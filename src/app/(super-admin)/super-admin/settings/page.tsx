import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getFeatureLabel, isFeatureEnabled, type ProductFeatureKey } from "@/lib/product/features";
import { PRODUCT_PLANS } from "@/lib/plans/catalog";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
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

  const features: ProductFeatureKey[] = [
    "advancedAnalytics",
    "reportsHub",
    "scheduledReports",
    "leakProfitability",
    "whatsapp",
    "paymentMethods",
    "communicationTemplateUse",
  ];

  return (
    <div className="space-y-6 font-sans text-sm text-white/80">
      <header className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zaltyko-electric">Gobierno del producto</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-white">Configuración global</h1>
        <p className="mt-2 max-w-2xl text-white/65">
          Centro de referencia para las capacidades activas y el catálogo comercial. Los cambios
          sensibles se gestionan mediante revisión de código y variables protegidas, no desde una
          consola improvisada.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="font-display text-lg font-semibold text-white">Capacidades por entorno</h2>
        <p className="mt-1 text-xs text-white/55">Estado efectivo leído de las variables de feature flag del deployment.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const enabled = isFeatureEnabled(feature);
            return (
              <div key={feature} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                <span className="font-medium text-white/85">{getFeatureLabel(feature)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/55"}`}>
                  {enabled ? "Activa" : "En reserva"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="font-display text-lg font-semibold text-white">Catálogo comercial vigente</h2>
        <p className="mt-1 text-xs text-white/55">Nombres y límites públicos definidos en el repositorio.</p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-black/10 text-xs uppercase tracking-wide text-white/50">
              <tr>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Gimnastas</th>
                <th className="px-4 py-3 font-medium">Academias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {PRODUCT_PLANS.map((plan) => (
                <tr key={plan.code}>
                  <td className="px-4 py-3 font-semibold text-white">{plan.publicName}</td>
                  <td className="px-4 py-3 text-white/70">{plan.priceEurCents === 0 ? "Incluido" : `${(plan.priceEurCents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })} / mes`}</td>
                  <td className="px-4 py-3 text-white/70">{plan.athleteLimit?.toLocaleString("es-ES") ?? "Ilimitadas"}</td>
                  <td className="px-4 py-3 text-white/70">{plan.academyLimit?.toLocaleString("es-ES") ?? "Ilimitadas"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/super-admin/dashboard" className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/25">
          <p className="font-semibold text-white">Métricas de dirección</p>
          <p className="mt-1 text-xs text-white/55">Volver al pulso global del SaaS.</p>
        </Link>
        <Link href="/super-admin/academies" className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/25">
          <p className="font-semibold text-white">Academias</p>
          <p className="mt-1 text-xs text-white/55">Gestionar estado y configuración por academia.</p>
        </Link>
        <Link href="/docs" className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/25">
          <p className="font-semibold text-white">Documentación operativa</p>
          <p className="mt-1 text-xs text-white/55">Consultar contratos y procedimientos del producto.</p>
        </Link>
      </section>
    </div>
  );
}
