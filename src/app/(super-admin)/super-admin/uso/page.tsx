import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { getUsageOverview, type UsageWeek } from "@/modules/habitual-use/application/usage-metrics";
import { AT_RISK_INACTIVE_DAYS, type AtRiskAcademy } from "@/modules/habitual-use/domain/usage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Uso | Super admin",
  robots: { index: false, follow: false },
};

const weekFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "Europe/Madrid" });

function weekLabel(weekStart: string): string {
  return `Semana del ${weekFormat.format(new Date(`${weekStart}T00:00:00Z`))}`;
}

function coverage(week: UsageWeek): string {
  if (week.sessionsHeld === 0) return "—";
  return `${Math.round((week.sessionsWithAttendance / week.sessionsHeld) * 100)} %`;
}

function inactivity(academy: AtRiskAcademy): string {
  if (!academy.lastActivityAt) return "Sin actividad registrada";
  return `${academy.inactiveDays} días · última ${dayFormat.format(academy.lastActivityAt)}`;
}

const card = "rounded-2xl border border-white/10 bg-white/[0.055] p-5";

export default async function SuperAdminUsagePage() {
  // El layout ya redirige, pero una página no debe depender de eso para leer datos.
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const profile = await getCurrentProfile(user.id);
  if (!profile || profile.role !== "super_admin") redirect("/app");

  const overview = await getUsageOverview();

  if (!overview.available) {
    return (
      <div className="space-y-6">
        <header>
          <p className="font-display text-xs uppercase tracking-[0.32em] text-zaltyko-electric">Uso habitual</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-white">Uso por semana</h1>
        </header>
        <div className={card} role="status">
          <p className="text-sm leading-6 text-white/70">
            {overview.reason === "flag_off"
              ? "La medición de uso está apagada. Se activa con ZALTYKO_HABITUAL_USE_ENABLED y ZALTYKO_USAGE_METRICS_ENABLED."
              : "Falta la tabla de eventos de uso. Es un candidato pendiente de tu autorización: docs/deployment/candidates/20261114130000_habitual_use_candidate.sql."}
          </p>
        </div>
      </div>
    );
  }

  const [latest, ...older] = overview.weeks;

  return (
    <div className="space-y-8">
      <header>
        <p className="font-display text-xs uppercase tracking-[0.32em] text-zaltyko-electric">Uso habitual</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-white">Uso por semana</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
          Mide si las academias vuelven. La métrica principal es la de sesiones con lista pasada. No hay datos de
          personas ni de menores: son contadores por academia.
        </p>
      </header>

      {latest ? (
        <section aria-labelledby="usage-latest" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <h2 id="usage-latest" className="sr-only">
            Semana en curso
          </h2>
          <article className={card}>
            <p className="text-xs uppercase tracking-[0.16em] text-white/50">Sesiones con lista (principal)</p>
            <p className="mt-4 font-display text-3xl font-semibold text-white">{latest.sessionsWithAttendance}</p>
            <p className="mt-2 text-xs text-white/50">
              {weekLabel(latest.weekStart)} · cobertura {coverage(latest)} de {latest.sessionsHeld} sesiones terminadas
            </p>
          </article>
          <article className={card}>
            <p className="text-xs uppercase tracking-[0.16em] text-white/50">Academias activas</p>
            <p className="mt-4 font-display text-3xl font-semibold text-white">{latest.activeAcademies}</p>
            <p className="mt-2 text-xs text-white/50">
              De {overview.trackedAcademies} en prueba o activas, con lista o visita del equipo
            </p>
          </article>
          <article className={card}>
            <p className="text-xs uppercase tracking-[0.16em] text-white/50">Familias en el portal</p>
            <p className="mt-4 font-display text-3xl font-semibold text-white">{latest.familyAccounts}</p>
            <p className="mt-2 text-xs text-white/50">
              Cuentas distintas (seudónimo semanal) · {latest.familyPortalVisits} entradas (cada apertura de la portada) en {latest.academiesWithFamilyVisits} academias
            </p>
          </article>
          <article className={card}>
            <p className="text-xs uppercase tracking-[0.16em] text-white/50">Academias en riesgo</p>
            <p className="mt-4 font-display text-3xl font-semibold text-white">{overview.atRisk.length}</p>
            <p className="mt-2 text-xs text-white/50">Sin actividad del equipo en {AT_RISK_INACTIVE_DAYS} días o más</p>
          </article>
        </section>
      ) : null}

      <section aria-labelledby="usage-weeks" className={card}>
        <h2 id="usage-weeks" className="font-display text-xl font-semibold text-white">
          Últimas semanas
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm text-white/80">
            <caption className="sr-only">Uso por semana de las academias en prueba o activas</caption>
            <thead className="text-xs uppercase tracking-[0.12em] text-white/50">
              <tr>
                <th scope="col" className="py-2 pr-4">Semana</th>
                <th scope="col" className="py-2 pr-4">Academias activas</th>
                <th scope="col" className="py-2 pr-4">Sesiones con lista</th>
                <th scope="col" className="py-2 pr-4">Cobertura</th>
                <th scope="col" className="py-2 pr-4">Familias (cuentas)</th>
                <th scope="col" className="py-2">Entradas al portal</th>
              </tr>
            </thead>
            <tbody>
              {[...(latest ? [latest] : []), ...older].map((week, index) => (
                <tr key={week.weekStart} className="border-t border-white/10">
                  <th scope="row" className="py-2 pr-4 font-medium text-white">
                    {weekLabel(week.weekStart)}
                    {index === 0 ? " (en curso)" : ""}
                  </th>
                  <td className="py-2 pr-4">{week.activeAcademies}</td>
                  <td className="py-2 pr-4">{week.sessionsWithAttendance}</td>
                  <td className="py-2 pr-4">{coverage(week)}</td>
                  <td className="py-2 pr-4">{week.familyAccounts}</td>
                  <td className="py-2">{week.familyPortalVisits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-5 text-white/50">
          Semanas de lunes a domingo, hora de Madrid. «Academias activas» cuenta las que pasaron lista o abrieron
          Zaltyko el equipo; las visitas de familias no cuentan como actividad de la academia. Las cuentas de
          familia usan un seudónimo que cambia cada semana: no se puede seguir a una familia de una semana a otra.
        </p>
      </section>

      <section aria-labelledby="usage-risk" className={card}>
        <h2 id="usage-risk" className="font-display text-xl font-semibold text-white">
          Academias en riesgo
        </h2>
        {overview.atRisk.length === 0 ? (
          <p className="mt-3 text-sm text-white/65">Ninguna: todas tienen actividad del equipo en la última semana.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {overview.atRisk.map((academy) => (
              <li key={academy.organizationId} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span className="font-medium text-white">
                  {academy.name}{" "}
                  <span className="text-xs font-normal text-white/50">
                    {academy.countryCode} · {academy.status === "trial" ? "en prueba" : "activa"}
                  </span>
                </span>
                <span className="text-sm text-white/65">{inactivity(academy)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs leading-5 text-white/50">
          Una academia entra aquí cuando lleva {AT_RISK_INACTIVE_DAYS} días sin lista pasada ni visita del equipo,
          y tiene al menos {AT_RISK_INACTIVE_DAYS} días de vida. Con el aviso activado recibes un correo solo cuando
          una academia entra en riesgo, una vez por episodio.
        </p>
      </section>
    </div>
  );
}
