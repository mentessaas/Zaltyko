import { and, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { classSessions, classes, coaches } from "@/db/schema";
import type { ProfileRow } from "@/lib/authz";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import { verifyCoachClassScope } from "@/lib/permissions";

type ScopedProfile = Pick<ProfileRow, "id" | "userId" | "role" | "tenantId">;

export type AssessmentSessionContextResult =
  | {
      allowed: true;
      classId: string;
      sportConfigId: string | null;
    }
  | {
      allowed: false;
      reason:
        | "SESSION_NOT_FOUND"
        | "COACH_NOT_ASSIGNED_TO_CLASS"
        | "INSUFFICIENT_PERMISSIONS"
        | "ATHLETE_NOT_IN_CLASS";
    };

/**
 * Verifica que una evaluación contextual pertenezca a una sesión real del
 * tenant/academia, que la persona evaluada forme parte de la clase y que el
 * entrenador tenga scope sobre ella.
 */
export async function verifyAssessmentSessionContext({
  tenantId,
  academyId,
  sessionId,
  athleteId,
  profile,
}: {
  tenantId: string;
  academyId: string;
  sessionId: string;
  athleteId: string;
  profile: ScopedProfile;
}): Promise<AssessmentSessionContextResult> {
  const [session] = await db
    .select({
      classId: classSessions.classId,
      sessionSportConfigId: classSessions.sportConfigId,
      classSportConfigId: classes.sportConfigId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classSessions.id, sessionId),
        eq(classSessions.tenantId, tenantId),
        eq(classes.tenantId, tenantId),
        eq(classes.academyId, academyId)
      )
    )
    .limit(1);

  if (!session) {
    return { allowed: false, reason: "SESSION_NOT_FOUND" };
  }

  const scope = await verifyCoachClassScope({
    tenantId,
    academyId,
    classId: session.classId,
    profile,
  });
  if (!scope.allowed) {
    return {
      allowed: false,
      reason:
        scope.reason === "INSUFFICIENT_PERMISSIONS"
          ? "INSUFFICIENT_PERMISSIONS"
          : "COACH_NOT_ASSIGNED_TO_CLASS",
    };
  }

  const classAthletes = await getClassAthletes(session.classId, academyId);
  if (!classAthletes.some((athlete) => athlete.id === athleteId)) {
    return { allowed: false, reason: "ATHLETE_NOT_IN_CLASS" };
  }

  return {
    allowed: true,
    classId: session.classId,
    sportConfigId: session.sessionSportConfigId ?? session.classSportConfigId ?? null,
  };
}

/**
 * La identidad del evaluador se deriva de la sesión autenticada; nunca se
 * acepta un coachId enviado por el cliente.
 */
export async function resolveAssessingCoachId({
  tenantId,
  academyId,
  profile,
}: {
  tenantId: string;
  academyId: string;
  profile: ScopedProfile;
}): Promise<string | null> {
  const [coach] = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(
      and(
        eq(coaches.tenantId, tenantId),
        eq(coaches.academyId, academyId),
        or(eq(coaches.profileId, profile.id), eq(coaches.userId, profile.userId))
      )
    )
    .limit(1);

  return coach?.id ?? null;
}
