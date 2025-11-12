import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";

import { AcademySidebar } from "@/components/academy/AcademySidebar";
import { ToastProvider } from "@/components/ui/toast-provider";
import { GlobalTopNav } from "@/components/navigation/GlobalTopNav";
import { db } from "@/db";
import { academies, memberships, plans, profiles, subscriptions } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { AcademyProvider } from "@/hooks/use-academy-context";

import { AcademyTopNav } from "./top-nav";

interface LayoutProps {
  params: {
    academyId: string;
  };
  children: React.ReactNode;
}

export default async function AcademyLayout({ params, children }: LayoutProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
      academyType: academies.academyType,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  const [membership] = await db
    .select({
      role: memberships.role,
    })
    .from(memberships)
    .where(and(eq(memberships.academyId, academy.id), eq(memberships.userId, user.id)))
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

  const tenantAcademies = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(eq(academies.tenantId, academy.tenantId));

  const isSuperAdmin = profile.role === "super_admin";
  const isAdmin = isSuperAdmin || profile.role === "admin";
  const isOwner = profile.role === "owner" || membership?.role === "owner";
  const isMember = Boolean(membership);

  const tenantMatches = profile.tenantId && profile.tenantId === academy.tenantId;

  const canAccess =
    isSuperAdmin ||
    isOwner ||
    (isAdmin && tenantMatches) ||
    (isMember && tenantMatches);

  if (!canAccess) {
    redirect("/dashboard");
  }

  const planCode = subscription?.planCode ?? "free";
  const planNickname = subscription?.planNickname ?? null;
  const academyCount = Number(academyCountRow?.total ?? 0);

  const canCreateAcademies = planCode !== "free" || isSuperAdmin;
  const planLimitLabel = canCreateAcademies
    ? `Actualmente gestionas ${academyCount} academia${academyCount === 1 ? "" : "s"}.`
    : "Tu plan actual no permite crear nuevas academias. Actualiza tu plan para ampliarlo.";

  const contextValue = {
    academyId: academy.id,
    academyName: academy.name ?? "Academia",
    academyType: academy.academyType ?? null,
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
  };

  return (
    <AcademyProvider value={contextValue}>
      <ToastProvider>
        <div className="flex min-h-screen flex-col">
          <GlobalTopNav
            userRole={profile.role}
            userName={profile.name}
            userEmail={user.email ?? null}
            profileId={profile.id}
          />
          <div className="flex flex-1 flex-col lg:flex-row">
            <AcademySidebar />
            <div className="flex flex-1 flex-col">
              <AcademyTopNav />
              <main className="flex-1 bg-muted/10">{children}</main>
            </div>
          </div>
        </div>
      </ToastProvider>
    </AcademyProvider>
  );
}


