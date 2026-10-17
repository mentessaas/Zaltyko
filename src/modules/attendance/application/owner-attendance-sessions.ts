import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { classTemplates, locations, sessions } from "@/db/zaltyko-schema";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const selectableSessionStatuses = ["scheduled", "completed"] as const;
const selectableDaysBefore = 30;
const selectableDaysAfter = 30;
const selectableSessionLimit = 100;

export async function getOwnerAttendanceSessionOptions(input: {
  userId: string;
  organizationId?: string;
  locationId?: string;
}) {
  const scope = await resolveOwnerScope(input);
  const locationId =
    input.locationId ??
    scope.selectedLocationId ??
    scope.locations[0]?.id ??
    null;
  if (!locationId) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "No hay una sede disponible para pasar lista",
      403
    );
  }

  const now = new Date();
  const earliestSelectableStart = new Date(now);
  earliestSelectableStart.setUTCDate(
    earliestSelectableStart.getUTCDate() - selectableDaysBefore
  );
  const latestSelectableStart = new Date(now);
  latestSelectableStart.setUTCDate(
    latestSelectableStart.getUTCDate() + selectableDaysAfter
  );

  const rows = await db
    .select({
      id: sessions.id,
      className: classTemplates.name,
      startsAt: sessions.startsAt,
      timezone: locations.timezone,
    })
    .from(sessions)
    .innerJoin(
      locations,
      and(
        eq(locations.organizationId, sessions.organizationId),
        eq(locations.id, sessions.locationId)
      )
    )
    .innerJoin(
      classTemplates,
      and(
        eq(classTemplates.organizationId, sessions.organizationId),
        eq(classTemplates.id, sessions.classTemplateId)
      )
    )
    .where(
      and(
        eq(sessions.organizationId, scope.organization.id),
        eq(sessions.locationId, locationId),
        inArray(sessions.status, [...selectableSessionStatuses]),
        gte(sessions.startsAt, earliestSelectableStart),
        lte(sessions.startsAt, latestSelectableStart)
      )
    )
    .orderBy(asc(sessions.startsAt))
    .limit(selectableSessionLimit);

  return {
    organization: scope.organization,
    locationId,
    sessions: rows.map((session) => ({
      ...session,
      startsAt: session.startsAt.toISOString(),
    })),
  };
}
