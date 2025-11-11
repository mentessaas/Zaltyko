import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";

import AccountForm from "./account-form";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { academies, profiles, memberships, subscriptions, plans } from "@/db/schema";
import Link from "next/link";

export default async function Dashboard() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profile] = user
    ? await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, user.id))
        .limit(1)
    : [];

  const academyMemberships = user
    ? await db
        .select({
          id: academies.id,
          name: academies.name,
          academyType: academies.academyType,
          createdAt: academies.createdAt,
          ownerId: academies.ownerId,
        })
        .from(memberships)
        .innerJoin(academies, eq(memberships.academyId, academies.id))
        .where(eq(memberships.userId, user.id))
        .orderBy(asc(academies.name))
    : [];

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

  if (!hasAcademy) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-lg border border-dashed border-amber-400/60 bg-amber-400/10 p-8 text-amber-900">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Crea tu academia para continuar</h1>
          <p className="text-sm">
            Aún no encontramos ninguna academia asociada a tu usuario. Completa el onboarding para
            desbloquear la gestión de atletas, entrenadores, clases y facturación.
          </p>
        </div>
        <div>
          <Link
            href="/onboarding"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90"
          >
            Ir al onboarding
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            ¿Ya completaste el proceso en otra sesión? Refresca la página después de finalizar el
            paso “Crear academia”.
          </p>
        </div>
      </div>
    );
  }

  const defaultActiveAcademyId = profile?.activeAcademyId ?? academiesWithSubscription[0]?.id ?? null;

  return (
    <AccountForm
      user={user}
      profile={profile ?? null}
      academies={academiesWithSubscription}
      defaultAcademyId={defaultActiveAcademyId}
    />
  );
}
