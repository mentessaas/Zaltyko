import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { eq, and, count } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  academies,
  memberships,
  subscriptions,
  plans,
  coaches,
  athletes,
  classCoachAssignments,
  classSessions,
  groups,
  guardianAthletes,
  guardians,
} from "@/db/schema";
import { getCurrentProfile } from "@/lib/authz";
import { OwnerProfile } from "@/components/profiles/OwnerProfile";
import { CoachProfile } from "@/components/profiles/CoachProfile";
import { AthleteProfile } from "@/components/profiles/AthleteProfile";
import { ParentProfile } from "@/components/profiles/ParentProfile";

interface ProfilePageProps {
  params: Promise<{ profileId?: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { profileId } = await params;
  const currentProfile = await getCurrentProfile(user.id);

  if (!currentProfile) {
    redirect("/dashboard");
  }

  // Si hay un profileId en la URL y el usuario es Super Admin, mostrar ese perfil
  // Si no, mostrar el perfil del usuario actual
  const targetProfileId = profileId && currentProfile.role === "super_admin" ? profileId : currentProfile.id;
  const isViewingAsSuperAdmin = profileId && currentProfile.role === "super_admin";

  const [targetProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, targetProfileId))
    .limit(1);

  if (!targetProfile) {
    notFound();
  }

  const role = targetProfile.role;

  // Owner o Admin: mostrar perfil de propietario
  if (role === "owner" || role === "admin" || role === "super_admin") {
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
      .orderBy(academies.name);

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

    const defaultActiveAcademyId = targetProfile.activeAcademyId ?? academiesWithSubscription[0]?.id ?? null;

    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <OwnerProfile
          user={user}
          profile={targetProfile}
          academies={academiesWithSubscription}
          defaultAcademyId={defaultActiveAcademyId}
          targetProfileId={isViewingAsSuperAdmin ? targetProfileId : undefined}
        />
      </div>
    );
  }

  // Coach: mostrar perfil de entrenador
  if (role === "coach") {
    // Buscar el coach asociado a este usuario a través de memberships
    const coachMemberships = await db
      .select({
        academyId: memberships.academyId,
      })
      .from(memberships)
      .where(and(eq(memberships.userId, targetProfile.userId), eq(memberships.role, "coach")))
      .limit(1);

    if (coachMemberships.length === 0) {
      return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
            <p className="text-sm text-amber-900">
              No se encontró un perfil de entrenador asociado a tu cuenta. Contacta con el administrador.
            </p>
          </div>
        </div>
      );
    }

    const academyId = coachMemberships[0].academyId;

    // Buscar el coach en esa academia
    const [coach] = await db
      .select({
        id: coaches.id,
        name: coaches.name,
        email: coaches.email,
        phone: coaches.phone,
        bio: coaches.bio,
        photoUrl: coaches.photoUrl,
        specialties: coaches.specialties,
        academyId: coaches.academyId,
        academyName: academies.name,
      })
      .from(coaches)
      .innerJoin(academies, eq(coaches.academyId, academies.id))
      .where(eq(coaches.academyId, academyId))
      .limit(1);

    if (!coach) {
      return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
            <p className="text-sm text-amber-900">
              No se encontró un perfil de entrenador asociado a tu cuenta. Contacta con el administrador.
            </p>
          </div>
        </div>
      );
    }

    // Contar clases asignadas
    const [classesResult] = await db
      .select({ count: count() })
      .from(classCoachAssignments)
      .where(eq(classCoachAssignments.coachId, coach.id));

    const classesCount = Number(classesResult?.count ?? 0);

    // Contar próximas sesiones (próximos 30 días)
    const [sessionsResult] = await db
      .select({ count: count() })
      .from(classSessions)
      .where(
        and(
          eq(classSessions.coachId, coach.id),
          eq(classSessions.status, "scheduled")
        )
      );

    const upcomingSessionsCount = Number(sessionsResult?.count ?? 0);

    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <CoachProfile
          user={user}
          profile={targetProfile}
          coachData={{
            ...coach,
            classesCount,
            upcomingSessionsCount,
          }}
          targetProfileId={isViewingAsSuperAdmin ? targetProfileId : undefined}
        />
      </div>
    );
  }

  // Athlete: mostrar perfil de atleta
  if (role === "athlete") {
    // Buscar el atleta asociado a este usuario a través de memberships
    const athleteMemberships = await db
      .select({
        academyId: memberships.academyId,
      })
      .from(memberships)
      .where(and(eq(memberships.userId, targetProfile.userId), eq(memberships.role, "athlete")))
      .limit(1);

    if (athleteMemberships.length === 0) {
      return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
            <p className="text-sm text-amber-900">
              No se encontró un perfil de atleta asociado a tu cuenta. Contacta con el administrador.
            </p>
          </div>
        </div>
      );
    }

    const academyId = athleteMemberships[0].academyId;

    // Buscar el atleta en esa academia
    const [athlete] = await db
      .select({
        id: athletes.id,
        name: athletes.name,
        level: athletes.level,
        status: athletes.status,
        dob: athletes.dob,
        academyId: athletes.academyId,
        academyName: academies.name,
        groupId: athletes.groupId,
        groupName: groups.name,
        groupColor: groups.color,
      })
      .from(athletes)
      .innerJoin(academies, eq(athletes.academyId, academies.id))
      .leftJoin(groups, eq(athletes.groupId, groups.id))
      .where(eq(athletes.academyId, academyId))
      .limit(1);

    if (!athlete) {
      return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
            <p className="text-sm text-amber-900">
              No se encontró un perfil de atleta asociado a tu cuenta. Contacta con el administrador.
            </p>
          </div>
        </div>
      );
    }

    // Calcular edad
    const age = athlete.dob
      ? (() => {
          const today = new Date();
          const birthDate = new Date(athlete.dob);
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          return age;
        })()
      : null;

    // Contar clases y sesiones (simplificado por ahora)
    const classesCount = 0; // TODO: Implementar conteo real
    const upcomingSessionsCount = 0; // TODO: Implementar conteo real

    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <AthleteProfile
          user={user}
          profile={targetProfile}
          athleteData={{
            ...athlete,
            classesCount,
            upcomingSessionsCount,
            age,
          }}
          targetProfileId={isViewingAsSuperAdmin ? targetProfileId : undefined}
        />
      </div>
    );
  }

  // Parent: mostrar perfil de tutor
  if (role === "parent") {
    // Buscar atletas asociados a este usuario como tutor
    const children = await db
      .select({
        id: athletes.id,
        name: athletes.name,
        level: athletes.level,
        status: athletes.status,
        academyId: athletes.academyId,
        academyName: academies.name,
        dob: athletes.dob,
      })
      .from(guardianAthletes)
      .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
      .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
      .innerJoin(academies, eq(athletes.academyId, academies.id))
      .where(eq(guardians.profileId, targetProfile.id));

    const childrenWithAge = children.map((child) => {
      const age = child.dob
        ? (() => {
            const today = new Date();
            const birthDate = new Date(child.dob);
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
            return age;
          })()
        : null;

      return {
        ...child,
        age,
      };
    });

    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <ParentProfile
          user={user}
          profile={targetProfile}
          targetProfileId={isViewingAsSuperAdmin ? targetProfileId : undefined}
          // eslint-disable-next-line react/no-children-prop
          children={childrenWithAge}
        />
      </div>
    );
  }

  // Rol no reconocido
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
        <p className="text-sm text-amber-900">
          Tipo de perfil no reconocido: {role}. Contacta con el administrador.
        </p>
      </div>
    </div>
  );
}

