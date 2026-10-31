import Link from "next/link";

import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";
import { OwnerOperationalSummaryPanel } from "./OwnerOperationalSummaryPanel";

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
  const links = [
    ["Gimnastas", `/owner/athletes?organizationId=${scope.organization.id}`],
    ["Grupos", `/owner/groups?${params}`],
    ["Clases", `/owner/classes?${params}`],
    ["Inscripciones", `/owner/enrollments?${params}`],
    ["Asistencia", `/owner/attendance?${params}`],
    ["Cuotas mensuales", `/owner/monthly-invoices?${params}`],
    ["Cobros manuales", `/owner/payments?${params}`],
  ];
  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-8 text-slate-950 sm:py-12 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold">Tu academia</h1>
        <p className="mt-2 text-slate-700">{scope.organization.name}</p>
        <form action="/owner" method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <input type="hidden" name="organizationId" value={scope.organization.id} />
          <label className="grid min-w-0 max-w-full gap-1 text-sm font-semibold">
            Sede
            <select name="locationId" defaultValue={scope.selectedLocationId ?? ""} className="min-h-11 max-w-full border border-slate-400 bg-white px-3">
              {scope.canViewOrganizationAggregate && <option value="">Todas las sedes autorizadas</option>}
              {scope.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-full bg-teal-800 px-5 text-sm font-semibold text-white">Ver resumen</button>
        </form>
        <OwnerOperationalSummaryPanel summary={operationalSummary} />
        <nav aria-label="Operaciones de la academia" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map(([label, href]) => <Link key={label} href={href} className="touch-target rounded border border-slate-300 bg-white p-4 font-semibold text-teal-900 underline underline-offset-4">{label}</Link>)}
        </nav>
      </div>
    </main>
  );
}
