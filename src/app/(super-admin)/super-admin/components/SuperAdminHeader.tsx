"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SUPER_ADMIN_NAV_ITEMS } from "./nav-items";

interface SuperAdminHeaderProps {
  userName: string | null;
  userEmail: string | null;
}

export function SuperAdminHeader({ userName, userEmail }: SuperAdminHeaderProps) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await supabase.auth.signOut();
      router.push("/auth/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="border-b border-white/10 bg-zaltyko-primary-dark px-6 py-4 text-white">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-zaltyko-accent/10 px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-wide text-zaltyko-accent">
            SUPER ADMIN
          </div>
          <p className="font-display text-xl font-semibold text-white">Panel de control global</p>
          <p className="font-sans text-xs text-white/70">
            Sesión iniciada como {userName ?? userEmail ?? "Super Admin"}
          </p>
        </div>
        <div className="flex items-center gap-3 font-sans text-sm text-white/90">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-white transition hover:border-white/30 hover:bg-white/10 md:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menú de navegación"
          >
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <div className="hidden text-right font-sans text-sm md:block">
            <p className="font-medium">{userName ?? "Super Admin"}</p>
            <p className="text-xs text-white/60">{userEmail ?? "Sin correo"}</p>
          </div>
          <Button
            variant="outline"
            className="hidden border-white/20 bg-white/5 text-white hover:border-white/40 hover:bg-white/10 md:inline-flex"
            onClick={handleSignOut}
            disabled={loading}
          >
            <LogOut className="mr-2 h-4 w-4" strokeWidth={1.8} />
            Cerrar sesión
          </Button>
        </div>
      </div>

      <nav className="mt-4 hidden flex-wrap gap-2 font-sans text-sm font-medium md:flex lg:hidden">
        {SUPER_ADMIN_NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full border border-white/10 px-4 py-2 transition hover:border-white/30 hover:bg-white/10",
                active ? "bg-zaltyko-accent/15 text-zaltyko-accent-light" : "text-white/70",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-zaltyko-primary-dark/95 backdrop-blur-sm lg:hidden">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="space-y-1">
              <p className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">Super Admin</p>
              <p className="font-display text-lg font-semibold text-white">Menú de navegación</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right font-sans text-xs text-white/70">
                <p className="font-semibold text-white">{userName ?? "Super Admin"}</p>
                <p>{userEmail ?? "Sin correo"}</p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="border-white/20 bg-white/5 text-white hover:border-white/40 hover:bg-white/10"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </Button>
            </div>
          </div>
          <div className="mt-4 space-y-2 px-6">
            {SUPER_ADMIN_NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 font-sans text-base font-medium text-white/90 transition",
                    active ? "bg-zaltyko-accent/15 text-zaltyko-accent-light" : "bg-white/5 hover:border-white/20 hover:bg-white/10",
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="px-6 pt-6">
            <Button
              variant="outline"
              className="w-full border-white/20 bg-white/5 text-white hover:border-white/40 hover:bg-white/10"
              onClick={handleSignOut}
              disabled={loading}
            >
              <LogOut className="mr-2 h-4 w-4" strokeWidth={1.8} />
              Cerrar sesión
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

