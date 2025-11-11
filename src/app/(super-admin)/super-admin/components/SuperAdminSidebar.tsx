"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { SUPER_ADMIN_NAV_ITEMS } from "./nav-items";

export function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="relative hidden w-64 flex-shrink-0 border-r border-white/10 bg-[#0b1320] px-5 py-6 text-slate-100 lg:flex">
      <div className="flex h-full w-full flex-col gap-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Saltiko</p>
          <p className="mt-2 text-lg font-semibold text-white">Super Admin</p>
        </div>
        <nav className="flex-1 space-y-1 text-sm">
          {SUPER_ADMIN_NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition",
                  active
                    ? "bg-white/10 text-white shadow-md"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-300">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
            <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Panel global
          </p>
          <p className="mt-2 leading-relaxed">
            Controla academias, usuarios y facturación desde un único lugar. Todos los cambios quedan
            registrados.
          </p>
        </div>
      </div>
    </aside>
  );
}

