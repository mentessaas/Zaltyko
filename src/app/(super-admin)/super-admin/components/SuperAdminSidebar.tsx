"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { SUPER_ADMIN_NAV_ITEMS } from "./nav-items";

export function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="relative hidden w-64 flex-shrink-0 overflow-hidden border-r border-white/10 bg-zaltyko-primary-dark px-5 py-6 text-white lg:flex">
      <div className="flex h-full w-full flex-col gap-8 overflow-y-auto">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-zaltyko-accent-light">Zaltyko</p>
          <p className="mt-2 font-display text-lg font-semibold text-white">Super Admin</p>
        </div>
        <nav className="flex-1 space-y-1 font-sans text-sm">
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
                    ? "bg-zaltyko-accent/15 text-zaltyko-accent-light shadow-md"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
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

