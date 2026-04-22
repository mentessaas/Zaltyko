"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Plus, Search, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getAcademyNavigation } from "@/lib/navigation/registry";
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
  const navItems = getAcademyNavigation({
    academyId: context.academyId,
    profileRole: isProfileRole(context.profileRole) ? context.profileRole : "owner",
    membershipRole: (context.membershipRole ?? null) as MembershipRole | null,
    specialization: context.specialization,
  });

  const isActive = (href: string) => {
    if (!pathname) return false;
    return href === `${basePath}/dashboard` ? pathname === href : pathname.startsWith(href);
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchQuery.trim()) {
      router.push(`${basePath}/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <aside className="hidden w-64 flex-col border-r border-border/80 bg-card/40 p-4 lg:flex">
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar en la academia..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => router.push(`${basePath}/athletes/new`)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Nuevo atleta
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => router.push(`${basePath}/settings/export`)}
        >
          <Settings className="mr-1 h-3 w-3" />
          Ajustes
        </Button>
      </div>

      {context.isSuperAdmin && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-emerald-500/60 bg-emerald-500/20 text-emerald-100 font-semibold shadow-sm hover:border-emerald-400 hover:bg-emerald-500/30 hover:text-white"
            onClick={() => router.push("/super-admin/academies")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={2} />
            Volver a Super Admin
          </Button>
        </div>
      )}

      <nav className="space-y-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Academia
        </p>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 transition",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
