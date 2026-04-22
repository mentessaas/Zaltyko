"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAcademyContext } from "@/hooks/use-academy-context";
import { getMobileAcademyNavigation } from "@/lib/navigation/registry";
import { isProfileRole, type MembershipRole } from "@/lib/product/roles";
import { cn } from "@/lib/utils";

export function MobileAcademyNav() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useAcademyContext();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const academyId = context?.academyId;

  useEffect(() => {
    if (!academyId) return;

    if (window.innerWidth >= 1024) {
      return;
    }

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
  }, [academyId, lastScrollY]);

  if (!academyId) {
    return null;
  }

  const mobileNavItems = getMobileAcademyNavigation({
    academyId,
    profileRole: isProfileRole(context?.profileRole) ? context.profileRole : "owner",
    membershipRole: (context?.membershipRole ?? null) as MembershipRole | null,
    specialization: context?.specialization,
  });

  const isActive = (href: string) => {
    if (!pathname) return false;
    return href === `/app/${academyId}/dashboard`
      ? pathname === href
      : pathname.startsWith(href);
  };

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out lg:hidden",
        isVisible ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="border-t border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-around h-16 px-2">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <button
                key={item.key}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full min-w-[64px] min-h-[44px] rounded-lg transition-colors",
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
      </div>
    </nav>
  );
}
