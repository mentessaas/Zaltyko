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
  sessionId?: string;
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

  const normalSelection = and(
    inArray(sessions.status, [...selectableSessionStatuses]),
    gte(sessions.startsAt, earliestSelectableStart),
    lte(sessions.startsAt, latestSelectableStart)
  );
  const [normalRows, requestedRows] = await Promise.all([
    db
      .select({
        id: sessions.id,
        className: classTemplates.name,
        startsAt: sessions.startsAt,
        timezone: locations.timezone,
        status: sessions.status,
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
          normalSelection
        )
      )
      .orderBy(asc(sessions.startsAt))
      .limit(selectableSessionLimit),
    input.sessionId
      ? db
          .select({
            id: sessions.id,
            className: classTemplates.name,
            startsAt: sessions.startsAt,
            timezone: locations.timezone,
            status: sessions.status,
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
              eq(sessions.id, input.sessionId)
            )
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  const normalSessionIds = new Set(normalRows.map((session) => session.id));
  const rows = [
    ...normalRows,
    ...requestedRows.filter((session) => !normalSessionIds.has(session.id)),
  ].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

  return {
    organization: scope.organization,
    locationId,
    sessions: rows.map((session) => ({
      id: session.id,
      className: session.className,
      timezone: session.timezone,
      retryOnly: !(
        (session.status === "scheduled" || session.status === "completed") &&
        session.startsAt >= earliestSelectableStart &&
        session.startsAt <= latestSelectableStart
      ),
      startsAt: session.startsAt.toISOString(),
    })),
  };
}
