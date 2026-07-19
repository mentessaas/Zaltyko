import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { academySportConfigs, coachSportConfigs, coaches } from "@/db/schema";

export async function getCoachSportConfigIds(coachId: string, tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ sportConfigId: coachSportConfigs.academySportConfigId })
    .from(coachSportConfigs)
    .where(and(eq(coachSportConfigs.coachId, coachId), eq(coachSportConfigs.tenantId, tenantId)));

  return rows.map((row) => row.sportConfigId);
}

export async function validateSportConfigIdsForAcademy(params: {
  academyId: string;
  tenantId: string;
  sportConfigIds: string[];
}): Promise<string[] | null> {
  const uniqueIds = Array.from(new Set(params.sportConfigIds));
  if (uniqueIds.length === 0) return [];

  const rows = await db
    .select({ id: academySportConfigs.id })
    .from(academySportConfigs)
    .where(
      and(
        eq(academySportConfigs.academyId, params.academyId),
        eq(academySportConfigs.tenantId, params.tenantId),
        eq(academySportConfigs.isActive, true),
        inArray(academySportConfigs.id, uniqueIds)
      )
    );

  return rows.length === uniqueIds.length ? uniqueIds : null;
}

export async function replaceCoachSportConfigScope(params: {
  coachId: string;
  academyId: string;
  tenantId: string;
  sportConfigIds: string[];
}) {
  const validIds = await validateSportConfigIdsForAcademy(params);
  if (!validIds) {
    return { ok: false as const, reason: "SPORT_CONFIG_NOT_FOUND" as const };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(coachSportConfigs)
      .where(and(eq(coachSportConfigs.coachId, params.coachId), eq(coachSportConfigs.tenantId, params.tenantId)));

    if (validIds.length > 0) {
      await tx.insert(coachSportConfigs).values(
        validIds.map((sportConfigId) => ({
          tenantId: params.tenantId,
          coachId: params.coachId,
          academySportConfigId: sportConfigId,
        }))
      );
    }
  });

  return { ok: true as const, sportConfigIds: validIds };
}

export async function assertCoachesCanHandleSportConfig(params: {
  coachIds: string[];
  academyId: string;
  tenantId: string;
  sportConfigId?: string | null;
}) {
  const uniqueCoachIds = Array.from(new Set(params.coachIds.filter(Boolean)));
  if (uniqueCoachIds.length === 0 || !params.sportConfigId) {
    return { ok: true as const };
  }

  const coachRows = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(
      and(eq(coaches.academyId, params.academyId), eq(coaches.tenantId, params.tenantId), inArray(coaches.id, uniqueCoachIds))
    );

  if (coachRows.length !== uniqueCoachIds.length) {
    return { ok: false as const, reason: "COACH_NOT_FOUND" as const };
  }

  const scopeRows = await db
    .select({
      coachId: coachSportConfigs.coachId,
      sportConfigId: coachSportConfigs.academySportConfigId,
    })
    .from(coachSportConfigs)
    .where(and(eq(coachSportConfigs.tenantId, params.tenantId), inArray(coachSportConfigs.coachId, uniqueCoachIds)));

  const scopeByCoach = new Map<string, Set<string>>();
  scopeRows.forEach((row) => {
    const set = scopeByCoach.get(row.coachId) ?? new Set<string>();
    set.add(row.sportConfigId);
    scopeByCoach.set(row.coachId, set);
  });

  for (const coachId of uniqueCoachIds) {
    const scope = scopeByCoach.get(coachId);
    if (scope && scope.size > 0 && !scope.has(params.sportConfigId)) {
      return { ok: false as const, reason: "COACH_SPORT_CONFIG_SCOPE_MISMATCH" as const, coachId };
    }
  }

  return { ok: true as const };
}

