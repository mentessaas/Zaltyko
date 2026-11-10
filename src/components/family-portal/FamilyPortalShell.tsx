import Link from "next/link";
import type { ReactNode } from "react";

import { OwnerSignOutButton } from "@/components/owner-dashboard/OwnerSignOutButton";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";

const NAV_ITEMS = [
  { href: "/familia", label: "Gimnastas", key: "athletes" },
  { href: "/familia/cuotas", label: "Cuotas", key: "fees" },
] as const;

/** Read-only family portal frame: brand, two sections and sign out. */
export function FamilyPortalShell({
  active,
  children,
}: {
  active: (typeof NAV_ITEMS)[number]["key"] | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-z-canvas text-z-ink">
      <header className="border-b border-z-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-10">
          <p className="font-display text-lg font-black uppercase leading-none">
            Zaltyko <span className="text-z-soft">· Familias</span>
          </p>
          <nav aria-label="Portal de familias" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={
                  active === item.key
                    ? "touch-target inline-flex items-center rounded-lg bg-z-brand-50 px-3 text-sm font-semibold text-z-brand-700"
                    : "touch-target inline-flex items-center rounded-lg px-3 text-sm font-semibold text-z-soft hover:text-z-ink"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <OwnerSignOutButton />
        </div>
      </header>
      <main id="family-portal-content" className={ownerUi.page}>
        {children}
      </main>
    </div>
  );
}
