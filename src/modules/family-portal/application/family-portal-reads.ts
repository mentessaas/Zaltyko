import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceRecords,
  classTemplates,
  classTemplateWeekdays,
  enrollments,
  invoices,
  locations,
  sessions,
} from "@/db/zaltyko-schema";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import {
  familyCanViewAthlete,
  familyCanViewFees,
} from "@/modules/family-portal/application/family-portal-sql";
import {
  localIsoDate,
  requireVisibleFamilyAthlete,
  type FamilyPortalAthlete,
  type VisibleFamilyAthlete,
} from "@/modules/family-portal/domain/family-portal-access";

/**
 * Read-only family portal queries (P2 #16).
 *
 * Every exported read takes the session user id, never an access object, and
 * resolves the access itself. Each SQL statement then repeats the whole
 * canonical chain in an `exists` bound to that user id (family-portal-sql.ts),
 * on top of the organization, athlete and family ids taken from the resolved
 * access. Nothing here writes, charges or sends anything.
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

export interface FamilyAttendanceEntry {
  recordId: string;
  className: string;
  locationName: string;
  timezone: string;
  sessionStartsAt: string;
  status: "present" | "absent" | "excused" | "late";
}

export interface FamilyAthleteSchedule extends FamilyAthleteHeader {
  classes: FamilyScheduleClass[];
  upcomingSessions: FamilyUpcomingSession[];
}

export interface FamilyAthleteAttendance extends FamilyAthleteHeader {
  entries: FamilyAttendanceEntry[];
}

export interface FamilyAthleteOverview extends FamilyAthleteHeader {
  classes: FamilyScheduleClass[];
  upcomingSessions: FamilyUpcomingSession[];
  attendance: FamilyAttendanceEntry[];
}

export interface FamilyFee {
  invoiceId: string;
  reference: string;
  status: (typeof VISIBLE_FEE_STATUSES)[number];
  currency: string;
  totalCents: number;
  /** Allocated to non-void charges minus succeeded refunds of those allocations. */
  paidCents: number;
  /** Succeeded refunds of those allocations. */
  refundedCents: number;
  /** Ledger rule: total minus allocated (a refund does not reopen the fee). */
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

function header(visible: VisibleFamilyAthlete): FamilyAthleteHeader {
  return {
    organizationId: visible.academy.organizationId,
    organizationName: visible.academy.organizationName,
    athlete: visible.athlete,
  };
}

/** Resolves the session user's access and 404s on any foreign athlete. */
async function requireAthleteForUser(input: {
  userId: string;
  athleteId: string;
  now: Date;
}): Promise<VisibleFamilyAthlete> {
  const access = await resolveFamilyPortalAccess({
    userId: input.userId,
    now: input.now,
  });
  return requireVisibleFamilyAthlete(access, input.athleteId);
}

async function loadSchedule(
  visible: VisibleFamilyAthlete,
  userId: string,
  now: Date
): Promise<Pick<FamilyAthleteSchedule, "classes" | "upcomingSessions">> {
  const organizationId = visible.academy.organizationId;
  const athleteId = visible.athlete.athleteId;
  const today = localIsoDate(now, visible.academy.timezone);

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
        or(isNull(enrollments.endsOn), gte(enrollments.endsOn, today)),
        familyCanViewAthlete({
          userId,
          now,
          organizationRef: enrollments.organizationId,
          athleteRef: enrollments.athleteId,
        })
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
  if (classes.length === 0) return { classes, upcomingSessions: [] };

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
        inArray(classTemplateWeekdays.classTemplateId, classTemplateIds),
        sql`exists (
          select 1
          from zaltyko.enrollments fp_e
          where fp_e.organization_id = ${classTemplateWeekdays.organizationId}
            and fp_e.class_template_id = ${classTemplateWeekdays.classTemplateId}
            and fp_e.athlete_id = ${athleteId}::uuid
            and fp_e.status in ('trial', 'active', 'paused')
            and ${familyCanViewAthlete({
              userId,
              now,
              organizationRef: sql`fp_e.organization_id`,
              athleteRef: sql`fp_e.athlete_id`,
            })}
        )`
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
  if (attendingClassIds.length === 0) return { classes, upcomingSessions: [] };

  const until = new Date(now.getTime() + FAMILY_SCHEDULE_DAYS * 86_400_000);
  const sessionLocalDate = sql`(${sessions.startsAt} at time zone ${locations.timezone})::date`;
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
        lt(sessions.startsAt, until),
        sql`exists (
          select 1
          from zaltyko.enrollments fp_e
          where fp_e.organization_id = ${sessions.organizationId}
            and fp_e.class_template_id = ${sessions.classTemplateId}
            and fp_e.athlete_id = ${athleteId}::uuid
            and fp_e.status in ('trial', 'active')
            and fp_e.starts_on <= ${sessionLocalDate}
            and (fp_e.ends_on is null or fp_e.ends_on >= ${sessionLocalDate})
            and ${familyCanViewAthlete({
              userId,
              now,
              organizationRef: sql`fp_e.organization_id`,
              athleteRef: sql`fp_e.athlete_id`,
              sinceRef: sessions.startsAt,
            })}
        )`
      )
    )
    .orderBy(asc(sessions.startsAt), asc(sessions.id))
    .limit(MAX_UPCOMING_SESSIONS);

  const upcomingSessions: FamilyUpcomingSession[] = [];
  for (const row of sessionRows) {
    // Defense in depth, mirroring the SQL: the enrollment window uses the
    // site's calendar (sessionLocalDate) and the visibility start uses the
    // academy's (fp_o.default_timezone in familyCanViewAthlete).
    const sessionDate = localIsoDate(new Date(row.startsAt), row.timezone);
    const academySessionDate = localIsoDate(
      new Date(row.startsAt),
      visible.academy.timezone
    );
    if (academySessionDate < visible.athlete.visibleSince) continue;
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

  return { classes, upcomingSessions };
}

async function loadAttendance(
  visible: VisibleFamilyAthlete,
  userId: string,
  now: Date
): Promise<FamilyAttendanceEntry[]> {
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
        eq(attendanceRecords.organizationId, visible.academy.organizationId),
        eq(attendanceRecords.athleteId, visible.athlete.athleteId),
        familyCanViewAthlete({
          userId,
          now,
          organizationRef: attendanceRecords.organizationId,
          athleteRef: attendanceRecords.athleteId,
          sinceRef: sessions.startsAt,
        })
      )
    )
    .orderBy(desc(sessions.startsAt), desc(attendanceRecords.id))
    .limit(FAMILY_ATTENDANCE_LIMIT);

  return rows
    .filter(
      // Defense in depth: no history before the visible membership started.
      (row) =>
        localIsoDate(new Date(row.sessionStartsAt), visible.academy.timezone) >=
        visible.athlete.visibleSince
    )
    .map((row) => ({
      recordId: row.recordId,
      className: row.className,
      locationName: row.locationName,
      timezone: row.timezone,
      sessionStartsAt: iso(row.sessionStartsAt),
      status: row.status,
    }));
}

export async function getFamilyAthleteSchedule(input: {
  userId: string;
  athleteId: string;
  now?: Date;
}): Promise<FamilyAthleteSchedule> {
  const now = input.now ?? new Date();
  const visible = await requireAthleteForUser({ ...input, now });
  return { ...header(visible), ...(await loadSchedule(visible, input.userId, now)) };
}

export async function getFamilyAthleteAttendance(input: {
  userId: string;
  athleteId: string;
  now?: Date;
}): Promise<FamilyAthleteAttendance> {
  const now = input.now ?? new Date();
  const visible = await requireAthleteForUser({ ...input, now });
  return {
    ...header(visible),
    entries: await loadAttendance(visible, input.userId, now),
  };
}

/** Schedule and attendance of one athlete with a single access resolution. */
export async function getFamilyAthleteOverview(input: {
  userId: string;
  athleteId: string;
  now?: Date;
}): Promise<FamilyAthleteOverview> {
  const now = input.now ?? new Date();
  const visible = await requireAthleteForUser({ ...input, now });
  const [schedule, attendance] = await Promise.all([
    loadSchedule(visible, input.userId, now),
    loadAttendance(visible, input.userId, now),
  ]);
  return { ...header(visible), ...schedule, attendance };
}

/** Issued fees of the families this account pays for, per academy. */
export async function getFamilyFees(input: {
  userId: string;
  now?: Date;
}): Promise<FamilyAcademyFees[]> {
  const now = input.now ?? new Date();
  const access = await resolveFamilyPortalAccess({ userId: input.userId, now });
  const result: FamilyAcademyFees[] = [];

  // Correlated subqueries: one row per invoice, no join fan-out.
  const liveCharges = sql`
    fp_c.organization_id = ${invoices.organizationId}
    and fp_c.invoice_id = ${invoices.id}
    and fp_c.status <> 'void'`;
  const allocatedCents = sql<string>`coalesce((
    select sum(fp_pa.amount_cents)
    from zaltyko.payment_allocations fp_pa
    join zaltyko.charges fp_c
      on fp_c.organization_id = fp_pa.organization_id
      and fp_c.id = fp_pa.charge_id
    where ${liveCharges}
  ), 0)::text`;
  const refundedCents = sql<string>`coalesce((
    select sum(fp_r.amount_cents)
    from zaltyko.refunds fp_r
    join zaltyko.payment_allocations fp_pa
      on fp_pa.organization_id = fp_r.organization_id
      and fp_pa.id = fp_r.payment_allocation_id
    join zaltyko.charges fp_c
      on fp_c.organization_id = fp_pa.organization_id
      and fp_c.id = fp_pa.charge_id
    where ${liveCharges}
      and fp_r.status = 'succeeded'
  ), 0)::text`;
  const periodStart = sql<string | null>`(
    select min(fp_c.service_period_start)::text
    from zaltyko.charges fp_c
    where ${liveCharges}
  )`;
  const periodEnd = sql<string | null>`(
    select max(fp_c.service_period_end)::text
    from zaltyko.charges fp_c
    where ${liveCharges}
  )`;

  for (const academy of access.academies) {
    if (academy.feeFamilyIds.length === 0) continue;
    const rows = await db
      .select({
        invoiceId: invoices.id,
        reference: invoices.reference,
        status: invoices.status,
        currency: invoices.currency,
        totalCents: invoices.totalAmountCents,
        dueAt: invoices.dueAt,
        periodStart,
        periodEnd,
        allocatedCents,
        refundedCents,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, academy.organizationId),
          inArray(invoices.familyId, academy.feeFamilyIds),
          inArray(invoices.status, [...VISIBLE_FEE_STATUSES]),
          familyCanViewFees({
            userId: input.userId,
            now,
            organizationRef: invoices.organizationId,
            familyRef: invoices.familyId,
          })
        )
      )
      .orderBy(desc(invoices.dueAt), desc(invoices.reference))
      .limit(FAMILY_FEES_LIMIT);

    const fees: FamilyFee[] = rows.flatMap((row) => {
      const status = row.status;
      if (!isVisibleFeeStatus(status)) return [];
      const totalCents = cents(row.totalCents);
      const allocated = Math.min(cents(row.allocatedCents), totalCents);
      const refunded = Math.min(cents(row.refundedCents), allocated);
      return [
        {
          invoiceId: row.invoiceId,
          reference: row.reference,
          status,
          currency: row.currency,
          totalCents,
          paidCents: allocated - refunded,
          refundedCents: refunded,
          pendingCents: status === "paid" ? 0 : totalCents - allocated,
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
