import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";
import { OwnerOperationalSummaryPanel } from "./OwnerOperationalSummaryPanel";
import { ownerWorkspaceCapabilitiesFor } from "./owner-workspace-capabilities";

/** Launch surface: persisted operations only; no analytics worker dependency. */
export function OwnerEssentialDashboard({
  scope,
  operationalSummary,
}: {
  scope: OwnerScope;
  operationalSummary: OwnerOperationalSummary | null;
}) {
  const params = new URLSearchParams({ organizationId: scope.organization.id });
  if (scope.selectedLocationId) params.set("locationId", scope.selectedLocationId);
  const capabilities = ownerWorkspaceCapabilitiesFor(scope.member);
  const links: Array<[string, string]> = [];
  if (capabilities.canManageOrganizationAthletes) {
    links.push(["Gimnastas", `/owner/athletes?organizationId=${scope.organization.id}`]);
  }
  links.push(
    ["Grupos", `/owner/groups?${params}`],
    ["Clases", `/owner/classes?${params}`],
    ["Inscripciones", `/owner/enrollments?${params}`],
    ["Asistencia", `/owner/attendance?${params}`],
  );
  if (capabilities.canManageFinancials) {
    links.push(
      ["Cuotas mensuales", `/owner/monthly-invoices?${params}`],
      ["Cobros manuales", `/owner/payments?${params}`]
    );
  }
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950 sm:py-12 lg:px-10">
      <div className="mx-auto min-w-0 max-w-6xl">
        <header className="mb-8">
          <p className="break-words text-sm font-semibold text-teal-800">{scope.organization.name}</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">Resumen</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">La actividad de tu club, a mano para organizar el día.</p>
        </header>
        <form action="/owner" method="get" className="flex min-w-0 flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:p-6">
          <input type="hidden" name="organizationId" value={scope.organization.id} />
          <label className="grid min-w-0 max-w-full gap-2 text-sm font-semibold text-slate-900 sm:flex-1">
            Sede
            <select name="locationId" defaultValue={scope.selectedLocationId ?? ""} className="min-h-12 min-w-0 w-full max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base font-normal text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
              {scope.canViewOrganizationAggregate && <option value="">Todas las sedes autorizadas</option>}
              {scope.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <button type="submit" className="touch-target inline-flex min-h-12 max-w-full items-center justify-center rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">Ver resumen</button>
        </form>
        <OwnerOperationalSummaryPanel summary={operationalSummary} />
        <nav aria-label="Operaciones de la academia" className="mt-8 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map(([label, href]) => (
            <Link key={label} href={href} className="touch-target group flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 font-semibold text-slate-900 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
              <span className="min-w-0 break-words">{label}</span>
              <ArrowUpRight aria-hidden="true" className="h-5 w-5 shrink-0 text-teal-800" />
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
