"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  Users,
  CreditCard,
  BarChart3,
  Shield,
  LogOut,
  Menu,
  X,
  User,
  Home,
  BookOpen,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/roles";
import { SUPER_ADMIN_NAV_ITEMS } from "@/app/(super-admin)/super-admin/components/nav-items";
import { getAcademyNavItems } from "@/lib/academy-nav-items";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { GlobalSearch } from "@/components/search/GlobalSearch";

interface GlobalTopNavProps {
  userRole?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  profileId?: string | null;
  currentAcademyId?: string | null;
  academyName?: string | null;
  academyType?: string | null;
  tenantAcademies?: { id: string; name: string | null }[];
  canCreateAcademies?: boolean;
}

const OWNER_NAV_ITEMS = [
  { href: "/dashboard/academies", label: "Academias", icon: Building2 },
  { href: "/dashboard/profile", label: "Mi perfil", icon: User },
  { href: "/dashboard/calendar", label: "Calendario", icon: Calendar },
  { href: "/dashboard/users", label: "Equipo", icon: Users },
  { href: "/billing", label: "Facturación", icon: CreditCard },
];

const COACH_NAV_ITEMS = [
  { href: "/dashboard/profile", label: "Mi perfil", icon: User },
  { href: "/dashboard/coaches", label: "Mis clases", icon: BookOpen },
  { href: "/dashboard/calendar", label: "Calendario", icon: Calendar },
];

const ATHLETE_NAV_ITEMS = [
  { href: "/dashboard/profile", label: "Mi perfil", icon: User },
  { href: "/dashboard/calendar", label: "Calendario", icon: Calendar },
];

function formatAcademyType(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

export function GlobalTopNav({
  userRole,
  userName,
  userEmail,
  profileId,
  currentAcademyId,
  academyName,
  academyType,
  tenantAcademies = [],
  canCreateAcademies = false,
}: GlobalTopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const isSuperAdmin = userRole === "super_admin";
  const isInSuperAdminArea = pathname?.startsWith("/super-admin") ?? false;
  const isDarkTheme = isInSuperAdminArea;
  
  const academyNavItems = currentAcademyId ? getAcademyNavItems(currentAcademyId) : [];

  const getNavItems = () => {
    if (isSuperAdmin) return SUPER_ADMIN_NAV_ITEMS;
    if (userRole === "owner" || userRole === "admin") return OWNER_NAV_ITEMS;
    if (userRole === "coach") return COACH_NAV_ITEMS;
    return ATHLETE_NAV_ITEMS;
  };

  const navItems = getNavItems();

  useEffect(() => {
    if (pathname) {
      setMobileMenuOpen(false);
      setProfileMenuOpen(false);
    }
  }, [pathname]);

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
    // Usar el profileId si está disponible, sino ir al perfil genérico
    if (profileId) {
      router.push(`/dashboard/profile/${profileId}`);
    } else {
      router.push("/dashboard/profile");
    }
    setProfileMenuOpen(false);
  };

  const handleGoToHome = () => {
    // "Inicio" siempre lleva al dashboard principal (donde se ven todas las academias)
    // No al dashboard de una academia específica
    if (isSuperAdmin) {
      router.push("/super-admin");
    } else {
      router.push("/dashboard");
    }
    setProfileMenuOpen(false);
  };

  // Ocultar en auth y landing
  if (pathname && (pathname.startsWith("/auth") || pathname === "/")) return null;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60",
        isDarkTheme ? "border-white/10 bg-zaltyko-primary-dark/95 text-white" : "border-border/80 bg-background/95 shadow-sm",
      )}
    >
      {/* Layout base: logo | navegación | acciones */}
      <div className="mx-auto grid max-w-[1920px] grid-cols-[auto,1fr,auto] items-center gap-2 overflow-visible px-4 py-2.5 sm:gap-3 md:gap-4 md:px-6 lg:gap-6 lg:px-8">
        {/* Logo */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5">
          <Link href={isSuperAdmin ? "/super-admin" : "/dashboard"} className="flex shrink-0 items-center gap-2">
            {isDarkTheme ? (
              <img src="/branding/zaltyko/logo-zaltyko-dark.svg" alt="Zaltyko" className="h-8 w-auto shrink-0" />
            ) : (
              <img src="/branding/zaltyko/logo-zaltyko.svg" alt="Zaltyko" className="h-8 w-auto shrink-0" />
            )}
          </Link>
          {isSuperAdmin && (
            <span className="hidden shrink-0 rounded-full bg-zaltyko-accent/10 px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-wide text-zaltyko-accent lg:inline-flex">
              Super Admin
            </span>
          )}
        </div>

        {/* Búsqueda global (solo desktop, solo cuando hay academia activa) */}
        {currentAcademyId && (
          <div className="hidden lg:block flex-1 max-w-md mx-4">
            <GlobalSearch academyId={currentAcademyId} />
          </div>
        )}

        {/* Navegación centrada - scroll horizontal en sm/md, no-wrap */}
        <nav
          className={cn(
            "hidden min-w-0 w-full items-center md:flex",
            // En sm mostramos en el drawer; en md/ lg mostramos centrado con scroll horizontal
          )}
          role="navigation"
          aria-label="Navegación principal"
        >
          <div className="flex w-full items-center justify-center">
            <div className="flex max-w-full items-center gap-1 overflow-x-auto px-2 lg:gap-1.5 lg:px-4">
              {navItems.map((item) => {
                let active = false;
                if (isSuperAdmin) {
                  if (item.href === "/super-admin/dashboard") {
                    active = pathname === "/super-admin/dashboard" || pathname === "/super-admin" || pathname === "/super-admin/";
                  } else {
                    active = pathname === item.href || (pathname?.startsWith(`${item.href}/`) && pathname !== item.href);
                  }
                } else {
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
                      "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-sans text-xs font-medium transition-colors",
                      isDarkTheme
                        ? active
                          ? "bg-zaltyko-accent/15 text-zaltyko-accent-light shadow-sm"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                        : active
                          ? "bg-zaltyko-primary/10 text-zaltyko-primary shadow-sm font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Acciones: menú móvil + notificaciones + menú de usuario siempre compacto */}
        <div className="flex items-center justify-end gap-2 sm:gap-2.5">
          {/* Notification Bell - Solo mostrar si hay una academia activa */}
          {currentAcademyId && (
            <div className="hidden md:block">
              <NotificationBell />
            </div>
          )}
          
          {/* Menú global (móvil) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={cn(
              "inline-flex items-center justify-center rounded-lg p-2.5 transition-all duration-200 active:scale-95 md:hidden min-h-[44px] min-w-[44px]",
              isDarkTheme ? "text-white/80 hover:bg-white/5" : "text-muted-foreground hover:bg-muted",
            )}
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-6 w-6" strokeWidth={1.8} />
          </button>

          {/* Perfil con avatar y menú */}
          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              aria-expanded={profileMenuOpen}
              aria-label="Menú de usuario"
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-sans transition-all duration-200 active:scale-[0.98]",
                isDarkTheme ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-border bg-background hover:bg-muted",
              )}
            >
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                isDarkTheme ? "bg-zaltyko-accent/20 text-zaltyko-accent-light" : "bg-primary/10 text-primary"
              )}>
                {userName?.slice(0, 1)?.toUpperCase() ?? (userEmail?.slice(0, 1)?.toUpperCase() ?? "U")}
              </span>
              {userName && (
                <div className="hidden min-w-0 text-left lg:block">
                  <p className={cn("truncate text-xs font-semibold", isDarkTheme ? "text-white" : "text-foreground")}>
                    {userName}
                  </p>
                  <p className={cn("truncate text-[10px]", isDarkTheme ? "text-white/60" : "text-muted-foreground")}>
                    {userRole ? getRoleLabel(userRole) : "Usuario"}
                  </p>
                </div>
              )}
            </button>

            {profileMenuOpen && (
              <div
                className={cn(
                  "absolute right-0 z-[100] mt-2 w-64 max-h-[calc(100vh-120px)] overflow-y-auto rounded-lg border p-3 shadow-lg",
                  isDarkTheme ? "border-white/10 bg-zaltyko-primary-dark/95 backdrop-blur" : "border-border bg-popover",
                )}
              >
                <div className={cn("space-y-2 border-b pb-3", isDarkTheme ? "border-white/10" : "border-border")}>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      isDarkTheme ? "bg-zaltyko-accent/20 text-zaltyko-accent-light" : "bg-primary/10 text-primary"
                    )}>
                      {userName?.slice(0, 1)?.toUpperCase() ?? (userEmail?.slice(0, 1)?.toUpperCase() ?? "U")}
                    </span>
                    <div className="min-w-0 flex-1">
                      {userName ? (
                        <>
                          <p className={cn("truncate font-sans text-sm font-semibold", isDarkTheme ? "text-white" : "text-foreground")}>
                            {userName}
                          </p>
                          {userEmail && (
                            <p className={cn("truncate font-sans text-xs", isDarkTheme ? "text-white/70" : "text-muted-foreground")}>
                              {userEmail}
                            </p>
                          )}
                        </>
                      ) : userEmail ? (
                        <p className={cn("truncate font-sans text-sm font-semibold", isDarkTheme ? "text-white" : "text-foreground")}>
                          {userEmail}
                        </p>
                      ) : (
                        <p className={cn("truncate font-sans text-sm font-semibold", isDarkTheme ? "text-white" : "text-foreground")}>
                          Usuario
                        </p>
                      )}
                      {userRole && (
                        <p className={cn("mt-0.5 font-sans text-xs", isDarkTheme ? "text-white/60" : "text-muted-foreground")}>
                          {getRoleLabel(userRole)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1 pt-3">
                  <button
                    type="button"
                    onClick={handleGoToHome}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-sans text-xs font-medium transition",
                      isDarkTheme ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Home className="h-4 w-4" strokeWidth={1.8} /> {isSuperAdmin ? "Dashboard Super Admin" : "Inicio"}
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToProfile}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-sans text-xs font-medium transition",
                      isDarkTheme ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <User className="h-4 w-4" strokeWidth={1.8} /> Mi perfil
                  </button>
                  
                  {/* Sección de academia */}
                  {currentAcademyId && academyName && (
                    <>
                      <div className={cn("border-t pt-2 mt-2", isDarkTheme ? "border-white/10" : "border-border")}>
                        <div className="px-2 py-1.5">
                          <p className={cn("text-xs font-semibold mb-2", isDarkTheme ? "text-white/90" : "text-foreground")}>
                            Academia actual
                          </p>
                          <div className="space-y-1">
                            <p className={cn("text-sm font-medium", isDarkTheme ? "text-white" : "text-foreground")}>
                              {academyName}
                            </p>
                            {academyType && (
                              <p className={cn("text-xs", isDarkTheme ? "text-white/70" : "text-muted-foreground")}>
                                {formatAcademyType(academyType)}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            if (tenantAcademies.length > 0) {
                              // Si hay múltiples academias, ir al dashboard para cambiar
                              router.push("/dashboard");
                            } else if (canCreateAcademies) {
                              router.push("/onboarding");
                            }
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-sans text-xs font-medium transition",
                            isDarkTheme ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Building2 className="h-4 w-4" strokeWidth={1.8} /> Cambiar de academia
                        </button>
                      </div>
                      
                      {/* Navegación de academia */}
                      <div className={cn("border-t pt-2 mt-2", isDarkTheme ? "border-white/10" : "border-border")}>
                        <p className={cn("text-xs font-semibold mb-1 px-2", isDarkTheme ? "text-white/90" : "text-foreground")}>
                          Navegación de academia
                        </p>
                        <div className="space-y-0.5">
                          {academyNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname?.startsWith(item.href) ?? false;
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setProfileMenuOpen(false)}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-sans text-xs font-medium transition",
                                  isActive
                                    ? isDarkTheme
                                      ? "bg-white/10 text-white font-semibold"
                                      : "bg-primary/10 text-primary font-semibold"
                                    : isDarkTheme
                                    ? "text-white/70 hover:bg-white/10 hover:text-white"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                              >
                                <Icon className="h-4 w-4" strokeWidth={1.8} />
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className={cn("border-t pt-2", isDarkTheme ? "border-white/10" : "border-border")}>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={loading}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-sans text-xs font-semibold transition disabled:opacity-60",
                        isDarkTheme ? "text-red-400 hover:bg-red-500/10" : "text-destructive hover:bg-destructive/10",
                      )}
                    >
                      <LogOut className="h-4 w-4" strokeWidth={1.8} /> {loading ? "Cerrando..." : "Cerrar sesión"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drawer móvil para navegación */}
      {mobileMenuOpen && (
        <div className={cn("fixed inset-0 z-[1000] h-screen w-screen overflow-y-auto md:hidden", isDarkTheme ? "bg-zaltyko-primary-dark text-white" : "bg-background")}> 
          <div className={cn("flex items-center justify-between border-b px-4 py-4", isDarkTheme ? "border-white/10" : "border-border")}> 
            <div className="flex items-center gap-2">
              {isDarkTheme ? (
                <img src="/branding/zaltyko/logo-zaltyko-dark.svg" alt="Zaltyko" className="h-8 w-auto" />
              ) : (
                <img src="/branding/zaltyko/logo-zaltyko.svg" alt="Zaltyko" className="h-8 w-auto" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className={cn("rounded-lg p-2 transition", isDarkTheme ? "text-white/80 hover:bg-white/5" : "text-muted-foreground hover:bg-muted")}
              aria-label="Cerrar menú"
            >
              <X className="h-6 w-6" strokeWidth={1.8} />
            </button>
          </div>
          <nav className="space-y-2 px-4 py-6">
            {navItems.map((item) => {
              let active = false;
              if (isSuperAdmin) {
                if (item.href === "/super-admin/dashboard") {
                  active = pathname === "/super-admin/dashboard" || pathname === "/super-admin" || pathname === "/super-admin/";
                } else {
                  active = pathname === item.href || (pathname?.startsWith(`${item.href}/`) && pathname !== item.href);
                }
              } else {
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
                    "flex items-center gap-3 rounded-xl px-4 py-4 font-sans text-base font-medium transition-all duration-200 active:scale-[0.98] min-h-[52px]",
                    isDarkTheme
                      ? active
                        ? "bg-zaltyko-accent/15 text-zaltyko-accent-light shadow-sm"
                        : "bg-white/10 text-white hover:bg-white/15"
                      : active
                        ? "bg-zaltyko-primary/10 text-zaltyko-primary shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Notification Bell en móvil */}
          {currentAcademyId && (
            <div className="px-4 py-3 border-b" style={{ borderColor: isDarkTheme ? "rgba(255,255,255,0.1)" : undefined }}>
              <NotificationBell />
            </div>
          )}

          {/* Información del usuario y acciones en el drawer */}
          <div
            className={cn(
              "mt-2 border-t px-4 pb-6",
              isDarkTheme ? "border-white/10" : "border-border"
            )}
          >
            <div className="pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  isDarkTheme ? "bg-zaltyko-accent/20 text-zaltyko-accent-light" : "bg-primary/10 text-primary"
                )}>
                  {userName?.slice(0, 1)?.toUpperCase() ?? (userEmail?.slice(0, 1)?.toUpperCase() ?? "U")}
                </span>
                <div className="min-w-0 flex-1">
                  {userName ? (
                    <>
                      <p className={cn("truncate font-sans text-sm font-semibold", isDarkTheme ? "text-white" : "text-foreground")}>
                        {userName}
                      </p>
                      {userEmail && (
                        <p className={cn("truncate font-sans text-xs", isDarkTheme ? "text-white/70" : "text-muted-foreground")}>
                          {userEmail}
                        </p>
                      )}
                    </>
                  ) : userEmail ? (
                    <p className={cn("truncate font-sans text-sm font-semibold", isDarkTheme ? "text-white" : "text-foreground")}>
                      {userEmail}
                    </p>
                  ) : (
                    <p className={cn("truncate font-sans text-sm font-semibold", isDarkTheme ? "text-white" : "text-foreground")}>
                      Usuario
                    </p>
                  )}
                  {userRole && (
                    <p className={cn("mt-0.5 font-sans text-xs", isDarkTheme ? "text-white/60" : "text-muted-foreground")}>
                      {getRoleLabel(userRole)}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-0.5 pt-2">
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); handleGoToHome(); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-4 py-3 font-sans text-sm font-medium transition",
                    isDarkTheme
                      ? "text-white/80 hover:bg-white/10 hover:text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Home className="h-5 w-5" strokeWidth={1.8} />
                  <span>{isSuperAdmin ? "Dashboard Super Admin" : "Inicio"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); handleGoToProfile(); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-4 py-3 font-sans text-sm font-medium transition",
                    isDarkTheme
                      ? "text-white/80 hover:bg-white/10 hover:text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <User className="h-5 w-5" strokeWidth={1.8} />
                  <span>Mi perfil</span>
                </button>

                <div className={cn("border-t pt-1.5 mt-1.5", isDarkTheme ? "border-white/10" : "border-border")}>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleSignOut(); }}
                    disabled={loading}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-4 py-3 font-sans text-sm font-semibold transition disabled:opacity-60",
                      isDarkTheme ? "text-red-400 hover:bg-red-500/10" : "text-destructive hover:bg-destructive/10"
                    )}
                  >
                    <LogOut className="h-5 w-5" strokeWidth={1.8} />
                    <span>{loading ? "Cerrando..." : "Cerrar sesión"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cerrar menú de perfil al hacer click fuera */}
      {profileMenuOpen && <div className="fixed inset-0 z-[90]" onClick={() => setProfileMenuOpen(false)} aria-hidden="true" />}
    </header>
  );
}

