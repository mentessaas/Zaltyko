"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { LayoutDashboard, Users, Calendar, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface MobileNavItem {
  label: string;
  href: (academyId: string) => string;
  icon: React.ElementType;
}

const mobileNavItems: MobileNavItem[] = [
  { label: "Dashboard", href: (id) => `/app/${id}/dashboard`, icon: LayoutDashboard },
  { label: "Atletas", href: (id) => `/app/${id}/athletes`, icon: Users },
  { label: "Clases", href: (id) => `/app/${id}/classes`, icon: Calendar },
  { label: "Reportes", href: (id) => `/app/${id}/reports/attendance`, icon: BarChart3 },
  { label: "Ajustes", href: (id) => `/app/${id}/settings`, icon: Settings },
];

export function MobileAcademyNav() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useAcademyContext();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Get academyId from context or URL
  const academyId = context?.academyId;

  // Don't render if no academy context (loading/error state)
  if (!academyId) {
    return null;
  }

  // Don't render on desktop (sidebar handles navigation)
  useEffect(() => {
    const checkDesktop = () => {
      if (window.innerWidth >= 1024) {
        return false;
      }
      return true;
    };

    if (!checkDesktop()) {
      return;
    }

    // Hide/show on scroll
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
  }, [lastScrollY]);

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === `/app/${academyId}/dashboard`) {
      return pathname === href;
    }
    return pathname.startsWith(href.split("/").slice(0, 4).join("/"));
  };

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out lg:hidden",
        isVisible ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg">
        <div className="flex items-center justify-around h-16 px-2">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const href = item.href(academyId);
            const active = isActive(href);

            return (
              <button
                key={item.label}
                onClick={() => router.push(href)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full min-w-[64px] min-h-[44px] rounded-lg transition-colors",
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 mb-1",
                    active && "scale-110"
                  )}
                />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
