"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { SUPER_ADMIN_NAV_ITEMS } from "./nav-items";

export function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="relative hidden w-64 flex-shrink-0 overflow-hidden border-r border-white/10 bg-[#0b1320] px-5 py-6 text-slate-100 lg:flex">
      <div className="flex h-full w-full flex-col gap-8 overflow-y-auto">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Saltiko</p>
          <p className="mt-2 text-lg font-semibold text-white">Super Admin</p>
        </div>
        <nav className="flex-1 space-y-1 text-sm">
          {SUPER_ADMIN_NAV_ITEMS.map((item) => {
            // Lógica simplificada: solo marcar como activa la página exacta
            let active = false;
            if (item.href === "/super-admin/dashboard") {
              // Dashboard activo solo si estamos en /super-admin/dashboard o /super-admin
              active = pathname === "/super-admin/dashboard" || pathname === "/super-admin" || pathname === "/super-admin/";
            } else {
              // Otras páginas: activas solo si el pathname coincide exactamente o empieza con el href seguido de /
              active = pathname === item.href || (pathname?.startsWith(`${item.href}/`) && pathname !== item.href);
            }
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-200 min-h-[44px]",
                  active
                    ? "bg-white/10 text-white shadow-md"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
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

