"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  Users,
  Building2,
  CreditCard,
  BarChart3,
  Shield,
  LogOut,
  Menu,
  X,
  User,
  Home,
  BookOpen,
  GraduationCap,
  FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/roles";
import { SUPER_ADMIN_NAV_ITEMS } from "@/app/(super-admin)/super-admin/components/nav-items";

interface GlobalTopNavProps {
  userRole?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  profileId?: string | null;
}

const COMMON_NAV_ITEMS = [
  { href: "/dashboard/profile", label: "Mi perfil", icon: User },
  { href: "/dashboard/calendar", label: "Calendario", icon: Calendar },
];

const OWNER_NAV_ITEMS = [
  { href: "/dashboard/profile", label: "Mi perfil", icon: User },
  { href: "/dashboard/calendar", label: "Calendario", icon: Calendar },
  { href: "/dashboard/users", label: "Equipo", icon: Users },
  { href: "/billing", label: "Facturación", icon: CreditCard },
];

const COACH_NAV_ITEMS = [
  { href: "/dashboard/profile", label: "Mi perfil", icon: User },
  { href: "/dashboard/calendar", label: "Calendario", icon: Calendar },
  { href: "/dashboard/coaches", label: "Mis clases", icon: BookOpen },
];

const ATHLETE_NAV_ITEMS = [
  { href: "/dashboard/profile", label: "Mi perfil", icon: User },
  { href: "/dashboard/calendar", label: "Calendario", icon: Calendar },
];

const PARENT_NAV_ITEMS = [
  { href: "/dashboard/profile", label: "Mi perfil", icon: User },
  { href: "/dashboard/calendar", label: "Calendario", icon: Calendar },
  { href: "/dashboard/athletes", label: "Mis hijos", icon: Users },
];

export function GlobalTopNav({ userRole, userName, userEmail, profileId }: GlobalTopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Determinar qué items de navegación mostrar según el rol
  const getNavItems = () => {
    if (userRole === "super_admin") {
      return SUPER_ADMIN_NAV_ITEMS;
    }
    if (userRole === "owner" || userRole === "admin") {
      return OWNER_NAV_ITEMS;
    }
    if (userRole === "coach") {
      return COACH_NAV_ITEMS;
    }
    if (userRole === "athlete") {
      return ATHLETE_NAV_ITEMS;
    }
    if (userRole === "parent") {
      return PARENT_NAV_ITEMS;
    }
    return COMMON_NAV_ITEMS;
  };

  const navItems = getNavItems();
  const isSuperAdmin = userRole === "super_admin";
  const isInAppArea = pathname?.startsWith("/app/");
  const isInSuperAdminArea = pathname?.startsWith("/super-admin");
  const isInDashboardArea = pathname?.startsWith("/dashboard");
  
  // Determinar el tema según el área
  const isDarkTheme = isInSuperAdminArea;

  const handleSignOut = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await supabase.auth.signOut();
      router.push("/auth/login");
    } finally {
      setLoading(false);
      setProfileMenuOpen(false);
    }
  };

  const handleGoToProfile = () => {
    router.push("/dashboard/profile");
    setProfileMenuOpen(false);
  };

  const handleGoToHome = () => {
    if (isSuperAdmin) {
      router.push("/super-admin");
    } else {
      router.push("/dashboard");
    }
    setProfileMenuOpen(false);
  };

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
  }, [pathname]);

  // No mostrar en páginas de auth o landing
  if (pathname?.startsWith("/auth") || pathname === "/" || pathname?.startsWith("/coaches")) {
    return null;
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur supports-[backdrop-filter]:bg-background/60",
        isDarkTheme
          ? "border-white/10 bg-[#0f172a]/95 text-slate-100"
          : "border-border/80 bg-background/95",
      )}
    >
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:gap-4 lg:px-8">
        {/* Logo y título */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href={isSuperAdmin ? "/super-admin" : "/dashboard"}
            className="flex items-center gap-2"
          >
            {isDarkTheme ? (
              <img 
                src="/branding/zaltyko/logo-zaltyko-dark.svg" 
                alt="Zaltyko" 
                className="h-8 w-auto"
              />
            ) : (
              <img 
                src="/branding/zaltyko/logo-zaltyko.svg" 
                alt="Zaltyko" 
                className="h-8 w-auto"
              />
            )}
          </Link>
          {isSuperAdmin && (
            <span className="hidden rounded-full bg-zaltyko-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zaltyko-accent sm:inline-flex">
              Super Admin
            </span>
          )}
        </div>

        {/* Navegación desktop - visible desde sm para mostrar todos los botones */}
        <nav className="hidden items-center gap-0.5 sm:flex sm:gap-1">
          {navItems.map((item) => {
            // Lógica simplificada: solo marcar como activa la página exacta
            let active = false;
            if (isSuperAdmin) {
              // Para Super Admin
              if (item.href === "/super-admin/dashboard") {
                // Dashboard activo solo si estamos en /super-admin/dashboard o /super-admin
                active = pathname === "/super-admin/dashboard" || pathname === "/super-admin" || pathname === "/super-admin/";
              } else {
                // Otras páginas: activas solo si el pathname coincide exactamente o empieza con el href seguido de /
                active = pathname === item.href || (pathname?.startsWith(`${item.href}/`) && pathname !== item.href);
              }
            } else {
              // Para otros roles: activa solo si coincide exactamente o es una subruta
              if (item.href === "/dashboard/profile") {
                active = pathname === "/dashboard/profile" || pathname?.startsWith("/dashboard/profile/");
              } else {
                active = pathname === item.href;
              }
            }
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all duration-200 min-h-[40px] sm:gap-2 sm:px-2.5 sm:text-sm",
                  isDarkTheme
                    ? active
                      ? "bg-zaltyko-accent/15 text-zaltyko-accent shadow-sm"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                    : active
                      ? "bg-zaltyko-primary/10 text-zaltyko-primary shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Acciones del usuario */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Botón de menú móvil - solo visible en móvil real */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={cn(
              "inline-flex items-center justify-center rounded-lg p-2.5 transition-all duration-200 active:scale-95 sm:hidden min-h-[44px] min-w-[44px]",
              isDarkTheme
                ? "text-slate-300 hover:bg-white/5 hover:text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Perfil del usuario */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all duration-200 active:scale-[0.98] min-h-[44px] sm:min-h-[40px]",
                isDarkTheme
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                  isDarkTheme
                    ? "bg-zaltyko-accent/10 text-zaltyko-accent"
                    : "bg-zaltyko-primary/10 text-zaltyko-primary",
                )}
              >
                {userName?.slice(0, 1)?.toUpperCase() ?? userEmail?.slice(0, 1)?.toUpperCase() ?? "U"}
              </div>
              <div className="hidden text-left text-xs sm:block">
                <div className={cn("font-medium", isDarkTheme ? "text-white" : "text-foreground")}>
                  {userName ?? "Usuario"}
                </div>
                <div
                  className={cn(
                    "text-[10px]",
                    isDarkTheme ? "text-slate-400" : "text-muted-foreground",
                  )}
                >
                  {userRole ? getRoleLabel(userRole) : "Usuario"}
                </div>
              </div>
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-popover p-2 shadow-lg">
                <div className="space-y-1 border-b border-border pb-2">
                  <p className="px-2 text-xs font-semibold text-foreground">{userName ?? "Usuario"}</p>
                  <p className="px-2 text-xs text-muted-foreground">{userEmail ?? "Sin correo"}</p>
                  <p className="px-2 text-xs text-muted-foreground">
                    Rol: {userRole ? getRoleLabel(userRole) : "Usuario"}
                  </p>
                </div>
                <div className="space-y-1 pt-2">
                  <button
                    type="button"
                    onClick={handleGoToHome}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Home className="h-4 w-4" />
                    {isSuperAdmin ? "Dashboard Super Admin" : "Inicio"}
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToProfile}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <User className="h-4 w-4" />
                    Mi perfil
                  </button>
                  {isSuperAdmin && !isInSuperAdminArea && (
                    <Link
                      href="/super-admin"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Shield className="h-4 w-4" />
                      Panel Super Admin
                    </Link>
                  )}
                  {!isSuperAdmin && isInSuperAdminArea && (
                    <Link
                      href="/dashboard"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Home className="h-4 w-4" />
                      Volver a Dashboard
                    </Link>
                  )}
                  <div className="border-t border-border pt-2">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={loading}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
                    >
                      <LogOut className="h-4 w-4" />
                      {loading ? "Cerrando..." : "Cerrar sesión"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Menú móvil - solo en pantallas pequeñas */}
      {mobileMenuOpen && (
        <div
          className={cn(
            "fixed inset-0 z-50 backdrop-blur sm:hidden",
            isDarkTheme ? "bg-slate-950/95" : "bg-background/95",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between border-b px-4 py-4",
              isDarkTheme ? "border-white/10" : "border-border",
            )}
          >
            <div className="flex items-center gap-2">
              {isDarkTheme ? (
                <img 
                  src="/branding/zaltyko/logo-zaltyko-dark.svg" 
                  alt="Zaltyko" 
                  className="h-8 w-auto"
                />
              ) : (
                <img 
                  src="/branding/zaltyko/logo-zaltyko.svg" 
                  alt="Zaltyko" 
                  className="h-8 w-auto"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "rounded-lg p-2 transition",
                isDarkTheme
                  ? "text-slate-300 hover:bg-white/5 hover:text-white"
                  : "text-muted-foreground hover:bg-muted",
              )}
              aria-label="Cerrar menú"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="space-y-2 px-4 py-6">
            {navItems.map((item) => {
            // Lógica simplificada: solo marcar como activa la página exacta
            let active = false;
            if (isSuperAdmin) {
              // Para Super Admin: comparar exactamente con el pathname
              if (item.href === "/super-admin/dashboard") {
                // Dashboard activo solo si estamos en /super-admin/dashboard o /super-admin
                active = pathname === "/super-admin/dashboard" || pathname === "/super-admin" || pathname === "/super-admin/";
              } else {
                // Otras páginas: activas solo si el pathname coincide exactamente o empieza con el href seguido de /
                active = pathname === item.href || (pathname?.startsWith(`${item.href}/`) && pathname !== item.href);
              }
            } else {
              // Para otros roles: activa solo si coincide exactamente o es una subruta
              if (item.href === "/dashboard/profile") {
                active = pathname === "/dashboard/profile" || pathname?.startsWith("/dashboard/profile/");
              } else {
                active = pathname === item.href;
              }
            }
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-4 text-base font-medium transition-all duration-200 active:scale-[0.98] min-h-[52px]",
                    isDarkTheme
                      ? active
                        ? "bg-zaltyko-accent/15 text-zaltyko-accent shadow-sm"
                        : "bg-white/5 text-slate-200 hover:bg-white/10"
                      : active
                        ? "bg-zaltyko-primary/10 text-zaltyko-primary shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 border-t bg-background p-4",
              isDarkTheme ? "border-white/10 bg-slate-950" : "border-border",
            )}
          >
            <div className="mb-3 space-y-1">
              <p className={cn("text-sm font-semibold", isDarkTheme ? "text-white" : "text-foreground")}>
                {userName ?? "Usuario"}
              </p>
              <p className={cn("text-xs", isDarkTheme ? "text-slate-400" : "text-muted-foreground")}>
                {userEmail ?? "Sin correo"}
              </p>
            </div>
            <Button
              variant="outline"
              size="lg"
              className={cn(
                "w-full min-h-[52px]",
                isDarkTheme
                  ? "border-white/20 bg-white/5 text-slate-100 hover:bg-white/10"
                  : "",
              )}
              onClick={handleSignOut}
              disabled={loading}
            >
              <LogOut className="mr-2 h-5 w-5" />
              <span className="text-base">{loading ? "Cerrando sesión..." : "Cerrar sesión"}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Overlay para cerrar menú de perfil */}
      {profileMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setProfileMenuOpen(false)}
        />
      )}
    </header>
  );
}

