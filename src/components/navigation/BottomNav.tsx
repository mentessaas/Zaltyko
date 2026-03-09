"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, Users, Calendar, BarChart3, Settings, Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface BottomNavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const bottomNavItems: BottomNavItem[] = [
  { label: "Inicio", href: "/dashboard", icon: Home },
  { label: "Atletas", href: "/dashboard/athletes", icon: Users },
  { label: "Clases", href: "/dashboard/classes", icon: Calendar },
  { label: "Reportes", href: "/dashboard/reports", icon: BarChart3 },
  { label: "Ajustes", href: "/dashboard/settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Hide/show on scroll for mobile
  useEffect(() => {
    if (!isMobile) return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Show nav when scrolling up, hide when scrolling down
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

  // Don't render on desktop
  if (!isMobile) {
    return null;
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  const handleNavClick = (href: string) => {
    router.push(href);
  };

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out",
        isVisible ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg">
        <div className="flex items-center justify-around h-16 px-2 safe-area-bottom">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full min-w-[64px] min-h-[44px] rounded-lg transition-colors",
                  active
                    ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 mb-1",
                    active && "scale-110"
                  )}
                />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Safe area indicator for notched phones */}
        <div className="h-safe-area-bottom bg-white dark:bg-gray-900" />
      </div>
    </nav>
  );
}

// Hook to get safe area padding
export function useSafeAreaPadding() {
  const [padding, setPadding] = useState({ top: 0, bottom: 0 });

  useEffect(() => {
    const updatePadding = () => {
      const style = getComputedStyle(document.documentElement);
      const bottom = Number.parseInt(style.getPropertyValue("--sat-bottom") || "0");
      setPadding(prev => ({ ...prev, bottom }));
    };

    updatePadding();
    window.addEventListener("resize", updatePadding);
    return () => window.removeEventListener("resize", updatePadding);
  }, []);

  return padding;
}
