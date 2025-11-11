import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, Shield } from "lucide-react";
import Link from "next/link";

import AccountForm from "../../account-form";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { academies, profiles, memberships, subscriptions, plans } from "@/db/schema";
import { getCurrentProfile } from "@/lib/authz";

interface ViewUserPageProps {
  params: Promise<{ profileId: string }>;
}

export default async function ViewUserPage({ params }: ViewUserPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Verify current user is Super Admin
  const currentProfile = await getCurrentProfile(user.id);
  if (!currentProfile || currentProfile.role !== "super_admin") {
    redirect("/dashboard");
  }

  const { profileId } = await params;

  // Get the target user's profile
  const [targetProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!targetProfile) {
    notFound();
  }

  // Get target user's academy memberships
  const academyMemberships = await db
    .select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      createdAt: academies.createdAt,
      ownerId: academies.ownerId,
    })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, targetProfile.userId))
    .orderBy(asc(academies.name));

  // Get user subscription for academies where user is owner
  const academiesWithSubscription = await Promise.all(
    academyMemberships.map(async (academy) => {
      let planCode: string | null = null;
      let planNickname: string | null = null;
      let subscriptionStatus: string | null = null;

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
              status: subscriptions.status,
            })
            .from(subscriptions)
            .leftJoin(plans, eq(subscriptions.planId, plans.id))
            .where(eq(subscriptions.userId, owner.userId))
            .limit(1);

          if (sub) {
            planCode = sub.planCode ?? null;
            planNickname = sub.planNickname ?? null;
            subscriptionStatus = sub.status ?? null;
          }
        }
      }

      return {
        id: academy.id,
        name: academy.name,
        academyType: academy.academyType,
        createdAt: academy.createdAt,
        planCode,
        planNickname,
        subscriptionStatus,
      };
    })
  );

  const hasAcademy = academiesWithSubscription.length > 0;
  const defaultActiveAcademyId = targetProfile.activeAcademyId ?? academiesWithSubscription[0]?.id ?? null;

  return (
    <div className="space-y-6">
      {/* Banner indicando que está en modo "ver como usuario" */}
      <div className="mx-auto max-w-3xl rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-amber-600" strokeWidth={2} />
            <div>
              <p className="font-semibold text-amber-900">
                Modo Super Admin: Viendo perfil de {targetProfile.name ?? "Usuario"}
              </p>
              <p className="text-sm text-amber-700">
                Estás viendo el dashboard de este usuario. Los cambios que hagas afectarán a su cuenta.
              </p>
            </div>
          </div>
          <Link
            href={`/super-admin/users/${profileId}`}
            className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-50"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Volver a Super Admin
          </Link>
        </div>
      </div>

      {!hasAcademy ? (
        <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-lg border border-dashed border-amber-400/60 bg-amber-400/10 p-8 text-amber-900">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Este usuario no tiene academias</h1>
            <p className="text-sm">
              El usuario {targetProfile.name ?? "sin nombre"} aún no ha completado el onboarding para crear una academia.
            </p>
          </div>
        </div>
      ) : (
        <AccountForm
          user={user}
          profile={targetProfile}
          academies={academiesWithSubscription}
          defaultAcademyId={defaultActiveAcademyId}
          targetProfileId={profileId}
        />
      )}
    </div>
  );
}

