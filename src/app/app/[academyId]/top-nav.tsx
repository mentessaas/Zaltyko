"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Shield } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { ProfileBadge } from "@/components/academy/ProfileBadge";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getRoleLabel } from "@/lib/roles";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", path: (id: string) => `/app/${id}/dashboard` },
  { key: "athletes", label: "Atletas", path: (id: string) => `/app/${id}/athletes` },
  { key: "coaches", label: "Entrenadores", path: (id: string) => `/app/${id}/coaches` },
  { key: "groups", label: "Grupos", path: (id: string) => `/app/${id}/groups` },
  { key: "classes", label: "Clases", path: (id: string) => `/app/${id}/classes` },
  { key: "attendance", label: "Asistencia", path: (id: string) => `/app/${id}/attendance` },
  { key: "billing", label: "Facturación", path: (id: string) => `/app/${id}/billing` },
  { key: "assessments", label: "Evaluaciones", path: (id: string) => `/app/${id}/assessments` },
  { key: "onboarding", label: "Nuevo onboarding", path: () => `/onboarding` },
];

function formatLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

export function AcademyTopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [signOutLoading, setSignOutLoading] = useState(false);
  const {
    academyId,
    academyName,
    academyType,
    profileRole,
    membershipRole,
    profileName,
    canCreateAcademies,
    planLimitLabel,
    tenantAcademies,
    isSuperAdmin,
  } = useAcademyContext();

  const navItems = useMemo(() => {
    const hasAcademy = Boolean(academyId);

    return NAV_ITEMS.filter((item) => {
      if (item.key === "onboarding") {
        return !hasAcademy;
      }
      return true;
    }).map((item) => {
      const href = item.path(academyId);
      return {
        ...item,
        href,
        active: pathname?.startsWith(href),
      };
    });
  }, [academyId, pathname]);

  const primaryRole = getRoleLabel(membershipRole ?? profileRole ?? undefined);
  const activeSection = navItems.find((item) => item.active) ?? navItems[0];
  const sectionTitle = activeSection?.label ?? "Panel";

  const handleSignOut = async () => {
    if (signOutLoading) {
      return;
    }
    setSignOutLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    } finally {
      setSignOutLoading(false);
      router.push("/auth/login");
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/80 backdrop-blur">
      {/* Navegación compacta para móviles */}
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {academyName ?? "Academia sin nombre"}
            </p>
            <p className="text-xs text-muted-foreground">
              Disciplina: {formatLabel(academyType)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-500/60 bg-emerald-500/20 text-emerald-100 font-semibold shadow-sm hover:border-emerald-400 hover:bg-emerald-500/30 hover:text-white"
                onClick={() => router.push("/super-admin")}
              >
                <Shield className="h-4 w-4" strokeWidth={2} />
                <span className="hidden sm:inline">Super Admin</span>
              </Button>
            )}
            <ProfileBadge
              name={profileName}
              role={profileRole}
              membershipRole={membershipRole}
              loading={signOutLoading}
              onSignOut={handleSignOut}
              onGoToProfile={() => router.push("/dashboard")}
              onManageAcademies={() => {
                if (canCreateAcademies) {
                  router.push("/onboarding");
                }
              }}
              academiesLimitLabel={planLimitLabel}
              canCreateAcademies={canCreateAcademies}
              academies={tenantAcademies}
              currentAcademyId={academyId}
              onSelectAcademy={(id) => router.push(`/app/${id}/dashboard`)}
            />
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                item.active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Cabecera informativa para escritorio */}
      <div className="hidden items-center justify-between px-8 py-4 lg:flex">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-muted-foreground/80">Academia</p>
          <p className="text-lg font-semibold leading-tight text-foreground">
            {academyName ?? "Academia sin nombre"}
          </p>
          <p className="text-xs text-muted-foreground">
            Disciplina: {formatLabel(academyType)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-500/60 bg-emerald-500/20 text-emerald-100 font-semibold shadow-sm hover:border-emerald-400 hover:bg-emerald-500/30 hover:text-white"
              onClick={() => router.push("/super-admin")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={2} />
              Volver a Super Admin
            </Button>
          )}
          <ProfileBadge
            name={profileName}
            role={profileRole}
            membershipRole={membershipRole}
            loading={signOutLoading}
            onSignOut={handleSignOut}
            onGoToProfile={() => router.push("/dashboard")}
            onManageAcademies={() => {
              if (canCreateAcademies) {
                router.push("/onboarding");
              }
            }}
            academiesLimitLabel={planLimitLabel}
            canCreateAcademies={canCreateAcademies}
            academies={tenantAcademies}
            currentAcademyId={academyId}
            onSelectAcademy={(id) => router.push(`/app/${id}/dashboard`)}
          />
        </div>
      </div>
    </header>
  );
}


