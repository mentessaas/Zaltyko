"use client";

import Link from "next/link";
import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";
import { usePathname } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { isSuperAdminNavigationActive } from "@/lib/navigation/active";
import { cn } from "@/lib/utils";
import { SUPER_ADMIN_NAV_ITEMS } from "./nav-items";

export function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="relative hidden w-64 flex-shrink-0 overflow-hidden border-r border-white/10 bg-zaltyko-navy px-5 py-6 text-white lg:flex">
      <div className="flex h-full w-full flex-col gap-8 overflow-y-auto">
        <div>
          <ZaltykoLockup className="text-white" markClassName="h-8 w-8" />
          <p className="floor-label mt-4 border-b-[3px] border-white pb-3 text-mat-lane">Super Admin</p>
        </div>
        <nav className="flex-1 space-y-1 font-sans text-sm">
          {SUPER_ADMIN_NAV_ITEMS.map((item) => {
            const active = isSuperAdminNavigationActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-[44px] items-center gap-3 rounded-md px-3 py-3 transition-colors duration-150",
                  active
                    ? "bg-white font-semibold text-mat-deep"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/15 pt-4 font-sans text-xs text-white/70">
          <p className="floor-label flex items-center gap-2 text-mat-lane">
            <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Panel global
          </p>
          <p className="mt-2 font-sans leading-relaxed text-white/60">
            Controla academias, usuarios y crecimiento desde un único lugar. Todos los cambios
            quedan registrados.
          </p>
        </div>
      </div>
    </aside>
  );
}
