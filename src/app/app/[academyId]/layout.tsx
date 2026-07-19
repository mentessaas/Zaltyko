import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";

import { AcademySidebar } from "@/components/academy/AcademySidebar";
import { ToastProvider } from "@/components/ui/toast-provider";
import { GlobalTopNav } from "@/components/navigation/GlobalTopNav";
import { MobileAcademyNav } from "@/components/navigation/MobileAcademyNav";
import { db } from "@/db";
import { academies, memberships, plans, profiles, subscriptions } from "@/db/schema";
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

import { AcademyTopNav } from "./top-nav";
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
      .where(eq(academies.id, academyId))
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

  let subscription: { planCode: string | null; planNickname: string | null } | null = null;

  if (academy.ownerId) {
    const [owner] = await db
      .select({
        userId: profiles.userId,
      })
      .from(profiles)
      .where(eq(profiles.id, academy.ownerId))
      .limit(1);

    if (owner) {
      const [sub] = await db
        .select({
          planCode: plans.code,
          planNickname: plans.nickname,
        })
        .from(subscriptions)
        .leftJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.userId, owner.userId))
        .limit(1);
      subscription = sub ?? null;
    }
  }

  const [academyCountRow] = await db
    .select({ total: count() })
    .from(academies)
    .where(eq(academies.tenantId, academy.tenantId));

  let tenantAcademies = [] as { id: string; name: string | null }[];
  try {
    tenantAcademies = await db
      .select({ id: academies.id, name: academies.name })
      .from(academies)
      .where(eq(academies.tenantId, academy.tenantId));
  } catch (error) {
    logger.error("Failed to fetch tenant academies:", error);
    tenantAcademies = [{ id: academy.id, name: academy.name }];
  }

  const isSuperAdmin = profile.role === "super_admin";
  const isOwner = academy.ownerId === profile.id;
  const isMember = Boolean(membership);
  const academyAccessLevel = getAcademyAccessLevel(
    profile.role,
    membership?.role ?? null,
    isOwner
  );
  const isAdmin =
    academyAccessLevel === "platform-admin" || academyAccessLevel === "academy-admin";

  const pathname = headerStore.get("x-pathname");
  const hasLimitedAcademyAccess =
    isMember &&
    academyAccessLevel === "limited" &&
    isLimitedAcademyWorkspacePath(pathname, academy.id);

  const canAccess =
    isSuperAdmin ||
    hasLimitedAcademyAccess ||
    (canAccessAcademyWorkspace(profile.role, membership?.role ?? null, isOwner) &&
      (isOwner || isMember));

  if (!canAccess) {
    redirect(profile.role === "athlete" || profile.role === "parent" ? "/dashboard/profile" : "/dashboard");
  }

  const adminOnlyPaths = [
    `/app/${academy.id}/billing`,
    `/app/${academy.id}/settings`,
    `/app/${academy.id}/coaches`,
    `/app/${academy.id}/announcements`,
  ];
  const isAdminOnlyPath = adminOnlyPaths.some(
    (path) => pathname === path || pathname?.startsWith(`${path}/`)
  );

  if (isAdminOnlyPath && !isAdmin) {
    redirect(`/app/${academy.id}/dashboard`);
  }

  const planCode = subscription?.planCode ?? "free";
  const planNickname = subscription?.planNickname ?? null;
  const academyCount = Number(academyCountRow?.total ?? 0);

  const canCreateAcademies = planCode !== "free" || isSuperAdmin;
  const planLimitLabel = canCreateAcademies
    ? `Actualmente gestionas ${academyCount} academia${academyCount === 1 ? "" : "s"}.`
    : "Tu plan actual no permite crear nuevas academias. Actualiza tu plan para ampliarlo.";
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
    canCreateAcademies,
    academyCount,
    planLimitLabel,
    tenantAcademies,
    specialization,
  };

  return (
    <AcademyProvider value={contextValue}>
      <ToastProvider>
        <div className="flex min-h-screen flex-col bg-zaltyko-white">
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
              <AcademyTopNav />
              <main id="main-content" className="flex-1 bg-zaltyko-white px-4 py-4 pb-20 sm:px-6 lg:px-8 lg:pb-6" tabIndex={-1}>
                {children}
              </main>
            </div>
          </div>
        </div>
      </ToastProvider>
    </AcademyProvider>
  );
}
