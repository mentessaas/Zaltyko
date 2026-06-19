import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  classes,
  coaches,
  coachSportConfigs,
  federativeLicenses,
  groups,
  messageHistory,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

const countBy = <T extends { sportConfigId: string | null; count: number }>(rows: T[]) =>
  new Map(rows.map((row) => [row.sportConfigId, Number(row.count)]));

export const GET = withTenant(async (_request, context) => {
  try {
    const academyId = (context.params as { academyId?: string })?.academyId;
    if (!academyId) {
      return apiError("ACADEMY_ID_REQUIRED", "academyId es requerido", 400);
    }

    const [academy] = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
        ownerId: academies.ownerId,
        country: academies.country,
      })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    }

    const isSuperAdmin = context.profile.role === "super_admin";
    const isOwner = academy.ownerId === context.profile.id;
    const isSameTenant = academy.tenantId === context.tenantId;

    if (!isSuperAdmin && !isOwner && !isSameTenant) {
      return apiError("FORBIDDEN", "No tienes permisos para ver esta academia", 403);
    }

    const sportConfigs = await getAcademySportConfigOptions(academyId);

    const [
      athleteRows,
      groupRows,
      classRows,
      coachRows,
      licenseRows,
      messageRows,
      [athletesWithoutSport],
      [groupsWithoutSport],
      [classesWithoutSport],
      [coachesWithoutScope],
    ] = await Promise.all([
      db
        .select({ sportConfigId: athletes.primarySportConfigId, count: sql<number>`count(*)` })
        .from(athletes)
        .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, academy.tenantId), isNull(athletes.deletedAt)))
        .groupBy(athletes.primarySportConfigId),
      db
        .select({ sportConfigId: groups.sportConfigId, count: sql<number>`count(*)` })
        .from(groups)
        .where(and(eq(groups.academyId, academyId), eq(groups.tenantId, academy.tenantId), isNull(groups.deletedAt)))
        .groupBy(groups.sportConfigId),
      db
        .select({ sportConfigId: classes.sportConfigId, count: sql<number>`count(*)` })
        .from(classes)
        .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, academy.tenantId), isNull(classes.deletedAt)))
        .groupBy(classes.sportConfigId),
      db
        .select({ sportConfigId: coachSportConfigs.academySportConfigId, count: sql<number>`count(distinct ${coachSportConfigs.coachId})` })
        .from(coachSportConfigs)
        .where(eq(coachSportConfigs.tenantId, academy.tenantId))
        .groupBy(coachSportConfigs.academySportConfigId),
      db
        .select({ sportConfigId: federativeLicenses.sportConfigId, count: sql<number>`count(*)` })
        .from(federativeLicenses)
        .where(eq(federativeLicenses.tenantId, academy.tenantId))
        .groupBy(federativeLicenses.sportConfigId),
      db
        .select({ sportConfigId: messageHistory.sportConfigId, count: sql<number>`count(*)` })
        .from(messageHistory)
        .where(eq(messageHistory.tenantId, academy.tenantId))
        .groupBy(messageHistory.sportConfigId),
      db
        .select({ count: sql<number>`count(*)` })
        .from(athletes)
        .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, academy.tenantId), isNull(athletes.deletedAt), isNull(athletes.primarySportConfigId))),
      db
        .select({ count: sql<number>`count(*)` })
        .from(groups)
        .where(and(eq(groups.academyId, academyId), eq(groups.tenantId, academy.tenantId), isNull(groups.deletedAt), isNull(groups.sportConfigId))),
      db
        .select({ count: sql<number>`count(*)` })
        .from(classes)
        .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, academy.tenantId), isNull(classes.deletedAt), isNull(classes.sportConfigId))),
      db
        .select({ count: sql<number>`count(distinct ${coaches.id})` })
        .from(coaches)
        .where(and(
          eq(coaches.academyId, academyId),
          eq(coaches.tenantId, academy.tenantId),
          sql`not exists (
            select 1
            from coach_sport_configs csc
            where csc.coach_id = ${coaches.id}
              and csc.tenant_id = ${academy.tenantId}
          )`
        )),
    ]);

    const athletesByConfig = countBy(athleteRows);
    const groupsByConfig = countBy(groupRows);
    const classesByConfig = countBy(classRows);
    const coachesByConfig = countBy(coachRows);
    const licensesByConfig = countBy(licenseRows);
    const messagesByConfig = countBy(messageRows);

    return apiSuccess({
      items: sportConfigs.map((config) => ({
        id: config.id,
        branchName: config.branchName,
        disciplineName: config.disciplineName,
        countryName: academy.country ?? "País configurado",
        defaultDisciplineVariant: config.defaultDisciplineVariant,
        terminology: config.terminology,
        apparatusCount: config.apparatus.length,
        programCount: config.programs.length,
        athleteCount: athletesByConfig.get(config.id) ?? 0,
        groupCount: groupsByConfig.get(config.id) ?? 0,
        classCount: classesByConfig.get(config.id) ?? 0,
        coachCount: coachesByConfig.get(config.id) ?? 0,
        licenseCount: licensesByConfig.get(config.id) ?? 0,
        messageCount: messagesByConfig.get(config.id) ?? 0,
      })),
      gaps: {
        athletesWithoutSportConfig: Number(athletesWithoutSport?.count ?? 0),
        groupsWithoutSportConfig: Number(groupsWithoutSport?.count ?? 0),
        classesWithoutSportConfig: Number(classesWithoutSport?.count ?? 0),
        coachesWithoutSportScope: Number(coachesWithoutScope?.count ?? 0),
      },
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies/[academyId]/sport-dashboard", method: "GET" });
  }
});
