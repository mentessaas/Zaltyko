"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getAcademyNavigation } from "@/lib/navigation/registry";
import { isAcademyNavigationActive } from "@/lib/navigation/active";
import { isProfileRole, type MembershipRole } from "@/lib/product/roles";
import { cn } from "@/lib/utils";

export function AcademySidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useAcademyContext();
  const [searchQuery, setSearchQuery] = useState("");

  if (!context?.academyId) {
    return null;
  }

  const basePath = `/app/${context.academyId}`;
  const canCreateAthlete = context.profileRole === "owner" || context.profileRole === "admin" || context.membershipRole === "owner" || context.isSuperAdmin;
  const navItems = getAcademyNavigation({
    academyId: context.academyId,
    profileRole: isProfileRole(context.profileRole) ? context.profileRole : "owner",
    membershipRole: (context.membershipRole ?? null) as MembershipRole | null,
    specialization: context.specialization,
  });

  const isActive = (href: string) => {
    return isAcademyNavigationActive(pathname, href, context.academyId);
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchQuery.trim()) {
      router.push(`${basePath}/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <aside className="hidden w-72 flex-col border-r border-white/10 bg-zaltyko-navy px-5 py-6 text-white lg:flex">
      <div className="mb-5 rounded-[20px] border border-white/10 bg-gradient-to-br from-white/[0.12] to-white/[0.03] p-4 shadow-[0_20px_40px_-28px_rgba(0,0,0,0.8)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/80">
          Academia
        </p>
        <p className="mt-2 truncate font-display text-lg font-bold tracking-[-0.02em] text-white">
          {context.academyName}
        </p>
        {context.planNickname || context.planCode ? (
          <p className="mt-1 text-xs text-white/75">
            {context.planNickname ?? context.planCode?.toUpperCase()}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
          <input
            type="search"
            placeholder="Buscar en la academia..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-card border border-white/10 bg-white/[0.06] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/70 focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          />
        </div>
      </form>

      {canCreateAthlete && (
      <div className="mb-5">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="min-h-10 w-full justify-center border-white/20 bg-white/[0.08] text-xs font-semibold text-white hover:bg-white/15"
        >
          <Link href={`${basePath}/athletes/new`}>
            <Plus className="mr-1 h-3 w-3" />
            Nuevo atleta
          </Link>
        </Button>
      </div>
      )}

      {context.isSuperAdmin && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-white/30 bg-white/[0.08] font-semibold text-white hover:bg-white/15"
            onClick={() => router.push("/super-admin/academies")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={2} />
            Volver a Super Admin
          </Button>
        </div>
      )}

      <nav className="space-y-5 text-sm">
        {[
          { label: "Operación", keys: ["dashboard", "athletes", "groups", "classes", "attendance-today", "events", "assessments"] },
          { label: "Relación", keys: ["messages", "announcements"] },
          { label: "Control", keys: ["coaches", "reports", "billing", "settings"] },
        ].map((section) => {
          const sectionItems = navItems.filter((item) => section.keys.includes(item.key));
          if (sectionItems.length === 0) return null;
          return (
            <div key={section.label}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{section.label}</p>
              <ul className="space-y-1">
                {sectionItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-white/20 bg-white/[0.12] text-white shadow-soft"
                      : "text-white/75 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                  <span className="flex-1">{item.label}</span>
                </Link>
                </li>
                );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
