"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { OwnerPlanUsage } from "./OwnerPlanUsage";
import { OwnerSignOutButton } from "./OwnerSignOutButton";

type NavigationItem = {
  label: string;
  href: string;
  active: boolean;
};

function isRouteActive(pathname: string, route: string) {
  return route === "/owner"
    ? pathname === route
    : pathname === route || pathname.startsWith(`${route}/`);
}

export function OwnerWorkspaceNavigation() {
  const mobileMoreRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreSummaryRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId");
  const locationId = searchParams.get("locationId");
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
  const isDashboardPreview = pathname === "/owner/preview";
  const showNavigation = !(pathname === "/owner/setup" && !organizationId);
  const preview = pathname.includes("/preview");

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
    },
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
    },
    ...(!isDashboardPreview
      ? [
          {
            label: "Plan",
            href: `/owner/subscription${organizationQuery}`,
            active: isRouteActive(pathname, "/owner/subscription"),
          },
        ]
      : []),
  ];
  // Keep attendance among the five daily tasks. The organization-wide intake
  // stays available under More without displacing a location-scoped task.
  const mobileItems = navigationItems
    .filter((item) => !item.href.startsWith("/owner/athletes"))
    .slice(0, 5);
  const secondaryMobileItems = navigationItems.filter((item) => !mobileItems.includes(item));

  return (
    <>
      <a
        href="#owner-workspace-content"
        className="fixed left-4 top-3 z-50 -translate-y-24 rounded-full bg-slate-950 px-4 py-3 text-sm font-bold text-white transition-transform focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-slate-300/80 bg-[#F8F8F4]">
        <div className="mx-auto max-w-[92rem] px-5 py-4 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <Link
              href={dashboardHref}
              className="touch-target inline-flex shrink-0 items-center gap-3 text-slate-950"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-800 font-display text-sm font-bold text-white">
                Z
              </span>
              <span>
                <span className="block font-display text-base font-bold leading-none">
                  Zaltyko
                </span>
                <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                  Mesa de dirección
                </span>
              </span>
            </Link>
            {showNavigation ? (
              <nav
                aria-label="Principal"
                className="hidden min-w-0 items-center gap-1 xl:flex"
              >
                {navigationItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={item.active ? "page" : undefined}
                    className={`touch-target inline-flex items-center rounded-full px-4 text-sm font-semibold ${item.active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            {preview ? (
              <span className="shrink-0 rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600">
                Vista sintética
              </span>
            ) : <OwnerSignOutButton />}
          </div>
          {showNavigation ? (
            <nav
              aria-label="Navegación móvil"
              className="mt-3 grid grid-cols-3 gap-1 border-t border-slate-300 pt-2 sm:grid-cols-6 xl:hidden"
            >
              {mobileItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`touch-target flex min-w-0 items-center justify-center whitespace-nowrap px-1 text-center text-xs font-semibold leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-800 ${item.active ? "text-teal-900" : "text-slate-700"}`}
                >
                  {item.label}
                </Link>
              ))}
              <details ref={mobileMoreRef} className="relative min-w-0">
                <summary ref={mobileMoreSummaryRef} className="touch-target flex cursor-pointer list-none items-center justify-center whitespace-nowrap px-1 text-center text-xs font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-800 [&::-webkit-details-marker]:hidden">
                  <span>Más</span>
                  <ChevronDown
                    className="ml-1 h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                </summary>
                <ul className="absolute right-0 top-full z-30 mt-1 min-w-44 border border-slate-300 bg-white p-1 shadow-lg">
                  {secondaryMobileItems.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (mobileMoreRef.current) mobileMoreRef.current.open = false;
                          mobileMoreSummaryRef.current?.focus({ preventScroll: true });
                        }}
                        aria-current={item.active ? "page" : undefined}
                        className="touch-target flex rounded px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </nav>
          ) : null}
        </div>
      </header>
      {organizationId && !preview ? <OwnerPlanUsage key={organizationId} organizationId={organizationId} compact /> : null}
    </>
  );
}
