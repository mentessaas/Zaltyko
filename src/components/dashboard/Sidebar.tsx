"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Calendar, LogOut, User, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { getGlobalNavigation } from "@/lib/navigation/registry";
import { isProfileRole, type ProfileRole } from "@/lib/product/roles";
import { getRoleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

interface SidebarProps {
  user?: {
    name: string;
    email: string;
    avatar?: string;
    role?: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const role: ProfileRole = isProfileRole(user?.role) ? user.role : "owner";
  const navItems = getGlobalNavigation(role);
  const quickLinks =
    role === "owner" || role === "admin"
      ? [
          { label: "Academias", href: "/dashboard/academies", icon: Building2 },
          { label: "Equipo", href: "/dashboard/users", icon: Users },
          { label: "Calendario", href: "/dashboard/calendar", icon: Calendar },
        ]
      : [
          { label: "Mi perfil", href: "/dashboard/profile", icon: User },
          { label: "Calendario", href: "/dashboard/calendar", icon: Calendar },
        ];

  const isActive = (href: string) => {
    if (href === "/dashboard" || href === "/dashboard/academies") {
      return pathname === href || pathname === "/dashboard/";
    }

    if (href === "/dashboard/profile") {
      return pathname === href || pathname?.startsWith("/dashboard/profile/");
    }

    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  return (
    <aside className="hidden lg:flex lg:w-72 lg:shrink-0">
      <div className="sticky top-[73px] flex h-[calc(100vh-73px)] w-full flex-col border-r border-border/80 bg-card/40 p-4">
        <div className="rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Espacio global
          </p>
          <div className="mt-3 space-y-1">
            <p className="text-sm font-semibold text-foreground">{user?.name ?? "Usuario"}</p>
            <p className="text-xs text-muted-foreground">
              {user?.role ? getRoleLabel(user.role) : "Usuario"}
            </p>
            {user?.email ? (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            ) : null}
          </div>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto">
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cuenta
              </p>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Atajos
              </p>
              {quickLinks.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
