"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";

import { useAcademyContext } from "@/hooks/use-academy-context";
import { isAcademyNavigationActive } from "@/lib/navigation/active";
import { getMobileAcademyNavigation } from "@/lib/navigation/registry";
import { isProfileRole, type MembershipRole } from "@/lib/product/roles";
import { cn } from "@/lib/utils";

export function MobileAcademyNav() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useAcademyContext();
  const [isVisible, setIsVisible] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const lastScrollY = useRef(0);

  const academyId = context?.academyId;

  useEffect(() => {
    if (!academyId) return;

    if (window.innerWidth >= 1024) {
      return;
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [academyId]);

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
    return isAcademyNavigationActive(pathname, href, academyId);
  };

  const primaryItems = mobileNavItems.slice(0, 4);
  const secondaryItems = mobileNavItems.slice(4);

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out lg:hidden",
        isVisible ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="border-t border-zaltyko-mist/70 bg-white/95 shadow-soft backdrop-blur">
        <div className="safe-area-bottom grid h-[72px] grid-cols-5 items-center gap-1 px-2">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <button
                key={item.key}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex h-14 min-h-[44px] min-w-0 flex-col items-center justify-center rounded-xl border border-transparent transition-colors",
                  active
                    ? "border-zaltyko-teal/20 bg-zaltyko-teal/12 text-zaltyko-teal"
                    : "text-slate-500 hover:bg-zaltyko-white hover:text-zaltyko-navy"
                )}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("mb-1 h-5 w-5", active && "scale-110")} />
                <span className="max-w-full truncate px-1 text-[11px] font-semibold leading-4">{item.label}</span>
              </button>
            );
          })}
          {secondaryItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen((value) => !value)}
              className={cn(
                "flex h-14 min-h-[44px] min-w-0 flex-col items-center justify-center rounded-xl border border-transparent text-slate-500 transition-colors",
                moreOpen && "bg-slate-100 text-slate-950"
              )}
              aria-expanded={moreOpen}
              aria-label="Más secciones"
            >
              {moreOpen ? <X className="mb-1 h-5 w-5" /> : <MoreHorizontal className="mb-1 h-5 w-5" />}
              <span className="text-[11px] font-semibold leading-4">Más</span>
            </button>
          )}
        </div>
        {moreOpen && secondaryItems.length > 0 && (
          <div className="border-t border-slate-200 bg-white px-3 py-3 shadow-[0_-12px_30px_-20px_rgba(15,23,42,0.45)]">
            <div className="grid grid-cols-4 gap-2">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      router.push(item.href);
                    }}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[11px] font-semibold",
                      active ? "bg-zaltyko-teal/10 text-zaltyko-teal" : "text-slate-500 hover:bg-slate-50"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="max-w-full truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
