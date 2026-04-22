"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Calendar, CreditCard, Home, Plus, User, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { getGlobalNavigation } from "@/lib/navigation/registry";
import { getDefaultDashboardPath, isProfileRole, type ProfileRole } from "@/lib/product/roles";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  href: string;
  icon: React.ElementType;
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [role, setRole] = useState<ProfileRole>("owner");

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMobile, lastScrollY]);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      try {
        const response = await fetch("/api/onboarding/profile", { cache: "no-store" });
        if (!response.ok) return;

        const payload = await response.json();
        const profileRole = payload?.data?.role ?? payload?.role;
        if (!cancelled && isProfileRole(profileRole)) {
          setRole(profileRole);
        }
      } catch {
        // No-op: fallback role keeps nav stable enough.
      }
    }

    if (pathname?.startsWith("/dashboard")) {
      void loadRole();
    }

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const bottomNavItems = useMemo(() => {
    const homePath = getDefaultDashboardPath(role);
    return [
      { key: "home", label: "Inicio", href: homePath, icon: Home },
      ...getGlobalNavigation(role)
        .filter((item) => item.href !== homePath)
        .slice(0, 4),
    ];
  }, [role]);

  const quickActions: QuickAction[] =
    role === "owner" || role === "admin"
      ? [
          { label: "Academias", href: "/dashboard/academies", icon: Building2 },
          { label: "Equipo", href: "/dashboard/users", icon: Users },
          { label: "Facturación", href: "/dashboard/plan-limits", icon: CreditCard },
        ]
      : [
          { label: "Calendario", href: "/dashboard/calendar", icon: Calendar },
          { label: "Perfil", href: "/dashboard/profile", icon: User },
        ];

  if (!isMobile) {
    return null;
  }

  if (!pathname?.startsWith("/dashboard") || pathname.startsWith("/dashboard/profile/")) {
    return null;
  }

  const isActive = (href: string) => {
    if (href === "/dashboard" || href === "/dashboard/academies") {
      return pathname === "/dashboard" || pathname === "/dashboard/academies";
    }
    if (href === "/dashboard/profile") {
      return pathname === href || pathname.startsWith("/dashboard/profile/");
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowQuickActions(!showQuickActions)}
        className={cn(
          "fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-all hover:bg-primary/90 md:hidden",
          isVisible ? "bottom-20" : "pointer-events-none bottom-4 opacity-0"
        )}
        aria-label="Acciones rápidas"
      >
        <Plus className={cn("h-6 w-6 transition-transform", showQuickActions && "rotate-45")} />
      </button>

      {showQuickActions && (
        <div className="fixed bottom-36 right-4 z-40 space-y-2 md:hidden">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.href}
                type="button"
                onClick={() => {
                  router.push(action.href);
                  setShowQuickActions(false);
                }}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-2 shadow-lg"
              >
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out",
          isVisible ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="border-t border-border bg-background shadow-lg">
          <div className="safe-area-bottom flex h-16 items-center justify-around px-2">
            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <button
                  key={item.key}
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "flex h-full min-h-[44px] min-w-[64px] flex-1 flex-col items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={cn("mb-1 h-5 w-5", active && "scale-110")} />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="h-safe-area-bottom bg-background" />
        </div>
      </nav>
    </>
  );
}

export function useSafeAreaPadding() {
  const [padding, setPadding] = useState({ top: 0, bottom: 0 });

  useEffect(() => {
    const updatePadding = () => {
      const style = getComputedStyle(document.documentElement);
      const bottom = Number.parseInt(style.getPropertyValue("--sat-bottom") || "0", 10);
      setPadding((prev) => ({ ...prev, bottom }));
    };

    updatePadding();
    window.addEventListener("resize", updatePadding);
    return () => window.removeEventListener("resize", updatePadding);
  }, []);

  return padding;
}
