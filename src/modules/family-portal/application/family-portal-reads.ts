import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceRecords,
  charges,
  classTemplates,
  classTemplateWeekdays,
  enrollments,
  invoices,
  locations,
  paymentAllocations,
  sessions,
} from "@/db/zaltyko-schema";
import {
  localIsoDate,
  requireVisibleFamilyAthlete,
  type FamilyPortalAccess,
  type FamilyPortalAthlete,
} from "@/modules/family-portal/domain/family-portal-access";

/**
 * Read-only family portal queries (P2 #16). Every function receives the
 * access already resolved for the signed-in account and binds organization,
 * athlete and family ids from it, never from the URL. Nothing here writes,
 * charges or sends anything.
 */

export const FAMILY_SCHEDULE_DAYS = 14;
export const FAMILY_ATTENDANCE_LIMIT = 50;
export const FAMILY_FEES_LIMIT = 24;

/** Enrollment states a family sees in the schedule. */
const SCHEDULE_ENROLLMENT_STATUSES = ["trial", "active", "paused"] as const;
/** Fees a family sees: issued and settled, never drafts or voided ones. */
const VISIBLE_FEE_STATUSES = ["issued", "partially_paid", "paid"] as const;

const MAX_SCHEDULE_CLASSES = 30;
const MAX_UPCOMING_SESSIONS = 60;

export interface FamilyAthleteHeader {
  organizationId: string;
  organizationName: string;
  athlete: FamilyPortalAthlete;
}

export interface FamilyScheduleClass {
  enrollmentId: string;
  classTemplateId: string;
  className: string;
  locationName: string;
  timezone: string;
  status: (typeof SCHEDULE_ENROLLMENT_STATUSES)[number];
  startsOn: string;
  endsOn: string | null;
  weekdays: Array<{ isoWeekday: number; startsAtLocal: string; endsAtLocal: string }>;
}

export interface FamilyUpcomingSession {
  sessionId: string;
  className: string;
  locationName: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "completed" | "cancelled";
}

export interface FamilyAthleteSchedule extends FamilyAthleteHeader {
  classes: FamilyScheduleClass[];
  upcomingSessions: FamilyUpcomingSession[];
}

export interface FamilyAttendanceEntry {
  recordId: string;
  className: string;
  locationName: string;
  timezone: string;
  sessionStartsAt: string;
  status: "present" | "absent" | "excused" | "late";
}

export interface FamilyAthleteAttendance extends FamilyAthleteHeader {
  entries: FamilyAttendanceEntry[];
}

export interface FamilyFee {
  invoiceId: string;
  reference: string;
  status: (typeof VISIBLE_FEE_STATUSES)[number];
  currency: string;
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  dueAt: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface FamilyAcademyFees {
  organizationId: string;
  organizationName: string;
  timezone: string;
  fees: FamilyFee[];
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cents(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isScheduleStatus(
  status: string
): status is FamilyScheduleClass["status"] {
  return (SCHEDULE_ENROLLMENT_STATUSES as readonly string[]).includes(status);
}

function isVisibleFeeStatus(status: string): status is FamilyFee["status"] {
  return (VISIBLE_FEE_STATUSES as readonly string[]).includes(status);
}

function header(access: FamilyPortalAccess, athleteId: string): FamilyAthleteHeader {
  const { academy, athlete } = requireVisibleFamilyAthlete(access, athleteId);
  return {
    organizationId: academy.organizationId,
    organizationName: academy.organizationName,
    athlete,
  };
}

export async function getFamilyAthleteSchedule(input: {
  access: FamilyPortalAccess;
  athleteId: string;
  now?: Date;
}): Promise<FamilyAthleteSchedule> {
  // 404 before any domain read when the athlete is not this account's.
  const base = header(input.access, input.athleteId);
  const academy = input.access.academies.find(
    (item) => item.organizationId === base.organizationId
  );
  const now = input.now ?? new Date();
  const today = localIsoDate(now, academy?.timezone ?? "Europe/Madrid");
  const organizationId = base.organizationId;
  const athleteId = base.athlete.athleteId;

  const enrollmentRows = await db
    .select({
      enrollmentId: enrollments.id,
      classTemplateId: enrollments.classTemplateId,
      status: enrollments.status,
      startsOn: enrollments.startsOn,
      endsOn: enrollments.endsOn,
      className: classTemplates.name,
      locationName: locations.name,
      timezone: locations.timezone,
    })
    .from(enrollments)
    .innerJoin(
      classTemplates,
      and(
        eq(classTemplates.organizationId, enrollments.organizationId),
        eq(classTemplates.id, enrollments.classTemplateId)
      )
    )
    .innerJoin(
      locations,
      and(
        eq(locations.organizationId, enrollments.organizationId),
        eq(locations.id, enrollments.locationId)
      )
    )
    .where(
      and(
        eq(enrollments.organizationId, organizationId),
        eq(enrollments.athleteId, athleteId),
        inArray(enrollments.status, [...SCHEDULE_ENROLLMENT_STATUSES]),
        or(isNull(enrollments.endsOn), gte(enrollments.endsOn, today))
      )
    )
    .orderBy(asc(classTemplates.name), asc(enrollments.id))
    .limit(MAX_SCHEDULE_CLASSES);

  const classes: FamilyScheduleClass[] = enrollmentRows.flatMap((row) =>
    isScheduleStatus(row.status)
      ? [
          {
            enrollmentId: row.enrollmentId,
            classTemplateId: row.classTemplateId,
            className: row.className,
            locationName: row.locationName,
            timezone: row.timezone,
            status: row.status,
            startsOn: row.startsOn,
            endsOn: row.endsOn,
            weekdays: [],
          },
        ]
      : []
  );
  if (classes.length === 0) {
    return { ...base, classes, upcomingSessions: [] };
  }

  const classTemplateIds = [...new Set(classes.map((item) => item.classTemplateId))];
  const weekdayRows = await db
    .select({
      classTemplateId: classTemplateWeekdays.classTemplateId,
      isoWeekday: classTemplateWeekdays.isoWeekday,
      startsAtLocal: classTemplateWeekdays.startsAtLocal,
      endsAtLocal: classTemplateWeekdays.endsAtLocal,
    })
    .from(classTemplateWeekdays)
    .where(
      and(
        eq(classTemplateWeekdays.organizationId, organizationId),
        inArray(classTemplateWeekdays.classTemplateId, classTemplateIds)
      )
    )
    .orderBy(
      asc(classTemplateWeekdays.isoWeekday),
      asc(classTemplateWeekdays.startsAtLocal)
    )
    .limit(MAX_SCHEDULE_CLASSES * 7);
  for (const item of classes) {
    item.weekdays = weekdayRows
      .filter((row) => row.classTemplateId === item.classTemplateId)
      .map(({ isoWeekday, startsAtLocal, endsAtLocal }) => ({
        isoWeekday,
        startsAtLocal,
        endsAtLocal,
      }));
  }

  // A paused enrollment keeps its class visible but has no sessions to attend.
  const attendingClassIds = [
    ...new Set(
      classes
        .filter((item) => item.status !== "paused")
        .map((item) => item.classTemplateId)
    ),
  ];
  if (attendingClassIds.length === 0) {
    return { ...base, classes, upcomingSessions: [] };
  }
  const until = new Date(now.getTime() + FAMILY_SCHEDULE_DAYS * 86_400_000);
  const sessionRows = await db
    .select({
      sessionId: sessions.id,
      classTemplateId: sessions.classTemplateId,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      status: sessions.status,
      locationName: locations.name,
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
    .where(
      and(
        eq(sessions.organizationId, organizationId),
        inArray(sessions.classTemplateId, attendingClassIds),
        gte(sessions.endsAt, now),
        lt(sessions.startsAt, until)
      )
    )
    .orderBy(asc(sessions.startsAt), asc(sessions.id))
    .limit(MAX_UPCOMING_SESSIONS);

  const upcomingSessions: FamilyUpcomingSession[] = [];
  for (const row of sessionRows) {
    const sessionDate = localIsoDate(new Date(row.startsAt), row.timezone);
    // Only sessions inside the athlete's own enrollment window.
    const enrollment = classes.find(
      (item) =>
        item.classTemplateId === row.classTemplateId &&
        item.status !== "paused" &&
        item.startsOn <= sessionDate &&
        (item.endsOn === null || item.endsOn >= sessionDate)
    );
    if (!enrollment) continue;
    upcomingSessions.push({
      sessionId: row.sessionId,
      className: enrollment.className,
      locationName: row.locationName,
      timezone: row.timezone,
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      status: row.status,
    });
  }

  return { ...base, classes, upcomingSessions };
}

export async function getFamilyAthleteAttendance(input: {
  access: FamilyPortalAccess;
  athleteId: string;
}): Promise<FamilyAthleteAttendance> {
  const base = header(input.access, input.athleteId);
  const rows = await db
    .select({
      recordId: attendanceRecords.id,
      status: attendanceRecords.status,
      sessionStartsAt: sessions.startsAt,
      className: classTemplates.name,
      locationName: locations.name,
      timezone: locations.timezone,
    })
    .from(attendanceRecords)
    .innerJoin(
      sessions,
      and(
        eq(sessions.organizationId, attendanceRecords.organizationId),
        eq(sessions.id, attendanceRecords.sessionId)
      )
    )
    .innerJoin(
      classTemplates,
      and(
        eq(classTemplates.organizationId, sessions.organizationId),
        eq(classTemplates.id, sessions.classTemplateId)
      )
    )
    .innerJoin(
      locations,
      and(
        eq(locations.organizationId, attendanceRecords.organizationId),
        eq(locations.id, attendanceRecords.locationId)
      )
    )
    .where(
      and(
        eq(attendanceRecords.organizationId, base.organizationId),
        eq(attendanceRecords.athleteId, base.athlete.athleteId)
      )
    )
    .orderBy(desc(sessions.startsAt), desc(attendanceRecords.id))
    .limit(FAMILY_ATTENDANCE_LIMIT);

  return {
    ...base,
    entries: rows.map((row) => ({
      recordId: row.recordId,
      className: row.className,
      locationName: row.locationName,
      timezone: row.timezone,
      sessionStartsAt: iso(row.sessionStartsAt),
      status: row.status,
    })),
  };
}

/** Issued fees of the account's own families, per academy. Read-only. */
export async function getFamilyFees(input: {
  access: FamilyPortalAccess;
}): Promise<FamilyAcademyFees[]> {
  const result: FamilyAcademyFees[] = [];
  for (const academy of input.access.academies) {
    if (academy.familyIds.length === 0) continue;
    const rows = await db
      .select({
        invoiceId: invoices.id,
        reference: invoices.reference,
        status: invoices.status,
        currency: invoices.currency,
        totalCents: invoices.totalAmountCents,
        dueAt: invoices.dueAt,
        periodStart: sql<string | null>`min(${charges.servicePeriodStart})::text`,
        periodEnd: sql<string | null>`max(${charges.servicePeriodEnd})::text`,
        paidCents: sql<string>`coalesce(sum(${paymentAllocations.amountCents}), 0)::text`,
      })
      .from(invoices)
      .leftJoin(
        charges,
        and(
          eq(charges.organizationId, invoices.organizationId),
          eq(charges.invoiceId, invoices.id),
          ne(charges.status, "void")
        )
      )
      .leftJoin(
        paymentAllocations,
        and(
          eq(paymentAllocations.organizationId, charges.organizationId),
          eq(paymentAllocations.chargeId, charges.id)
        )
      )
      .where(
        and(
          eq(invoices.organizationId, academy.organizationId),
          inArray(invoices.familyId, academy.familyIds),
          inArray(invoices.status, [...VISIBLE_FEE_STATUSES])
        )
      )
      .groupBy(invoices.id)
      .orderBy(desc(invoices.dueAt), desc(invoices.reference))
      .limit(FAMILY_FEES_LIMIT);

    const fees: FamilyFee[] = rows.flatMap((row) => {
      const status = row.status;
      if (!isVisibleFeeStatus(status)) return [];
      const totalCents = cents(row.totalCents);
      const paidCents = Math.min(cents(row.paidCents), totalCents);
      return [
        {
          invoiceId: row.invoiceId,
          reference: row.reference,
          status,
          currency: row.currency,
          totalCents,
          paidCents: status === "paid" ? totalCents : paidCents,
          pendingCents: status === "paid" ? 0 : totalCents - paidCents,
          dueAt: iso(row.dueAt),
          periodStart: row.periodStart ?? null,
          periodEnd: row.periodEnd ?? null,
        },
      ];
    });
    result.push({
      organizationId: academy.organizationId,
      organizationName: academy.organizationName,
      timezone: academy.timezone,
      fees,
    });
  }
  return result;
}
