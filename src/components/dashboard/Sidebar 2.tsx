"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  UserCog,
  Settings,
  Sparkles,
  ChevronLeft,
  Search,
  Bell,
  LogOut,
  ShoppingBag,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/academies", icon: LayoutDashboard },
  { label: "Atletas", href: "/dashboard/athletes", icon: Users },
  { label: "Entrenadores", href: "/dashboard/coaches", icon: UserCog },
  { label: "Eventos", href: "/dashboard/events", icon: Calendar },
  { label: "Calendario", href: "/dashboard/calendar", icon: Calendar },
  { label: "Marketplace", href: "/dashboard/marketplace/mis-productos", icon: ShoppingBag },
  { label: "Bolsa de Empleo", href: "/dashboard/empleo/mis-postulaciones", icon: Briefcase },
  { label: "Usuarios", href: "/dashboard/users", icon: Users },
  { label: "Perfil", href: "/dashboard/profile", icon: Settings },
];

interface SidebarProps {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const pathname = usePathname();

  // Calculate effective collapsed state
  const effectiveCollapsed = isCollapsed && !isHovered;

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === href || pathname === "/dashboard/";
    }
    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 h-screen border-r border-zaltyko-border bg-white transition-all duration-300 ease-in-out",
        effectiveCollapsed ? "w-[72px]" : "w-64"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25">
              <Sparkles className="h-5 w-5" />
            </div>
            {!effectiveCollapsed && (
              <div className="flex flex-col">
                <span className="text-lg font-bold text-zaltyko-text-main">Zaltyko</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-red-600">
                  Pro
                </span>
              </div>
            )}
          </Link>

          {/* Collapse button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg border border-zaltyko-border bg-white text-zaltyko-text-secondary transition-all hover:bg-zaltyko-bg hover:text-zaltyko-text-main",
              effectiveCollapsed && "opacity-0 pointer-events-none"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        {!effectiveCollapsed && (
          <div className="px-3 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zaltyko-text-secondary" />
              <input
                type="text"
                placeholder="Buscar... (Cmd+K)"
                className="w-full rounded-xl border border-zaltyko-border bg-zaltyko-bg-light px-4 py-2 pl-10 text-sm text-zaltyko-text-main placeholder:text-zaltyko-text-secondary focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const hasChildren = item.children && item.children.length > 0;

              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "bg-gradient-to-r from-red-50 to-red-100/50 text-red-700 border-l-3 border-l-red-500"
                        : "text-zaltyko-text-secondary hover:bg-zaltyko-bg hover:text-zaltyko-text-main",
                      effectiveCollapsed && "justify-center px-2"
                    )}
                    title={effectiveCollapsed ? item.label : undefined}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 flex-shrink-0 transition-colors",
                        active ? "text-red-600" : "text-zaltyko-text-secondary group-hover:text-zaltyko-text-main"
                      )}
                      strokeWidth={1.8}
                    />
                    {!effectiveCollapsed && (
                      <>
                        <span>{item.label}</span>
                        {hasChildren && (
                          <ChevronLeft
                            className={cn(
                              "ml-auto h-4 w-4 transition-transform",
                              active && "rotate-[-90deg]"
                            )}
                          />
                        )}
                      </>
                    )}
                  </Link>
                  {hasChildren && active && !effectiveCollapsed && (
                    <div className="ml-5 mt-1 space-y-1 border-l border-red-200/50 pl-3">
                      {item.children?.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isActive(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                              childActive
                                ? "bg-red-100 text-red-700"
                                : "text-zaltyko-text-secondary hover:bg-zaltyko-bg hover:text-zaltyko-text-main"
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* User Section */}
        <div className="border-t border-border p-3">
          {!effectiveCollapsed ? (
            <div className="flex flex-col gap-3">
              {/* Notifications */}
              <button className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-zaltyko-text-secondary hover:bg-zaltyko-bg hover:text-zaltyko-text-main transition-colors">
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4" />
                  <span>Notificaciones</span>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] font-medium text-red-600">
                  3
                </span>
              </button>

              {/* User menu */}
              <div className="flex items-center gap-3 rounded-xl border border-zaltyko-border bg-zaltyko-bg-light p-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white text-sm font-medium">
                  {user?.name?.[0] || "U"}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium text-zaltyko-text-main">
                    {user?.name || "Usuario"}
                  </p>
                  <p className="truncate text-xs text-zaltyko-text-secondary">
                    {user?.email || "usuario@email.com"}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zaltyko-text-secondary hover:bg-white hover:text-rose-600 transition-colors"
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zaltyko-text-secondary hover:bg-zaltyko-bg hover:text-zaltyko-text-main">
                <Bell className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-medium text-white">
                  3
                </span>
              </button>
              <button
                onClick={handleLogout}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zaltyko-text-secondary hover:bg-rose-50 hover:text-rose-600"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
