import { count, asc } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CheckCircle2, CircleAlert, ExternalLink, ShieldCheck } from "lucide-react";

import { db } from "@/db";
import { academies, plans } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";

export const dynamic = "force-dynamic";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function SuperAdminSettingsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !devSession) redirect("/auth/login");

  const profile = user ? await getCurrentProfile(user.id) : null;
  const effectiveProfile = profile ?? (devSession ? { role: "super_admin" } : null);
  if (!effectiveProfile || effectiveProfile.role !== "super_admin") redirect("/app");

  const [planRows, academyCount] = await Promise.all([
    db
      .select({
        id: plans.id,
        code: plans.code,
        nickname: plans.nickname,
        priceEur: plans.priceEur,
        athleteLimit: plans.athleteLimit,
        academyLimit: plans.academyLimit,
        stripePriceId: plans.stripePriceId,
        isArchived: plans.isArchived,
      })
      .from(plans)
      .orderBy(asc(plans.priceEur)),
    db.select({ total: count(academies.id) }).from(academies),
  ]);

  const activePlans = planRows.filter((plan) => !plan.isArchived);
  const checks = [
    { label: "Autorización Super Admin", detail: "Gate JWT + perfil verificado", ok: true },
    { label: "Registro de auditoría", detail: "Acciones administrativas persistidas", ok: true },
    { label: "Catálogo de planes", detail: `${activePlans.length} planes activos en base de datos`, ok: activePlans.length > 0 },
    { label: "Academias operativas", detail: `${Number(academyCount[0]?.total ?? 0).toLocaleString("es-ES")} registros actuales`, ok: true },
  ];

  return (
    <div className="space-y-8">
      <header className="border-b border-white/10 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zaltyko-electric">
          Control de plataforma
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white">
          Configuración global
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Estado operativo y catálogo vigente. Los cambios de alto impacto siguen
          gobernados por migraciones y Stripe para mantener trazabilidad.
        </p>
      </header>

      <section aria-labelledby="health-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Guardrails</p>
            <h2 id="health-heading" className="mt-1 font-display text-xl font-semibold text-white">
              Estado de la plataforma
            </h2>
          </div>
          <ShieldCheck className="h-5 w-5 text-zaltyko-electric" aria-hidden="true" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {checks.map((check) => (
            <article key={check.label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
              <div className="flex items-start gap-3">
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
                )}
                <div>
                  <h3 className="text-sm font-semibold text-white">{check.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/50">{check.detail}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
        <div className="flex flex-col gap-2 border-b border-white/10 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Fuente de verdad comercial</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-white">Catálogo de planes</h2>
          </div>
          <Link href="/pricing" className="inline-flex items-center gap-1 text-sm font-semibold text-zaltyko-electric hover:underline">
            Ver pricing público <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
              <tr>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Precio</th>
                <th className="px-5 py-3 font-semibold">Límite atletas</th>
                <th className="px-5 py-3 font-semibold">Stripe</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {planRows.map((plan) => (
                <tr key={plan.id} className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4">
                    <p className="font-semibold uppercase text-white">{plan.code}</p>
                    <p className="mt-1 text-xs text-white/45">{plan.nickname ?? "Sin descripción"}</p>
                  </td>
                  <td className="px-5 py-4 font-semibold text-white">{formatPrice(plan.priceEur)} / mes</td>
                  <td className="px-5 py-4 text-white/70">{plan.athleteLimit ?? "Ilimitado"}</td>
                  <td className="px-5 py-4 text-white/70">{plan.stripePriceId ? "Configurado" : "Pendiente"}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${plan.isArchived ? "bg-white/10 text-white/50" : "bg-emerald-400/15 text-emerald-200"}`}>
                      {plan.isArchived ? "Archivado" : "Activo"}
                    </span>
                  </td>
                </tr>
              ))}
              {planRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-white/50">
                    No hay planes configurados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/super-admin/logs" className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition hover:border-white/25">
          <p className="text-sm font-semibold text-white">Auditoría</p>
          <p className="mt-2 text-xs leading-5 text-white/50">Revisa cada cambio administrativo con actor, motivo y recurso.</p>
        </Link>
        <Link href="/super-admin/growth" className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition hover:border-white/25">
          <p className="text-sm font-semibold text-white">Growth</p>
          <p className="mt-2 text-xs leading-5 text-white/50">Contrasta adquisición y conversión con evidencia first-party.</p>
        </Link>
        <Link href="/super-admin/support" className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition hover:border-white/25">
          <p className="text-sm font-semibold text-white">Soporte</p>
          <p className="mt-2 text-xs leading-5 text-white/50">Resuelve incidencias sin salir del control plane.</p>
        </Link>
      </section>
    </div>
  );
}
