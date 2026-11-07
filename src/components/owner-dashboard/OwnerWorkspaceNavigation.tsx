"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import {
  type LucideIcon,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  MoreHorizontal,
  Sparkles,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { OwnerOperationalPolicy } from "./OwnerOperationalPolicy";
import { OwnerSignOutButton } from "./OwnerSignOutButton";
import type { OwnerWorkspaceCapabilities } from "./owner-workspace-capabilities";

type NavigationItem = {
  label: string;
  href: string;
  active: boolean;
  desktopOverflow?: boolean;
  capability?: keyof OwnerWorkspaceCapabilities;
};

const ITEM_ICONS: Record<string, LucideIcon> = {
  Resumen: LayoutDashboard,
  Asistencia: ClipboardCheck,
  Clases: CalendarDays,
  Gimnastas: Sparkles,
  Grupos: UsersRound,
  Inscripciones: UserPlus,
  Equipo: Users,
  Cobros: Wallet,
  Plan: CreditCard,
};

const DESKTOP_SECTIONS: ReadonlyArray<{ title: string; labels: readonly string[] }> = [
  { title: "Día a día", labels: ["Resumen", "Asistencia", "Clases"] },
  { title: "Personas", labels: ["Gimnastas", "Grupos", "Inscripciones"] },
  { title: "Club", labels: ["Cobros"] },
];

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500";

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
  previewMode = false,
}: {
  capabilities?: OwnerWorkspaceCapabilities;
  organizationId?: string | null;
  locationId?: string | null;
  previewMode?: boolean;
}) {
  const mobileMoreRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreSummaryRef = useRef<HTMLElement>(null);
  const desktopMoreRef = useRef<HTMLDetailsElement>(null);
  const desktopMoreSummaryRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
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
  const dashboardHref = `${dashboardPath}${scopedQuery}`;
  const isDashboardPreview = previewMode && pathname === "/owner/preview";
  const showNavigation = !(pathname === "/owner/setup" && !organizationId);
  const preview = previewMode;

  const navigationItems: NavigationItem[] = [
    {
      label: "Resumen",
      href: dashboardHref,
      active: isRouteActive(pathname, dashboardPath),
    },
    {
      label: "Grupos",
      href: `/owner/groups${scopedQuery}`,
      active: isRouteActive(pathname, "/owner/groups"),
    },
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
  const visibleNavigationItems = navigationItems.filter(
    (item) =>
      previewMode ||
      !item.capability ||
      capabilities?.[item.capability] === true
  );
  const desktopPrimaryItems = visibleNavigationItems.filter((item) => !item.desktopOverflow);
  const desktopMoreItems = visibleNavigationItems.filter((item) => item.desktopOverflow);
  const activeDesktopMoreItem = desktopMoreItems.find((item) => item.active);
  // Keep attendance among the five daily tasks. Organization-wide actions stay under More.
  const mobileItems = visibleNavigationItems
    .filter((item) => !item.href.startsWith("/owner/athletes") && !item.desktopOverflow)
    .slice(0, 5);
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

  const brand = (
    <Link
      href={dashboardHref}
      className={`touch-target inline-flex shrink-0 items-center gap-2.5 rounded-xl text-z-ink ${FOCUS_RING}`}
    >
      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-z-ink font-display text-sm font-bold text-white">
        Z
      </span>
      <span>
        <span className="block font-display text-[17px] font-bold leading-none tracking-tight">
          Zaltyko
        </span>
        <span className="mt-1 block text-xs font-medium text-z-soft">
          Tu club
        </span>
      </span>
    </Link>
  );

  return (
    <>
      <a
        href="#owner-workspace-content"
        className={`fixed left-4 top-3 z-50 -translate-y-24 rounded-xl bg-z-ink px-4 py-3 text-sm font-semibold text-white transition-transform focus:translate-y-0 ${FOCUS_RING}`}
      >
        Saltar al contenido
      </a>
      {showNavigation ? (
        <aside
          data-owner-sidebar=""
          className="peer fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-y-auto border-r border-z-line bg-white xl:flex"
        >
          <div className="px-5 pb-5 pt-5">{brand}</div>
          <nav aria-label="Principal" className="flex flex-1 flex-col gap-0.5 px-3 pb-6">
            {desktopSections.map((section, sectionIndex) => [
              <p
                key={`section-${section.title}`}
                aria-hidden="true"
                className={`px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-z-soft ${sectionIndex === 0 ? "" : "pt-5"}`}
              >
                {section.title}
              </p>,
              ...section.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`touch-target flex items-center gap-3 rounded-lg px-3 text-sm transition-colors ${FOCUS_RING} ${item.active ? "bg-z-brand-50 font-semibold text-z-brand-700" : "font-medium text-z-ink/80 hover:bg-z-canvas hover:text-z-ink"}`}
                >
                  <ItemIcon label={item.label} className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              )),
            ])}
            {desktopMoreItems.length > 0 ? (
              <details ref={desktopMoreRef} className="mt-0.5">
                <summary
                  ref={desktopMoreSummaryRef}
                  aria-label={activeDesktopMoreItem ? `Más opciones. Página actual: ${activeDesktopMoreItem.label}` : "Más opciones"}
                  className={`touch-target flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${FOCUS_RING} [&::-webkit-details-marker]:hidden ${activeDesktopMoreItem ? "text-z-brand-700" : "text-z-ink/80 hover:bg-z-canvas hover:text-z-ink"}`}
                >
                  <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
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
                        className={`touch-target flex items-center gap-3 rounded-lg px-3 text-sm transition-colors ${FOCUS_RING} ${item.active ? "bg-z-brand-50 font-semibold text-z-brand-700" : "font-medium text-z-ink/80 hover:bg-z-canvas hover:text-z-ink"}`}
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
        </aside>
      ) : null}
      <header className="relative z-20 border-b border-z-line bg-white xl:sticky xl:top-0 xl:bg-white/90 xl:backdrop-blur xl:peer-data-[owner-sidebar]:pl-[248px]">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-5 py-3 lg:px-10">
          <div className={showNavigation ? "xl:invisible" : undefined}>{brand}</div>
          {preview ? (
            <span className="shrink-0 rounded-full border border-z-brand-100 bg-z-brand-50 px-3 py-2 text-xs font-semibold text-z-brand-700">
              Vista sintética
            </span>
          ) : <OwnerSignOutButton />}
        </div>
        {showNavigation ? (
          <nav
            aria-label="Navegación móvil"
            className="mx-auto grid max-w-[92rem] grid-cols-3 gap-1 px-3 pb-3 sm:grid-cols-6 sm:px-5 lg:px-10 xl:hidden"
          >
            {mobileItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={`touch-target flex min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1 py-1.5 text-center text-xs font-semibold leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-z-brand-500 ${item.active ? "bg-z-brand-50 text-z-brand-700" : "text-z-soft hover:bg-z-canvas hover:text-z-ink"}`}
              >
                <ItemIcon label={item.label} className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            ))}
            {secondaryMobileItems.length > 0 ? (
              <details ref={mobileMoreRef} className="relative flex min-w-0">
                <summary
                  ref={mobileMoreSummaryRef}
                  aria-label={activeSecondaryMobileItem ? `Más opciones. Página actual: ${activeSecondaryMobileItem.label}` : "Más opciones"}
                  className={`touch-target flex w-full cursor-pointer list-none flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1 py-1.5 text-center text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-z-brand-500 [&::-webkit-details-marker]:hidden ${activeSecondaryMobileItem ? "bg-z-brand-50 text-z-brand-700" : "text-z-soft hover:bg-z-canvas hover:text-z-ink"}`}
                >
                  <MoreHorizontal className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span>Más</span>
                </summary>
                <ul className="absolute right-0 top-full z-30 mt-2 min-w-48 rounded-2xl border border-z-line bg-white p-2 shadow-lg shadow-slate-900/10">
                  {secondaryMobileItems.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (mobileMoreRef.current) mobileMoreRef.current.open = false;
                          mobileMoreSummaryRef.current?.focus({ preventScroll: true });
                        }}
                        aria-current={item.active ? "page" : undefined}
                        className={`touch-target flex items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${FOCUS_RING} ${item.active ? "bg-z-brand-50 text-z-brand-700" : "text-z-ink/80 hover:bg-z-canvas hover:text-z-ink"}`}
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
      </header>
      {organizationId && !preview ? (
        <div className="xl:peer-data-[owner-sidebar]:pl-[248px]">
          <OwnerOperationalPolicy key={`${organizationId}:${locationId ?? ""}`} organizationId={organizationId} locationId={locationId} />
        </div>
      ) : null}
    </>
  );
}
