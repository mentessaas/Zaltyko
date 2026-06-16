"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  Menu,
  X,
  User,
  Home,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/roles";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import {
  isAcademyNavigationActive,
  isGlobalNavigationActive,
  isSuperAdminNavigationActive,
} from "@/lib/navigation/active";
import {
  getAcademyNavigation,
  getGlobalNavigation,
  getSuperAdminNavigation,
} from "@/lib/navigation/registry";
import {
  getPreferredHomePath,
  isProfileRole,
} from "@/lib/product/roles";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";

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

function formatAcademyType(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function isPrimaryNavActive(
  pathname: string | null,
  href: string,
  isSuperAdmin: boolean
): boolean {
  return isSuperAdmin
    ? isSuperAdminNavigationActive(pathname, href)
    : isGlobalNavigationActive(pathname, href);
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
  const normalizedRole = isProfileRole(userRole) ? userRole : "owner";
  const homePath = getPreferredHomePath({
    profileRole: isSuperAdmin ? "super_admin" : normalizedRole,
    academyId: currentAcademyId,
  });
  const academyNavItems = currentAcademyId
    ? getAcademyNavigation({
        academyId: currentAcademyId,
        profileRole: normalizedRole,
        specialization: resolveAcademySpecialization({
          academyType,
        }),
      })
    : [];
  const navItems = isSuperAdmin ? getSuperAdminNavigation() : getGlobalNavigation(normalizedRole);

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
    router.push(homePath);
    setProfileMenuOpen(false);
  };

  // Ocultar en auth y landing
  if (pathname && (pathname.startsWith("/auth") || pathname === "/")) return null;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/80",
        isDarkTheme ? "border-white/10 bg-zaltyko-navy/95 text-white" : "border-zaltyko-mist/70 bg-white/95",
      )}
    >
      {/* Layout base: logo | navegación | acciones */}
      <div className="mx-auto grid max-w-[1920px] grid-cols-[auto,1fr,auto] items-center gap-2 overflow-visible px-4 py-2.5 sm:gap-3 md:gap-4 md:px-6 lg:gap-6 lg:px-8">
        {/* Logo */}
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Link href={homePath} className="flex shrink-0 items-center gap-2">
            {isDarkTheme ? (
              <Image src="/branding/zaltyko/logo-zaltyko-dark.svg" alt="Zaltyko" width={32} height={32} className="h-8 w-auto shrink-0" />
            ) : (
              <Image src="/branding/zaltyko/logo-zaltyko.svg" alt="Zaltyko" width={32} height={32} className="h-8 w-auto shrink-0" />
            )}
          </Link>
          {currentAcademyId && academyName ? (
            <div className="hidden min-w-0 border-l border-zaltyko-mist pl-3 lg:block">
              <p className="truncate text-sm font-semibold text-zaltyko-navy">{academyName}</p>
              {academyType ? (
                <p className="truncate text-[10px] capitalize text-slate-400">{formatAcademyType(academyType)}</p>
              ) : null}
            </div>
          ) : null}
          {isSuperAdmin && (
            <span className="hidden shrink-0 rounded-full bg-zaltyko-teal/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zaltyko-teal lg:inline-flex">
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
        {!currentAcademyId && (
        <nav
          className={cn(
            "hidden min-w-0 w-full items-center md:flex",
            // En sm mostramos en el drawer; en md/ lg mostramos centrado con scroll horizontal
          )}
          role="navigation"
          aria-label="Navegación principal"
        >
          <div className="flex w-full items-center justify-center">
            <div
              className={cn(
                "flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl px-2 py-1 lg:gap-1.5 lg:px-3",
                isDarkTheme
                  ? "border border-white/10 bg-white/5 shadow-none"
                  : "border border-zaltyko-mist/60 bg-white/80 shadow-soft"
              )}
            >
              {navItems.map((item) => {
                const active = isPrimaryNavActive(pathname, item.href, isSuperAdmin);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-transparent px-3 py-2 font-sans text-xs font-medium transition-colors",
                      isDarkTheme
                        ? active
                          ? "border-zaltyko-teal/20 bg-zaltyko-teal/12 text-zaltyko-teal shadow-soft"
                          : "text-white/70 hover:border-white/10 hover:bg-white/5 hover:text-white"
                        : active
                          ? "border-zaltyko-teal/20 bg-zaltyko-teal/10 text-zaltyko-teal shadow-soft font-semibold"
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
        )}

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
                isDarkTheme ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-zaltyko-mist bg-white hover:bg-zaltyko-white",
              )}
            >
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                isDarkTheme ? "bg-zaltyko-teal/20 text-zaltyko-teal" : "bg-zaltyko-teal/10 text-zaltyko-teal"
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
                  "absolute right-0 z-[100] mt-2 max-h-[calc(100vh-120px)] w-64 overflow-y-auto rounded-xl border p-3 shadow-medium",
                  isDarkTheme ? "border-white/10 bg-zaltyko-navy/95 backdrop-blur" : "border-zaltyko-mist bg-white",
                )}
              >
                <div className={cn("space-y-2 border-b pb-3", isDarkTheme ? "border-white/10" : "border-border")}>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      isDarkTheme ? "bg-zaltyko-teal/20 text-zaltyko-teal" : "bg-zaltyko-teal/10 text-zaltyko-teal"
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
                              router.push("/dashboard/academies");
                            } else if (canCreateAcademies) {
                              router.push("/onboarding/owner");
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
                            const isActive = currentAcademyId
                              ? isAcademyNavigationActive(pathname, item.href, currentAcademyId)
                              : pathname?.startsWith(item.href) ?? false;
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setProfileMenuOpen(false)}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-sans text-xs font-medium transition",
                                  isActive
                                    ? isDarkTheme
                                      ? "bg-zaltyko-teal/15 text-zaltyko-teal font-semibold"
                                      : "bg-zaltyko-teal/10 text-zaltyko-teal font-semibold"
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
                        "text-zaltyko-coral hover:bg-zaltyko-coral/10",
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
        <div className={cn("fixed inset-0 z-[1000] h-screen w-screen overflow-y-auto md:hidden", isDarkTheme ? "bg-zaltyko-navy text-white" : "bg-background")}>
          <div className={cn("flex items-center justify-between border-b px-4 py-4", isDarkTheme ? "border-white/10" : "border-border")}>
            <div className="flex items-center gap-2">
              {isDarkTheme ? (
                <Image src="/branding/zaltyko/logo-zaltyko-dark.svg" alt="Zaltyko" width={32} height={32} className="h-8 w-auto" />
              ) : (
                <Image src="/branding/zaltyko/logo-zaltyko.svg" alt="Zaltyko" width={32} height={32} className="h-8 w-auto" />
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
            {(currentAcademyId ? academyNavItems : navItems).map((item) => {
              const active = isPrimaryNavActive(pathname, item.href, isSuperAdmin);
              const academyActive = currentAcademyId
                ? isAcademyNavigationActive(pathname, item.href, currentAcademyId)
                : active;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={academyActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-4 font-sans text-base font-medium transition-all duration-200 active:scale-[0.98] min-h-[52px]",
                    isDarkTheme
                      ? academyActive
                        ? "bg-zaltyko-teal/15 text-zaltyko-teal shadow-sm"
                        : "bg-white/10 text-white hover:bg-white/15"
                      : academyActive
                        ? "bg-zaltyko-teal/10 text-zaltyko-teal shadow-sm"
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
                  isDarkTheme ? "bg-zaltyko-teal/20 text-zaltyko-teal" : "bg-zaltyko-teal/10 text-zaltyko-teal"
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
                      "text-zaltyko-coral hover:bg-zaltyko-coral/10"
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
