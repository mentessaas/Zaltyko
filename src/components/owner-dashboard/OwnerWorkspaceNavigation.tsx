"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import {
  type LucideIcon,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Inbox,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Sparkles,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";
import { ThemeToggle } from "@/components/theme-toggle";
import { OwnerOperationalPolicy } from "./OwnerOperationalPolicy";
import { OwnerSignOutButton } from "./OwnerSignOutButton";
import { OwnerSidebarPlanCard } from "./OwnerSidebarPlanCard";
import type { OwnerWorkspaceCapabilities } from "./owner-workspace-capabilities";
import { demoHrefFor, realPathForDemoPath } from "@/modules/demo/demo-routes";

type NavigationItem = {
  label: string;
  href: string;
  active: boolean;
  desktopOverflow?: boolean;
  capability?: keyof OwnerWorkspaceCapabilities;
  /** Also shown when this other capability is granted. */
  alternativeCapability?: keyof OwnerWorkspaceCapabilities;
  /** Destinations a coach may open: only taking attendance (P1 #8). */
  coachAllowed?: boolean;
};

const ITEM_ICONS: Record<string, LucideIcon> = {
  Resumen: LayoutDashboard,
  Calendario: CalendarRange,
  Asistencia: ClipboardCheck,
  Clases: CalendarDays,
  Gimnastas: Sparkles,
  Grupos: UsersRound,
  Inscripciones: UserPlus,
  Solicitudes: Inbox,
  Equipo: Users,
  Cobros: Wallet,
  Plan: CreditCard,
};

const DESKTOP_SECTIONS: ReadonlyArray<{ title: string; labels: readonly string[] }> = [
  { title: "Día a día", labels: ["Resumen", "Calendario", "Asistencia", "Clases"] },
  { title: "Personas", labels: ["Solicitudes", "Gimnastas", "Grupos", "Inscripciones"] },
  { title: "Club", labels: ["Cobros"] },
];

/** Apartados que la demo pública no incluye; el resto de la navegación es la real. */
const DEMO_HIDDEN_LABELS: ReadonlySet<string> = new Set(["Calendario", "Grupos", "Inscripciones", "Plan"]);

const MOBILE_PRIMARY_LABELS = ["Resumen", "Calendario", "Asistencia", "Clases"] as const;

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500";
/** Sobre el tapiz el anillo de foco es blanco (DESIGN.md, botones). */
const SIDEBAR_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

function ItemIcon({ label, className }: { label: string; className: string }) {
  const Icon = ITEM_ICONS[label];
  return Icon ? <Icon className={className} aria-hidden="true" /> : null;
}

function isRouteActive(pathname: string, route: string) {
  return route === "/owner"
    ? pathname === route
    : pathname === route || pathname.startsWith(`${route}/`);
}

export function OwnerWorkspaceNavigation({
  capabilities,
  organizationId: validatedOrganizationId,
  locationId: validatedLocationId,
  organizationName,
  previewMode = false,
  demo = false,
}: {
  capabilities?: OwnerWorkspaceCapabilities;
  organizationId?: string | null;
  locationId?: string | null;
  /** Nombre de la academia ya autorizada por la página; solo se rotula. */
  organizationName?: string | null;
  previewMode?: boolean;
  /** Demo pública (/demo): rutas de /demo y solo los apartados que incluye. */
  demo?: boolean;
}) {
  const mobileMoreRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreSummaryRef = useRef<HTMLElement>(null);
  const desktopMoreRef = useRef<HTMLDetailsElement>(null);
  const desktopMoreSummaryRef = useRef<HTMLElement>(null);
  const rawPathname = usePathname();
  // En la demo el apartado activo se decide contra las rutas reales equivalentes.
  const pathname = demo ? realPathForDemoPath(rawPathname) : rawPathname;
  const searchParams = useSearchParams();
  const organizationId =
    validatedOrganizationId !== undefined
      ? validatedOrganizationId
      : previewMode
        ? searchParams.get("organizationId")
        : null;
  const locationId =
    validatedLocationId !== undefined
      ? validatedLocationId
      : previewMode
        ? searchParams.get("locationId")
        : null;
  const context = new URLSearchParams();
  if (organizationId) context.set("organizationId", organizationId);
  if (locationId) context.set("locationId", locationId);
  const contextQuery = context.toString();
  const scopedQuery = contextQuery ? `?${contextQuery}` : "";
  const organizationQuery = organizationId
    ? `?${new URLSearchParams({ organizationId }).toString()}`
    : "";
  const dashboardPath = pathname === "/owner/preview" ? pathname : "/owner";
  const dashboardHref = demo ? "/demo" : `${dashboardPath}${scopedQuery}`;
  const isDashboardPreview = previewMode && pathname === "/owner/preview";
  const showNavigation = !(pathname === "/owner/setup" && !organizationId);
  const preview = previewMode;

  const navigationItems: NavigationItem[] = [
    {
      label: "Resumen",
      href: dashboardHref,
      active: isRouteActive(pathname, dashboardPath),
    },
    // La entrenadora también lo ve, solo con sus sesiones asignadas. No existe
    // en la vista sintética de /owner/preview.
    ...(!previewMode
      ? [{
          label: "Calendario",
          href: `/owner/calendar${scopedQuery}`,
          active: isRouteActive(pathname, "/owner/calendar"),
          coachAllowed: true,
        }]
      : []),
    {
      label: "Grupos",
      href: `/owner/groups${scopedQuery}`,
      active: isRouteActive(pathname, "/owner/groups"),
    },
    ...(!previewMode
      ? [{
          label: "Solicitudes",
          href: `/owner/requests${scopedQuery}`,
          active: isRouteActive(pathname, "/owner/requests"),
        }]
      : []),
    {
      label: "Gimnastas",
      href: `/owner/athletes${organizationQuery}`,
      active: isRouteActive(pathname, "/owner/athletes"),
      capability: "canManageOrganizationAthletes",
    },
    ...(!previewMode
      ? [{
          label: "Equipo",
          href: `/owner/staff${organizationQuery}`,
          active: isRouteActive(pathname, "/owner/staff"),
          desktopOverflow: true,
          capability: "canManageStaffProfiles" as const,
          alternativeCapability: "canManageTeamAccess" as const,
        }]
      : []),
    {
      label: "Clases",
      href: `/owner/classes${scopedQuery}`,
      active: isRouteActive(pathname, "/owner/classes"),
    },
    {
      label: "Inscripciones",
      href: isDashboardPreview
        ? "#retention"
        : `/owner/enrollments${scopedQuery}`,
      active: isRouteActive(pathname, "/owner/enrollments"),
    },
    {
      label: "Asistencia",
      href: `/owner/attendance${scopedQuery}`,
      active: isRouteActive(pathname, "/owner/attendance"),
      coachAllowed: true,
    },
    {
      label: "Cobros",
      href: isDashboardPreview
        ? "#metric-collection_rate"
        : `/owner/payments${scopedQuery}`,
      active: isRouteActive(pathname, "/owner/payments"),
      capability: "canManageFinancials",
    },
    ...(!isDashboardPreview
      ? [
          {
            label: "Plan",
            href: `/owner/subscription${organizationQuery}`,
            active: isRouteActive(pathname, "/owner/subscription"),
            desktopOverflow: true,
            capability: "canManageSubscription" as const,
          },
        ]
      : []),
  ];
  // Production pages pass capabilities from their validated server scope.
  // Missing capabilities fail closed; route guards remain authoritative.
  const coachOnly = !previewMode && capabilities?.coachOperationsOnly === true;
  const visibleNavigationItems = navigationItems
    .filter((item) =>
      coachOnly
        ? item.coachAllowed === true
        : previewMode ||
          !item.capability ||
          capabilities?.[item.capability] === true ||
          (item.alternativeCapability !== undefined &&
            capabilities?.[item.alternativeCapability] === true)
    )
    .filter((item) => !demo || !DEMO_HIDDEN_LABELS.has(item.label))
    .map((item) => (demo ? { ...item, href: demoHrefFor(item.href) ?? item.href } : item));
  const desktopPrimaryItems = visibleNavigationItems.filter((item) => !item.desktopOverflow);
  const desktopMoreItems = visibleNavigationItems.filter((item) => item.desktopOverflow);
  const activeDesktopMoreItem = desktopMoreItems.find((item) => item.active);
  // Floor tasks stay one tap away in the bottom bar; four tabs plus More is what
  // fits a 375px phone with full Spanish labels. Everything else lives under More.
  const mobileItems = MOBILE_PRIMARY_LABELS.flatMap((label) =>
    visibleNavigationItems.filter((item) => item.label === label)
  );
  const secondaryMobileItems = visibleNavigationItems.filter(
    (item) => !mobileItems.includes(item)
  );
  const activeSecondaryMobileItem = secondaryMobileItems.find((item) => item.active);

  const sectionedLabels = new Set(DESKTOP_SECTIONS.flatMap((section) => section.labels));
  const desktopSections = DESKTOP_SECTIONS.map((section, index) => ({
    title: section.title,
    items: [
      ...section.labels.flatMap((label) => desktopPrimaryItems.filter((item) => item.label === label)),
      ...(index === DESKTOP_SECTIONS.length - 1
        ? desktopPrimaryItems.filter((item) => !sectionedLabels.has(item.label))
        : []),
    ],
  })).filter((section) => section.items.length > 0);

  const organizationLabel = organizationName?.trim() ? organizationName.trim() : null;
  const canAddAthlete =
    !preview && !coachOnly && capabilities?.canManageOrganizationAthletes === true;
  const addAthleteHref = `/owner/athletes${organizationQuery}#new-athlete-heading`;

  // Lateral «Magnesio sobre tapiz» (como AcademySidebar de /app): la academia
  // rotulada sobre una regla de cinta blanca, su plan, la acción principal y
  // las secciones con rótulo de pista. El activo es un tramo de cinta blanca.
  const sidebarHeader = (
    <div className="border-b-[3px] border-white px-2 pb-4">
      <Link
        href={dashboardHref}
        className={`block rounded-md text-white ${SIDEBAR_FOCUS_RING}`}
      >
        {organizationLabel ? (
          <span className="line-clamp-3 break-words font-display text-2xl font-black uppercase leading-[0.95] [overflow-wrap:anywhere]">
            {organizationLabel}
          </span>
        ) : (
          <ZaltykoLockup markClassName="h-7 w-7" />
        )}
      </Link>
      {organizationId && !preview && !coachOnly ? (
        <OwnerSidebarPlanCard
          organizationId={organizationId}
          subscriptionHref={capabilities?.canManageSubscription ? `/owner/subscription${organizationQuery}` : null}
        />
      ) : null}
    </div>
  );

  const sidebarItemClass = (active: boolean) =>
    `touch-target flex items-center gap-3 rounded-md px-2.5 text-sm font-semibold transition-colors ${SIDEBAR_FOCUS_RING} ${active ? "bg-white text-mat-deep" : "text-white/80 hover:bg-white/10 hover:text-white"}`;

  return (
    <>
      <a
        href="#owner-workspace-content"
        className={`fixed left-4 top-3 z-50 -translate-y-24 rounded-md bg-mat-night px-4 py-3 text-sm font-semibold text-white transition-transform focus:translate-y-0 ${FOCUS_RING}`}
      >
        Saltar al contenido
      </a>
      {showNavigation ? (
        <aside
          data-owner-sidebar=""
          className="peer mat-field-deep fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-y-auto px-4 py-5 text-white xl:flex"
        >
          {sidebarHeader}
          {canAddAthlete ? (
            <Link
              href={addAthleteHref}
              className={`touch-target mt-4 inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 text-sm font-bold text-mat-deep transition-colors hover:bg-chalk ${SIDEBAR_FOCUS_RING}`}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Añadir gimnasta
            </Link>
          ) : null}
          <nav aria-label="Principal" className="mt-6 flex flex-1 flex-col gap-0.5 pb-2">
            {desktopSections.map((section, sectionIndex) => [
              <p
                key={`section-${section.title}`}
                aria-hidden="true"
                className={`floor-label px-2 pb-1.5 text-mat-lane ${sectionIndex === 0 ? "" : "pt-5"}`}
              >
                {section.title}
              </p>,
              ...section.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={sidebarItemClass(item.active)}
                >
                  <ItemIcon label={item.label} className="h-[1.1rem] w-[1.1rem] shrink-0" />
                  {item.label}
                </Link>
              )),
            ])}
            {desktopMoreItems.length > 0 ? (
              <details ref={desktopMoreRef} className="mt-0.5">
                <summary
                  ref={desktopMoreSummaryRef}
                  aria-label={activeDesktopMoreItem ? `Más opciones. Página actual: ${activeDesktopMoreItem.label}` : "Más opciones"}
                  className={`touch-target flex cursor-pointer list-none items-center gap-3 rounded-md px-2.5 text-sm font-semibold transition-colors ${SIDEBAR_FOCUS_RING} [&::-webkit-details-marker]:hidden ${activeDesktopMoreItem ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                >
                  <MoreHorizontal className="h-[1.1rem] w-[1.1rem] shrink-0" aria-hidden="true" />
                  <span>Más</span>
                  <ChevronDown className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
                </summary>
                <ul className="mt-0.5 space-y-0.5 pl-4">
                  {desktopMoreItems.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (desktopMoreRef.current) desktopMoreRef.current.open = false;
                          desktopMoreSummaryRef.current?.focus({ preventScroll: true });
                        }}
                        aria-current={item.active ? "page" : undefined}
                        className={sidebarItemClass(item.active)}
                      >
                        <ItemIcon label={item.label} className="h-[1.1rem] w-[1.1rem] shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </nav>
        </aside>
      ) : null}
      <header className="relative z-20 border-b border-chalk-line bg-white xl:sticky xl:top-0 xl:peer-data-[owner-sidebar]:pl-[248px]">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-5 py-3 lg:px-10">
          <Link
            href={dashboardHref}
            className={`touch-target inline-flex min-w-0 items-center gap-3 rounded-md text-mat-night ${FOCUS_RING}`}
          >
            <ZaltykoLockup className="shrink-0" markClassName="h-7 w-7 text-mat" />
            {organizationLabel ? (
              // En escritorio la academia ya rotula el lateral; aquí solo
              // cuando el lateral no está (móvil y tableta).
              <span
                className={`min-w-0 items-center gap-3 ${showNavigation ? "flex xl:hidden" : "flex"}`}
              >
                <span aria-hidden="true" className="h-6 w-[3px] shrink-0 bg-current" />
                <span className="truncate text-sm font-semibold">{organizationLabel}</span>
              </span>
            ) : null}
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {/* El tema es global (next-themes): el mismo interruptor que la barra de /app. */}
            <ThemeToggle className="h-11 w-11" />
            {preview ? (
              <span className="shrink-0 rounded-md bg-mat-wash px-3 py-2 text-xs font-semibold text-mat-deep">
                {demo ? "Demo" : "Vista sintética"}
              </span>
            ) : <OwnerSignOutButton />}
          </div>
        </div>
      </header>
      {showNavigation ? (
        <nav
          aria-label="Navegación móvil"
          className="fixed inset-x-0 bottom-0 z-30 grid gap-1 border-t border-chalk-line bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_1px_2px_rgba(11,20,48,0.06),0_2px_6px_-2px_rgba(11,20,48,0.08)] backdrop-blur xl:hidden"
          style={{ gridTemplateColumns: `repeat(${mobileItems.length + (secondaryMobileItems.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {mobileItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`touch-target flex min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-1.5 text-center text-xs font-semibold leading-tight transition-colors ${FOCUS_RING} ${item.active ? "bg-mat text-white" : "text-z-soft hover:bg-z-canvas hover:text-z-ink"}`}
            >
              <ItemIcon label={item.label} className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          ))}
          {secondaryMobileItems.length > 0 ? (
            <details ref={mobileMoreRef} className="relative flex min-w-0">
              <summary
                ref={mobileMoreSummaryRef}
                aria-label={activeSecondaryMobileItem ? `Más opciones. Página actual: ${activeSecondaryMobileItem.label}` : "Más opciones"}
                className={`touch-target flex w-full cursor-pointer list-none flex-col items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-1.5 text-center text-xs font-semibold transition-colors ${FOCUS_RING} [&::-webkit-details-marker]:hidden ${activeSecondaryMobileItem ? "bg-mat text-white" : "text-z-soft hover:bg-z-canvas hover:text-z-ink"}`}
              >
                <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>Más</span>
              </summary>
              <ul className="absolute bottom-full right-0 z-30 mb-2 min-w-48 rounded-xl border border-chalk-line bg-white p-2 shadow-[0_6px_20px_-6px_rgba(11,20,48,0.18)]">
                {secondaryMobileItems.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      onClick={() => {
                        if (mobileMoreRef.current) mobileMoreRef.current.open = false;
                        mobileMoreSummaryRef.current?.focus({ preventScroll: true });
                      }}
                      aria-current={item.active ? "page" : undefined}
                      className={`touch-target flex items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors ${FOCUS_RING} ${item.active ? "bg-mat-wash text-mat-deep" : "text-z-ink/80 hover:bg-z-canvas hover:text-z-ink"}`}
                    >
                      <ItemIcon label={item.label} className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </nav>
      ) : null}
      {organizationId && !preview ? (
        <div className="xl:peer-data-[owner-sidebar]:pl-[248px]">
          <OwnerOperationalPolicy key={`${organizationId}:${locationId ?? ""}`} organizationId={organizationId} locationId={locationId} />
        </div>
      ) : null}
    </>
  );
}
