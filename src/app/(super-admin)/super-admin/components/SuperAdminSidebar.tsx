"use client";

import Link from "next/link";
import Image from "next/image";
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
          <Image
            src="/branding/zaltyko/logo-zaltyko-dark.svg"
            alt="Zaltyko"
            width={132}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <p className="mt-3 font-display text-lg font-semibold text-white">Super Admin</p>
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
                  "group flex min-h-[44px] items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition-all duration-200",
                  active
                    ? "border-zaltyko-teal/20 bg-zaltyko-teal/12 text-zaltyko-teal shadow-soft"
                    : "text-white/70 hover:border-white/10 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 font-sans text-xs text-white/70">
          <p className="flex items-center gap-2 font-display text-[11px] uppercase tracking-wide text-zaltyko-accent-light">
            <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Panel global
          </p>
          <p className="mt-2 font-sans leading-relaxed text-white/60">
            Controla academias, usuarios y facturación desde un único lugar. Todos los cambios quedan
            registrados.
          </p>
        </div>
      </div>
    </aside>
  );
}
