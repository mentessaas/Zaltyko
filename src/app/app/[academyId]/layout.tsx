import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, count, eq, or } from "drizzle-orm";

import { AcademySidebar } from "@/components/academy/AcademySidebar";
import { ToastProvider } from "@/components/ui/toast-provider";
import { GlobalTopNav } from "@/components/navigation/GlobalTopNav";
import { MobileAcademyNav } from "@/components/navigation/MobileAcademyNav";
import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { AcademyProvider } from "@/hooks/use-academy-context";
import { DashboardSkipLink } from "@/components/dashboard/DashboardSkipLink";
import {
  canAccessAcademyWorkspace,
  getAcademyAccessLevel,
  isLimitedAcademyWorkspacePath,
} from "@/lib/product/roles";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { AccessDenied } from "@/components/ui/access-denied";
import { getActiveSubscription } from "@/lib/limits";
import { ChatWidgetWrapper } from "@/components/chat/ChatWidgetWrapper";

import { logger } from "@/lib/logger";

interface LayoutProps {
  params: Promise<{
    academyId: string;
  }>;
  children: React.ReactNode;
}

export default async function AcademyLayout({ params, children }: LayoutProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const headerStore = await headers();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveUserId = user?.id ?? devSession?.userId ?? null;
  const effectiveUserEmail = user?.email ?? null;

  if (!effectiveUserId) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      role: profiles.role,
      tenantId: profiles.tenantId,
    })
    .from(profiles)
    .where(eq(profiles.userId, effectiveUserId))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  const isSuperAdmin = profile.role === "super_admin";

  let academy = null;
  try {
    const [result] = await db
      .select({
        id: academies.id,
        name: academies.name,
        tenantId: academies.tenantId,
        country: academies.country,
        countryCode: academies.countryCode,
        academyType: academies.academyType,
        discipline: academies.discipline,
        disciplineVariant: academies.disciplineVariant,
        federationConfigVersion: academies.federationConfigVersion,
        specializationStatus: academies.specializationStatus,
        ownerId: academies.ownerId,
      })
      .from(academies)
      .where(
        isSuperAdmin
          ? eq(academies.id, academyId)
          : and(eq(academies.id, academyId), eq(academies.tenantId, profile.tenantId))
      )
      .limit(1);
    academy = result;
  } catch (error) {
    logger.error("Failed to fetch academy:", error);
  }

  if (!academy && devSession?.academyId === academyId) {
    academy = {
      id: devSession.academyId,
      name: devSession.academyName ?? "Academia Demo",
      tenantId: profile.tenantId,
      country: "ES",
      countryCode: "ES",
      academyType: devSession.academyType ?? "artistica",
      discipline: null,
      disciplineVariant: null,
      federationConfigVersion: null,
      specializationStatus: null,
      ownerId: profile.id,
    };
  }

  if (!academy) {
    notFound();
  }

  const [membership] = await db
    .select({
      role: memberships.role,
    })
    .from(memberships)
    .where(and(eq(memberships.academyId, academy.id), eq(memberships.userId, effectiveUserId)))
    .limit(1);

  // Todas las superficies de la academia deben leer la misma suscripción
  // efectiva. Este resolver incluye trials y descarta estados terminales;
  // consultar solo `subscriptions` aquí dejaba el sidebar en Free mientras el
  // dashboard ya mostraba Starter en período de prueba.
  const activeSubscription = await getActiveSubscription(academy.id);

  const [academyCountRow] = await db
    .select({ total: count() })
    .from(academies)
    .where(
      and(
        eq(academies.tenantId, academy.tenantId),
        eq(academies.isSuspended, false),
        or(eq(academies.status, "active"), eq(academies.status, "trial"))
      )
    );

  let tenantAcademies = [] as { id: string; name: string | null }[];
  try {
    tenantAcademies = await db
      .select({ id: academies.id, name: academies.name })
      .from(academies)
      .where(
        and(
          eq(academies.tenantId, academy.tenantId),
          eq(academies.isSuspended, false),
          or(eq(academies.status, "active"), eq(academies.status, "trial"))
        )
      )
      .limit(500);
  } catch (error) {
    logger.error("Failed to fetch tenant academies:", error);
    tenantAcademies = [{ id: academy.id, name: academy.name }];
  }

  const isOwner = academy.ownerId === profile.id;
  const isMember = Boolean(membership);
  const academyAccessLevel = getAcademyAccessLevel(
    profile.role,
    membership?.role ?? null,
    isOwner
  );
  const isAdmin =
    academyAccessLevel === "platform-admin" || academyAccessLevel === "academy-admin";

  const pathname = headerStore.get("x-zaltyko-pathname") ?? headerStore.get("x-pathname");
  const hasLimitedAcademyAccess =
    isMember &&
    academyAccessLevel === "limited" &&
    isLimitedAcademyWorkspacePath(pathname, academy.id);

  const canAccess =
    isSuperAdmin ||
    hasLimitedAcademyAccess ||
    (canAccessAcademyWorkspace(profile.role, membership?.role ?? null, isOwner) &&
      (isOwner || isMember));

  const showGeneralDenied = !canAccess;

  const adminOnlyPaths = [
    `/app/${academy.id}/billing`,
    `/app/${academy.id}/settings`,
    `/app/${academy.id}/coaches`,
    `/app/${academy.id}/announcements`,
    `/app/${academy.id}/reports`,
  ];
  const isAdminOnlyPath = adminOnlyPaths.some(
    (path) => pathname === path || pathname?.startsWith(`${path}/`)
  );

  const showAdminOnlyDenied = !showGeneralDenied && isAdminOnlyPath && !isAdmin;

  const generalDeniedCtaHref =
    profile.role === "athlete" || profile.role === "parent"
      ? "/dashboard/profile"
      : "/dashboard";
  const generalDeniedCtaLabel =
    profile.role === "athlete" || profile.role === "parent"
      ? "Volver a mi perfil"
      : "Volver al inicio";

  const adminOnlyDeniedCtaHref =
    profile.role === "coach"
      ? `/app/${academy.id}/coach`
      : `/app/${academy.id}/dashboard`;
  const adminOnlyDeniedCtaLabel =
    profile.role === "coach"
      ? "Ir a mi panel de coach"
      : "Ir al dashboard";

  const planCode = activeSubscription.planCode;
  const planNickname = activeSubscription.planNickname ?? null;
  const planStatus = activeSubscription.status ?? "active";
  const academyCount = Number(academyCountRow?.total ?? 0);

  const hasAcademyCapacity =
    activeSubscription.academyLimit === null || academyCount < activeSubscription.academyLimit;
  const canCreateAcademies = isSuperAdmin || hasAcademyCapacity;
  const planLimitLabel = canCreateAcademies
    ? activeSubscription.academyLimit === null
      ? `Actualmente gestionas ${academyCount} academia${academyCount === 1 ? "" : "s"}.`
      : `Gestionas ${academyCount} de ${activeSubscription.academyLimit} academias incluidas en tu plan.`
    : `Has alcanzado el límite de ${activeSubscription.academyLimit} academia. Actualiza tu plan para añadir otra.`;
  const specialization = resolveAcademySpecialization({
    academyType: academy.academyType,
    country: academy.country,
    countryCode: academy.countryCode,
    discipline: academy.discipline,
    disciplineVariant: academy.disciplineVariant,
    federationConfigVersion: academy.federationConfigVersion,
    specializationStatus: academy.specializationStatus,
  });

  const contextValue = {
    academyId: academy.id,
    academyName: academy.name ?? "Academia",
    academyType: academy.academyType ?? null,
    academyCountry: academy.country ?? null,
    tenantId: academy.tenantId,
    profileId: profile.id,
    profileName: profile.name,
    profileRole: profile.role,
    membershipRole: membership?.role ?? null,
    isAdmin: isAdmin || isOwner,
    isOwner,
    isSuperAdmin,
    planCode,
    planNickname,
    planStatus,
    canCreateAcademies,
    academyCount,
    planLimitLabel,
    tenantAcademies,
    specialization,
  };

  return (
    <AcademyProvider value={contextValue}>
      <ToastProvider>
        <div className="flex min-h-screen flex-col bg-background">
          <DashboardSkipLink />
          <GlobalTopNav
            userRole={profile.role}
            userName={profile.name}
            userEmail={effectiveUserEmail}
            profileId={profile.id}
            currentAcademyId={academy.id}
            membershipRole={membership?.role ?? null}
            academyName={academy.name}
            academyType={academy.academyType}
            tenantAcademies={tenantAcademies}
            canCreateAcademies={canCreateAcademies}
          />
          <div className="flex flex-1 flex-col lg:flex-row">
            <AcademySidebar />
            <MobileAcademyNav />
            <div className="flex flex-1 flex-col">
              <main id="main-content" className="flex-1 bg-transparent px-4 py-5 pb-24 sm:px-6 lg:px-10 lg:py-7 lg:pb-8" tabIndex={-1}>
                {showGeneralDenied ? (
                  <AccessDenied
                    variant="default"
                    title="No tienes acceso a esta academia"
                    description={`Tu rol actual (${profile.role}) no tiene acceso al espacio de trabajo de esta academia.`}
                    ctaLabel={generalDeniedCtaLabel}
                    ctaHref={generalDeniedCtaHref}
                  />
                ) : showAdminOnlyDenied ? (
                  <AccessDenied
                    variant="admin"
                    title="Esta sección es solo para administradores"
                    description={`Tu rol actual (${profile.role}) no tiene permisos para acceder a esta sección.`}
                    ctaLabel={adminOnlyDeniedCtaLabel}
                    ctaHref={adminOnlyDeniedCtaHref}
                  />
                ) : (
                  children
                )}
              </main>
            </div>
          </div>
          {/* The modern academy workspace is the canonical destination for
              owners, coaches and families. Keep the assistant mounted here
              as well as in the legacy dashboard so users do not lose the
              support entry point after the workspace redirect. */}
          <ChatWidgetWrapper academyId={academy.id} />
        </div>
      </ToastProvider>
    </AcademyProvider>
  );
}
