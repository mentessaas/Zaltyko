import Link from "next/link";
import type { ReactNode } from "react";

import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";
import { OwnerSignOutButton } from "@/components/owner-dashboard/OwnerSignOutButton";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";

const NAV_ITEMS = [
  { href: "/familia", label: "Gimnastas", key: "athletes" },
  { href: "/familia/cuotas", label: "Cuotas", key: "fees" },
] as const;

/**
 * Read-only family portal frame: brand, two sections and sign out.
 *
 * «Magnesio sobre tapiz», como la barra pública: banda de tapiz profundo con
 * el lockup de Zaltyko y pestañas en blanco con un tramo de cinta de 3 px bajo
 * la activa. En móvil las pestañas pasan a su propia fila, a lo ancho.
 */
export function FamilyPortalShell({
  active,
  children,
}: {
  active: (typeof NAV_ITEMS)[number]["key"] | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-z-canvas text-z-ink">
      <header className="mat-field-deep border-b border-white/10 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 px-5 lg:px-10">
          <p className="flex min-h-14 items-center gap-2 py-2">
            <ZaltykoLockup markClassName="h-7 w-7" />
            <span className="floor-label text-white/80">· Familias</span>
          </p>
          <nav
            aria-label="Portal de familias"
            className="order-last flex w-full items-stretch gap-1 border-t border-white/10 sm:order-none sm:w-auto sm:border-t-0"
          >
            {NAV_ITEMS.map((item) => {
              const current = active === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`relative inline-flex min-h-12 flex-1 items-center justify-center px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white sm:min-h-14 sm:flex-none ${
                    current ? "text-white" : "text-white/75 hover:text-white"
                  }`}
                >
                  {item.label}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-3 bottom-0 h-[3px] bg-white transition-transform duration-200 ease-out ${
                      current ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>
          <OwnerSignOutButton surface="mat" />
        </div>
      </header>
      <main id="family-portal-content" className={ownerUi.page}>
        {children}
      </main>
    </div>
  );
}
