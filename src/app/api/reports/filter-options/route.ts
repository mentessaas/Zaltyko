export const dynamic = "force-dynamic";

import { and, asc, eq, isNull } from "drizzle-orm";

import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { db } from "@/db";
import { athletes, classes, coaches, groups } from "@/db/schema";

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const tenantId = context.tenantId;

  const [classRows, groupRows, coachRows, athleteRows] = await Promise.all([
    db
      .select({
        id: classes.id,
        name: classes.name,
        technicalFocus: classes.technicalFocus,
        apparatus: classes.apparatus,
      })
      .from(classes)
      .where(
        and(
          eq(classes.tenantId, tenantId),
          eq(classes.academyId, academyId),
          isNull(classes.deletedAt)
        )
      )
      .orderBy(asc(classes.name)),
    db
      .select({
        id: groups.id,
        name: groups.name,
        technicalFocus: groups.technicalFocus,
        apparatus: groups.apparatus,
        sessionBlocks: groups.sessionBlocks,
      })
      .from(groups)
      .where(
        and(
          eq(groups.tenantId, tenantId),
          eq(groups.academyId, academyId),
          isNull(groups.deletedAt)
        )
      )
      .orderBy(asc(groups.name)),
    db
      .select({ id: coaches.id, name: coaches.name })
      .from(coaches)
      .where(and(eq(coaches.tenantId, tenantId), eq(coaches.academyId, academyId)))
      .orderBy(asc(coaches.name)),
    db
      .select({ id: athletes.id, name: athletes.name })
      .from(athletes)
      .where(
        and(
          eq(athletes.tenantId, tenantId),
          eq(athletes.academyId, academyId),
          isNull(athletes.deletedAt)
        )
      )
      .orderBy(asc(athletes.name)),
  ]);

  return apiSuccess({
    classes: classRows,
    groups: groupRows,
    coaches: coachRows,
    athletes: athleteRows,
  });
});
