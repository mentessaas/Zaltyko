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
import { getProductPlanPublicName } from "@/lib/plans/catalog";

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

  // P1 #3 del critique `/impeccable` Operate: el buscador era role-blind.
  // - athlete / parent con membership "viewer" caen en `/my-dashboard`,
  //   `/my-events`, `/messages`, `/notifications` (whitelist de limited
  //   access). El sidebar les renderiza pero la página `/athletes` los
  //   redirige fuera. Mostrar el search era un dead-end trap.
  // - coach con membership "coach" SÍ puede entrar a `/athletes`, pero
  //   el placeholder genérico "Buscar gimnastas…" les invitaba a tipear
  //   nombres de coaches (que devuelve 0 resultados en la lista de
  //   atletas). "Buscar mis atletas…" refleja lo que realmente buscan.
  // - owner / admin / super_admin: comportamiento previo intacto.
  const effectiveProfileRole = isProfileRole(context.profileRole) ? context.profileRole : "owner";
  const isLimitedMember = effectiveProfileRole === "athlete" || effectiveProfileRole === "parent";
  const isCoachMember = context.membershipRole === "coach" && !context.isSuperAdmin;
  const searchPlaceholder = isCoachMember ? "Buscar mis gimnastas…" : "Buscar gimnastas…";
  const showSearch = !isLimitedMember;

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    // La ruta /search no existe; el buscador lleva al listado de gimnastas,
    // que ya filtra por ?q= en servidor. Para coach funciona (no es
    // admin-only); para owner/admin/super_admin es la lista completa.
    if (searchQuery.trim()) {
      router.push(`${basePath}/athletes?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    // Barra lateral «Magnesio sobre tapiz»: la zona de seguridad del tapiz.
    // Estructura tomada de @ballmac/app-shell-1 (hallado con ui-indexador):
    // academia arriba, acción principal, navegación agrupada con rótulos;
    // el activo es un tramo de cinta blanca con texto azul.
    <aside className="mat-field-deep hidden w-64 shrink-0 flex-col px-4 py-5 text-white lg:flex">
      <div className="border-b-[3px] border-white px-2 pb-4">
        <p className="font-display line-clamp-2 break-words text-2xl font-black uppercase leading-[0.95] text-white">
          {context.academyName}
        </p>
        {context.planNickname || context.planCode ? (
          <p className="floor-label mt-2 text-mat-lane">
            Plan {getProductPlanPublicName(context.planCode, context.planNickname)}
          </p>
        ) : null}
      </div>

      {showSearch && (
        <form onSubmit={handleSearch} role="search" className="mt-4">
          <label className="relative block">
            <span className="sr-only">{searchPlaceholder}</span>
            <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-10 w-full rounded-md border border-white/15 bg-mat-night/35 pl-9 pr-3 text-sm text-white placeholder:text-white/65 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </label>
        </form>
      )}

      {canCreateAthlete && (
        <Link
          href={`${basePath}/athletes/new`}
          className="mt-3 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-white text-sm font-bold text-mat-deep transition-colors hover:bg-chalk focus-visible:ring-white focus-visible:ring-offset-mat-deep"
        >
          <Plus aria-hidden className="h-4 w-4" />
          Añadir gimnasta
        </Link>
      )}

      {context.isSuperAdmin && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full border-white/30 bg-transparent font-semibold text-white hover:border-white hover:bg-white/10 hover:text-white"
          onClick={() => router.push("/super-admin/academies")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={2} />
          Volver a Super Admin
        </Button>
      )}

      <nav aria-label="Academia" className="mt-6 space-y-6 text-sm">
        {[
          { label: "Operación", keys: ["dashboard", "athletes", "groups", "classes", "attendance-today", "events", "assessments"] },
          { label: "Relación", keys: ["messages", "announcements"] },
          { label: "Control", keys: ["coaches", "reports", "billing", "settings"] },
        ].map((section) => {
          const sectionItems = navItems.filter((item) => section.keys.includes(item.key));
          if (sectionItems.length === 0) return null;
          return (
            <div key={section.label}>
              <p className="floor-label mb-1.5 px-2 text-mat-lane">{section.label}</p>
              <ul className="space-y-0.5">
                {sectionItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center gap-3 rounded-md px-2.5 text-sm font-semibold transition-colors focus-visible:ring-white focus-visible:ring-offset-mat-deep",
                    active
                      ? "bg-white text-mat-deep"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon aria-hidden className="h-[1.1rem] w-[1.1rem] shrink-0" strokeWidth={2} />
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
