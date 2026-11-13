import Link from "next/link";
import {
  type LucideIcon,
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  MapPin,
  Receipt,
  Sparkles,
  UserPlus,
  UsersRound,
} from "lucide-react";

import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";
import type { OwnerTodaySessions } from "@/modules/owner-dashboard/application/today-sessions";
import { OwnerOperationalSummaryPanel } from "./OwnerOperationalSummaryPanel";
import { OwnerTodaySessionsPanel } from "./OwnerTodaySessionsPanel";
import { OwnerAttentionPanel } from "./OwnerAttentionPanel";
import type { OwnerAttentionItems } from "@/modules/owner-dashboard/application/attention-items";
import {
  buildOwnerSetupChecklist,
  type OwnerSetupProgress,
} from "@/modules/owner-dashboard/application/setup-checklist-steps";
import { OwnerSetupChecklistPanel } from "./OwnerSetupChecklistPanel";
import { OwnerSummaryHero } from "./OwnerSummaryHero";
import { ownerGreetingName, ownerSummaryNextStep } from "./owner-summary-next-step";
import { ownerWorkspaceCapabilitiesFor } from "./owner-workspace-capabilities";
import { ownerUi } from "./owner-ui";

const QUICK_LINK_ICONS: Record<string, LucideIcon> = {
  Gimnastas: Sparkles,
  Grupos: UsersRound,
  Clases: CalendarDays,
  Inscripciones: UserPlus,
  Asistencia: ClipboardCheck,
  "Cuotas mensuales": Receipt,
  "Cobros manuales": CreditCard,
};

/** Launch surface: persisted operations only; no analytics worker dependency. */
export function OwnerEssentialDashboard({
  scope,
  operationalSummary,
  todaySessions,
  attentionItems,
  setupProgress,
  viewerName,
}: {
  scope: OwnerScope;
  operationalSummary: OwnerOperationalSummary | null;
  todaySessions?: OwnerTodaySessions | null;
  attentionItems?: OwnerAttentionItems | null;
  /** Launch checklist facts; null/undefined (query failed or role excluded) hides it. */
  setupProgress?: OwnerSetupProgress | null;
  /** Nombre declarado al crear la cuenta; solo para el saludo del hero. */
  viewerName?: string | null;
}) {
  const dayTimezone =
    scope.locations.find((location) => location.id === scope.selectedLocationId)?.timezone ??
    scope.locations[0]?.timezone ??
    "Europe/Madrid";
  const params = new URLSearchParams({ organizationId: scope.organization.id });
  if (scope.selectedLocationId) params.set("locationId", scope.selectedLocationId);
  const capabilities = ownerWorkspaceCapabilitiesFor(scope.member);
  const setupChecklist = setupProgress
    ? buildOwnerSetupChecklist(setupProgress, {
        organizationId: scope.organization.id,
        selectedLocationId: scope.selectedLocationId,
        canManageOrganizationAthletes: capabilities.canManageOrganizationAthletes,
      })
    : null;
  const selectedLocationName =
    scope.locations.find((location) => location.id === scope.selectedLocationId)?.name ?? null;
  const nextStep = ownerSummaryNextStep({
    organizationId: scope.organization.id,
    scopeQuery: params.toString(),
    setupChecklist,
    todaySessions,
    attentionItems,
  });
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
    <main className={ownerUi.page}>
      <OwnerSummaryHero
        organizationId={scope.organization.id}
        organizationName={scope.organization.name}
        scopeLabel={selectedLocationName ?? (scope.canViewOrganizationAggregate ? "Todas las sedes" : null)}
        greetingName={ownerGreetingName(viewerName)}
        nextStep={nextStep}
        timeZone={dayTimezone}
        subscriptionHref={
          capabilities.canManageSubscription
            ? `/owner/subscription?${new URLSearchParams({ organizationId: scope.organization.id })}`
            : null
        }
      />
      <div className="mt-4 flex min-w-0 justify-end">
        <form action="/owner" method="get" className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="organizationId" value={scope.organization.id} />
          <label className="grid min-w-0 max-w-full gap-1.5 text-xs font-semibold text-z-soft sm:w-64">
            Sede
            <span className="relative flex min-w-0 items-center">
              <MapPin aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-z-soft" />
              <select name="locationId" defaultValue={scope.selectedLocationId ?? ""} className={`${ownerUi.field} pl-9 font-medium`}>
                {scope.canViewOrganizationAggregate && <option value="">Todas las sedes autorizadas</option>}
                {scope.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </span>
          </label>
          <button type="submit" className={ownerUi.secondaryButton}>Ver resumen</button>
        </form>
      </div>
      {setupChecklist ? (
        <OwnerSetupChecklistPanel
          checklist={setupChecklist}
          locationName={selectedLocationName}
        />
      ) : null}
      <OwnerOperationalSummaryPanel summary={operationalSummary} />
      {todaySessions !== undefined || attentionItems !== undefined ? (
        <div className="mt-6 grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {todaySessions !== undefined ? (
            <OwnerTodaySessionsPanel
              organizationId={scope.organization.id}
              classesHref={`/owner/classes?${params}`}
              today={todaySessions}
            />
          ) : null}
          {attentionItems !== undefined ? (
            <OwnerAttentionPanel
              organizationId={scope.organization.id}
              scopeQuery={params.toString()}
              items={attentionItems}
            />
          ) : null}
        </div>
      ) : null}
      <h2 className={`mt-9 ${ownerUi.sectionTitle}`}>Accesos rápidos</h2>
      <nav aria-label="Operaciones de la academia" className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {links.map(([label, href]) => {
          const Icon = QUICK_LINK_ICONS[label] ?? ArrowUpRight;
          return (
            <Link key={label} href={href} className="touch-target group flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-z-line bg-white px-4 py-3 text-sm font-semibold text-z-ink transition-colors hover:border-z-brand-100 hover:bg-z-brand-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-z-canvas text-z-brand-600 transition-colors group-hover:bg-white">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 break-words">{label}</span>
              <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-z-soft transition-colors group-hover:text-z-brand-600" />
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
