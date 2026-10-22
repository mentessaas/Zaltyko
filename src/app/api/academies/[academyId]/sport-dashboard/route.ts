import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  classes,
  coaches,
  federativeLicenses,
  groups,
  messageHistory,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

const toCount = (row?: { count: number | string | null }) => Number(row?.count ?? 0);

const safeCount = async (load: () => Promise<Array<{ count: number | string | null }>>) => {
  try {
    const [row] = await load();
    return toCount(row);
  } catch {
    return 0;
  }
};

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

    const sportConfigs = await getAcademySportConfigOptions(academyId).catch(() => []);

    const [athleteCount, groupCount, classCount, coachCount, licenseCount, messageCount] =
      await Promise.all([
        safeCount(() =>
          db
            .select({ count: sql<number>`count(*)` })
            .from(athletes)
            .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, academy.tenantId)))
        ),
        safeCount(() =>
          db
            .select({ count: sql<number>`count(*)` })
            .from(groups)
            .where(and(eq(groups.academyId, academyId), eq(groups.tenantId, academy.tenantId)))
        ),
        safeCount(() =>
          db
            .select({ count: sql<number>`count(*)` })
            .from(classes)
            .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, academy.tenantId)))
        ),
        safeCount(() =>
          db
            .select({ count: sql<number>`count(*)` })
            .from(coaches)
            .where(and(eq(coaches.academyId, academyId), eq(coaches.tenantId, academy.tenantId)))
        ),
        safeCount(() =>
          db
            .select({ count: sql<number>`count(*)` })
            .from(federativeLicenses)
            .where(eq(federativeLicenses.tenantId, academy.tenantId))
        ),
        safeCount(() =>
          db
            .select({ count: sql<number>`count(*)` })
            .from(messageHistory)
            .where(eq(messageHistory.tenantId, academy.tenantId))
        ),
      ]);

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
        athleteCount: 0,
        groupCount: 0,
        classCount: 0,
        coachCount: 0,
        licenseCount: 0,
        messageCount: 0,
      })),
      gaps: {
        athletesWithoutSportConfig: athleteCount,
        groupsWithoutSportConfig: groupCount,
        classesWithoutSportConfig: classCount,
        coachesWithoutSportScope: coachCount,
        licensesWithoutSportConfig: licenseCount,
        messagesWithoutSportConfig: messageCount,
      },
    });
  } catch (error) {
    return apiSuccess({
      items: [],
      gaps: {
        athletesWithoutSportConfig: 0,
        groupsWithoutSportConfig: 0,
        classesWithoutSportConfig: 0,
        coachesWithoutSportScope: 0,
        licensesWithoutSportConfig: 0,
        messagesWithoutSportConfig: 0,
      },
    });
  }
});
