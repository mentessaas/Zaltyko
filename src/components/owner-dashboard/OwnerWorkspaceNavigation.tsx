"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { ChevronDown } from "lucide-react";
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

  return (
    <>
      <a
        href="#owner-workspace-content"
        className="fixed left-4 top-3 z-50 -translate-y-24 rounded-xl bg-teal-900 px-4 py-3 text-sm font-semibold text-white transition-transform focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-teal-900/10 bg-white">
        <div className="mx-auto max-w-[92rem] px-5 py-4 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <Link
              href={dashboardHref}
              className="touch-target inline-flex shrink-0 items-center gap-3 rounded-xl text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-800"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-800 font-display text-base font-bold text-white">
                Z
              </span>
              <span>
                <span className="block font-display text-base font-bold leading-none">
                  Zaltyko
                </span>
                <span className="mt-1 block text-xs font-medium text-teal-800">
                  Tu club
                </span>
              </span>
            </Link>
            {showNavigation ? (
              <nav
                aria-label="Principal"
                className="hidden min-w-0 items-center gap-1 xl:flex"
              >
                {desktopPrimaryItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={item.active ? "page" : undefined}
                    className={`touch-target inline-flex items-center rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 ${item.active ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-teal-50 hover:text-teal-900"}`}
                  >
                    {item.label}
                  </Link>
                ))}
                {desktopMoreItems.length > 0 ? (
                  <details ref={desktopMoreRef} className="relative">
                    <summary
                      ref={desktopMoreSummaryRef}
                      aria-label={activeDesktopMoreItem ? `Más opciones. Página actual: ${activeDesktopMoreItem.label}` : "Más opciones"}
                      className={`touch-target inline-flex cursor-pointer list-none items-center rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 [&::-webkit-details-marker]:hidden ${activeDesktopMoreItem ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-teal-50 hover:text-teal-900"}`}
                    >
                      <span>Más</span>
                      <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                    </summary>
                    <ul className="absolute right-0 top-full z-30 mt-2 min-w-44 rounded-2xl border border-teal-900/10 bg-white p-2 shadow-lg shadow-slate-900/10">
                      {desktopMoreItems.map((item) => (
                        <li key={item.label}>
                          <Link
                            href={item.href}
                            onClick={() => {
                              if (desktopMoreRef.current) desktopMoreRef.current.open = false;
                              desktopMoreSummaryRef.current?.focus({ preventScroll: true });
                            }}
                            aria-current={item.active ? "page" : undefined}
                            className={`touch-target flex rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 ${item.active ? "bg-teal-50 text-teal-900" : "text-slate-700 hover:bg-teal-50 hover:text-teal-900"}`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </nav>
            ) : null}
            {preview ? (
              <span className="shrink-0 rounded-full border border-teal-900/10 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900">
                Vista sintética
              </span>
            ) : <OwnerSignOutButton />}
          </div>
          {showNavigation ? (
            <nav
              aria-label="Navegación móvil"
              className="mt-3 grid grid-cols-3 gap-1 border-t border-teal-900/10 pt-3 sm:grid-cols-6 xl:hidden"
            >
              {mobileItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`touch-target flex min-w-0 items-center justify-center whitespace-nowrap rounded-xl px-1 text-center text-xs font-semibold leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-800 ${item.active ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-teal-50 hover:text-teal-900"}`}
                >
                  {item.label}
                </Link>
              ))}
              {secondaryMobileItems.length > 0 ? (
                <details ref={mobileMoreRef} className="relative min-w-0">
                  <summary
                    ref={mobileMoreSummaryRef}
                    aria-label={activeSecondaryMobileItem ? `Más opciones. Página actual: ${activeSecondaryMobileItem.label}` : "Más opciones"}
                    className={`touch-target flex cursor-pointer list-none items-center justify-center whitespace-nowrap rounded-xl px-1 text-center text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-800 [&::-webkit-details-marker]:hidden ${activeSecondaryMobileItem ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-teal-50 hover:text-teal-900"}`}
                  >
                    <span>Más</span>
                    <ChevronDown
                      className="ml-1 h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  </summary>
                  <ul className="absolute right-0 top-full z-30 mt-2 min-w-44 rounded-2xl border border-teal-900/10 bg-white p-2 shadow-lg shadow-slate-900/10">
                    {secondaryMobileItems.map((item) => (
                      <li key={item.label}>
                        <Link
                          href={item.href}
                          onClick={() => {
                            if (mobileMoreRef.current) mobileMoreRef.current.open = false;
                            mobileMoreSummaryRef.current?.focus({ preventScroll: true });
                          }}
                          aria-current={item.active ? "page" : undefined}
                          className={`touch-target flex rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 ${item.active ? "bg-teal-50 text-teal-900" : "text-slate-700 hover:bg-teal-50 hover:text-teal-900"}`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </nav>
          ) : null}
        </div>
      </header>
      {organizationId && !preview ? <OwnerOperationalPolicy key={`${organizationId}:${locationId ?? ""}`} organizationId={organizationId} locationId={locationId} /> : null}
    </>
  );
}
