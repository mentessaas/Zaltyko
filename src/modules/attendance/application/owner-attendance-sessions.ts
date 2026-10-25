import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { classTemplates, locations, sessions } from "@/db/zaltyko-schema";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const selectableSessionStatuses = ["scheduled", "completed"] as const;
const selectableDaysBefore = 30;
const selectableDaysAfter = 30;
export const ownerAttendanceSessionPageSize = 50;

const cursorTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const cursorSchema = z
  .object({
    version: z.literal(1),
    userId: z.guid(),
    organizationId: z.guid(),
    locationId: z.guid(),
    startsAt: z.string().regex(cursorTimestampPattern),
    id: z.guid(),
  })
  .strict()
  .refine((cursor) => {
    const parsed = new Date(cursor.startsAt);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 19) === cursor.startsAt.slice(0, 19)
    );
  });

type AttendanceSessionCursor = z.infer<typeof cursorSchema>;

function invalidCursor(): OperationalError {
  return new OperationalError("INVALID_RELATION", "Cursor de sesiones inválido", 400);
}

function decodeCursor(value: string | undefined): AttendanceSessionCursor | null {
  if (!value) return null;
  if (value.length > 500 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidCursor();
  }

  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    );
    if (!parsed.success) throw invalidCursor();
    return parsed.data;
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw invalidCursor();
  }
}

function encodeCursor(cursor: AttendanceSessionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function getSelectableWindow(now: Date) {
  const earliestSelectableStart = new Date(now);
  earliestSelectableStart.setUTCDate(
    earliestSelectableStart.getUTCDate() - selectableDaysBefore
  );
  const latestSelectableStart = new Date(now);
  latestSelectableStart.setUTCDate(
    latestSelectableStart.getUTCDate() + selectableDaysAfter
  );
  return { earliestSelectableStart, latestSelectableStart };
}

function toSessionOption(
  session: {
    id: string;
    className: string;
    startsAt: Date;
    timezone: string;
    status: string;
  },
  window: ReturnType<typeof getSelectableWindow>
) {
  return {
    id: session.id,
    className: session.className,
    timezone: session.timezone,
    retryOnly: !(
      (session.status === "scheduled" || session.status === "completed") &&
      session.startsAt >= window.earliestSelectableStart &&
      session.startsAt <= window.latestSelectableStart
    ),
    startsAt: session.startsAt.toISOString(),
  };
}

export async function getOwnerAttendanceSessionOptions(input: {
  userId: string;
  organizationId?: string;
  locationId?: string;
  sessionId?: string;
  cursor?: string;
}) {
  const cursor = decodeCursor(input.cursor);
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
  if (
    cursor &&
    (cursor.userId !== input.userId ||
      cursor.organizationId !== scope.organization.id ||
      cursor.locationId !== locationId)
  ) {
    throw invalidCursor();
  }

  // The time window is recalculated on every request. The cursor carries only
  // the exact keyset position and scope binding, never client-controlled filters.
  const window = getSelectableWindow(new Date());
  const normalSelection = and(
    inArray(sessions.status, [...selectableSessionStatuses]),
    gte(sessions.startsAt, window.earliestSelectableStart),
    lte(sessions.startsAt, window.latestSelectableStart),
    cursor
      ? sql`(${sessions.startsAt}, ${sessions.id}) > (${cursor.startsAt}::timestamptz, ${cursor.id}::uuid)`
      : undefined
  );

  const [selectedRows, requestedRows] = await Promise.all([
    db
      .select({
        id: sessions.id,
        className: classTemplates.name,
        startsAt: sessions.startsAt,
        cursorStartsAt: sql<string>`to_char(${sessions.startsAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
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
      .orderBy(asc(sessions.startsAt), asc(sessions.id))
      .limit(ownerAttendanceSessionPageSize + 1),
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

  const hasMore = selectedRows.length > ownerAttendanceSessionPageSize;
  const pageRows = selectedRows.slice(0, ownerAttendanceSessionPageSize);
  const lastRow = pageRows.at(-1);
  const nextCursor = hasMore && lastRow
    ? encodeCursor({
        version: 1,
        userId: input.userId,
        organizationId: scope.organization.id,
        locationId,
        startsAt: lastRow.cursorStartsAt,
        id: lastRow.id,
      })
    : null;

  const pageSessionIds = new Set(pageRows.map((session) => session.id));
  const selectedSessionRow = requestedRows.find(
    (session) => !pageSessionIds.has(session.id)
  );

  return {
    organization: scope.organization,
    locationId,
    sessions: pageRows.map((session) => toSessionOption(session, window)),
    nextCursor,
    selectedSession: selectedSessionRow
      ? toSessionOption(selectedSessionRow, window)
      : null,
  };
}
