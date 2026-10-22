/**
 * Agregador del bundle de atención para Web y Mobile.
 *
 * Por convención del contrato ZAL-619 §3.2:
 *  - "Sin datos" (consulta OK, sin coincidencias) => count 0 con sourceAvailable: true
 *  - "Fuente no disponible" (error de DB) => count omitido con sourceAvailable: false
 *  - "No aplica al rol" (coach no ve cobros) => la propiedad se omite del payload
 *
 * Cada query está scopada por `academyId` y `tenantId` (este último lo
 * resuelve `withTenant` antes de llamar a la función).
 */

import { and, asc, count, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";

import { db } from "@/db";
import {
  academies,
  announcements,
  attendanceRecords,
  athleteImportBatches,
  charges,
  classSessions,
  classes,
  scheduledNotifications,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { getTimezoneForCountry } from "@/lib/date-utils";

import {
  deriveCoachPriorityAction,
  deriveOwnerPriorityAction,
} from "./attention-priority";
import type {
  AttendanceAttention,
  ChargesAttention,
  CoachAttentionBundle,
  ImportActiveAttention,
  MessagesAttention,
  OverdueChargeItem,
  OwnerAttentionBundle,
  ProgressAttention,
  TodaySessionAttention,
} from "./attention-types";

const ATTENTION_TODAY_LIMIT = 10;
const CHARGES_DETAIL_LIMIT = 5;

function toIsoDateOnly(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nowIsoDate(academyTimezone?: string | null): string {
  if (!academyTimezone) {
    return toIsoDateOnly(new Date());
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: academyTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date());
  } catch {
    return toIsoDateOnly(new Date());
  }
}

/**
 * Resuelve la zona horaria efectiva de una academia.
 *
 * `academies.timezone` es la fuente explícita cuando existe. Las academias
 * antiguas y algunos registros creados antes del ajuste de ubicación pueden
 * no tenerla; en ese caso usamos el código/nombre de país para conservar una
 * fecha local razonable en el dashboard operativo.
 */
export function resolveAcademyTimezone(input: {
  timezone?: string | null;
  countryCode?: string | null;
  country?: string | null;
}): string {
  const fallback = getTimezoneForCountry(input.countryCode ?? input.country);
  const candidate = input.timezone?.trim();
  if (!candidate) return fallback;

  // La configuración de academias es editable y puede contener valores
  // históricos o mal escritos. Validamos contra la base IANA del runtime para
  // que una zona inválida no convierta el bundle entero en "fuente caída".
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return fallback;
  }
}

async function loadTodaySessions(
  academyId: string,
  date: string,
  academyTimezone: string
): Promise<{ ok: true; sessions: TodaySessionAttention[] } | { ok: false; error: unknown }> {
  try {
    const rows = await db
      .select({
        sessionId: classSessions.id,
        classId: classSessions.classId,
        className: classes.name,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(classes.academyId, academyId),
          // `session_date` es un tipo DATE, no un timestamp. Compararlo con
          // límites ISO UTC puede desplazar o eliminar sesiones del día local.
          eq(classSessions.sessionDate, date),
          // ZAL-fix: class_sessions no tiene columna `cancelled`; el estado
          // real es `status` (scheduled/cancelled/...). Filtramos por estado.
          ne(classSessions.status, "cancelled")
        )
      )
      .orderBy(asc(classSessions.startTime), asc(classSessions.sessionDate))
      .limit(ATTENTION_TODAY_LIMIT);

    if (rows.length === 0) {
      return { ok: true, sessions: [] };
    }

    const sessionIds = rows.map((r) => r.sessionId);
    const attendanceCounts = await db
      .select({
        sessionId: attendanceRecords.sessionId,
        recorded: count(),
      })
      .from(attendanceRecords)
      .where(
        and(
          inArray(attendanceRecords.sessionId, sessionIds),
          // Cualquier registro distinto de "pending" cuenta como registrado.
          sql`${attendanceRecords.status} <> 'pending'`
        )
      )
      .groupBy(attendanceRecords.sessionId);
    const recordedMap = new Map<string, number>(
      attendanceCounts.map((row) => [row.sessionId, Number(row.recorded)])
    );

    return {
      ok: true,
      sessions: rows.map((r) => {
        const startsAt = combineDateAndTime(r.sessionDate, r.startTime, academyTimezone) ?? r.sessionDate;
        return {
          sessionId: r.sessionId,
          classId: r.classId,
          className: r.className ?? null,
          startsAt,
          groupName: null,
          attendanceRecorded: (recordedMap.get(r.sessionId) ?? 0) > 0,
          href: `/app/${academyId}/attendance/today/${r.sessionId}`,
        };
      }),
    };
  } catch (error) {
    logger.error("attention:loadTodaySessions failed", { academyId, date, error });
    return { ok: false, error };
  }
}

function combineDateAndTime(
  dateInput: string | Date | null,
  time: string | null,
  academyTimezone: string
): string | null {
  if (!dateInput) return null;
  const dateKey = typeof dateInput === "string" ? dateInput.slice(0, 10) : toIsoDateOnly(dateInput);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const match = time ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time) : null;
  const hours = match ? Number(match[1]) : 0;
  const minutes = match ? Number(match[2]) : 0;
  const seconds = match ? Number(match[3] ?? 0) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  // DATE + TIME son valores locales de la academia, no instantes del
  // navegador. Convertimos desde la zona IANA de la academia a UTC una sola
  // vez para que la prioridad y el formateo posterior compartan la misma
  // referencia, también en América y durante cambios DST.
  return fromZonedTime(
    `${dateKey}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    academyTimezone
  ).toISOString();
}

async function loadAttendancePending(
  academyId: string,
  date: string
): Promise<AttendanceAttention> {
  const href = `/app/${academyId}/attendance?status=pending`;
  const source = `attendance_records.status='pending' AND class_sessions.sessionDate='${date}'`;
  try {
    const result = await db
      .select({ value: count() })
      .from(attendanceRecords)
      .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(classes.academyId, academyId),
          eq(attendanceRecords.status, "pending"),
          eq(classSessions.sessionDate, date)
        )
      );
    const value = Number(result[0]?.value ?? 0);
    return {
      count: value,
      sourceAvailable: true,
      href: value > 0 ? href : null,
      source,
    };
  } catch (error) {
    logger.error("attention:loadAttendancePending failed", { academyId, error });
    return { count: 0, sourceAvailable: false, href: null, source };
  }
}

async function loadMessagesPending(
  academyId: string,
  tenantId: string
): Promise<MessagesAttention> {
  const href = `/app/${academyId}/comms?status=failed`;
  const source = "scheduled_notifications.status IN ('failed')";
  try {
    // failed = estado de envío fallido (ZAL-619 §5: "failed" expone reintento).
    // unsent = notificaciones programadas que aún no se han enviado y su
    // `scheduledFor` está en el pasado (no es exactamente "no enviadas" sino
    // "atrasadas"); se mantienen separadas para distinguir un fallo real de
    // un retraso.
    const failedResult = await db
      .select({ value: count() })
      .from(scheduledNotifications)
      .where(
        and(
          eq(scheduledNotifications.academyId, academyId),
          eq(scheduledNotifications.tenantId, tenantId),
          eq(scheduledNotifications.status, "failed")
        )
      );
    const unsentResult = await db
      .select({ value: count() })
      .from(scheduledNotifications)
      .where(
        and(
          eq(scheduledNotifications.academyId, academyId),
          eq(scheduledNotifications.tenantId, tenantId),
          eq(scheduledNotifications.status, "pending"),
          lte(scheduledNotifications.scheduledFor, new Date())
        )
      );
    // Unread = announcements publicados con readCount < sentCount.
    const unreadResult = await db
      .select({ value: count() })
      .from(announcements)
      .where(
        and(
          eq(announcements.academyId, academyId),
          eq(announcements.status, "published"),
          sql`(${announcements.sentCount})::int > (${announcements.readCount})::int`
        )
      );

    const failed = Number(failedResult[0]?.value ?? 0);
    const unsent = Number(unsentResult[0]?.value ?? 0);
    const unread = Number(unreadResult[0]?.value ?? 0);
    return {
      failed,
      unsent,
      unread,
      sourceAvailable: true,
      href: failed > 0 ? href : null,
      source,
    };
  } catch (error) {
    logger.error("attention:loadMessagesPending failed", { academyId, error });
    return { failed: 0, unsent: 0, unread: 0, sourceAvailable: false, href: null, source };
  }
}

async function loadChargesOverdue(
  academyId: string,
  tenantId: string
): Promise<ChargesAttention> {
  const href = `/app/${academyId}/billing?status=overdue`;
  const source =
    "charges.status IN ('overdue','failed') AND charges.tenantId=ctx.tenantId";
  try {
    const summary = await db
      .select({ status: charges.status, value: count() })
      .from(charges)
      .where(
        and(
          eq(charges.academyId, academyId),
          eq(charges.tenantId, tenantId),
          inArray(charges.status, ["overdue", "failed"])
        )
      )
      .groupBy(charges.status);

    const totals = { overdue: 0, failed: 0 };
    for (const row of summary) {
      if (row.status === "overdue") totals.overdue = Number(row.value ?? 0);
      if (row.status === "failed") totals.failed = Number(row.value ?? 0);
    }

    const items = await db
      .select({
        id: charges.id,
        label: charges.label,
        amountCents: charges.amountCents,
        currency: charges.currency,
        dueDate: charges.dueDate,
        status: charges.status,
      })
      .from(charges)
      .where(
        and(
          eq(charges.academyId, academyId),
          eq(charges.tenantId, tenantId),
          inArray(charges.status, ["overdue", "failed"])
        )
      )
      .orderBy(asc(charges.dueDate), desc(charges.updatedAt))
      .limit(CHARGES_DETAIL_LIMIT);

    const detail: OverdueChargeItem[] = items.map((row) => ({
      id: row.id,
      displayName: row.label,
      amountCents: row.amountCents,
      currency: row.currency,
      dueDate: row.dueDate ?? null,
      status: row.status === "failed" ? "failed" : "overdue",
    }));

    return {
      overdue: totals.overdue,
      failed: totals.failed,
      items: detail,
      sourceAvailable: true,
      href: totals.overdue + totals.failed > 0 ? href : null,
      source,
    };
  } catch (error) {
    logger.error("attention:loadChargesOverdue failed", { academyId, error });
    return {
      overdue: 0,
      failed: 0,
      items: [],
      sourceAvailable: false,
      href: null,
      source,
    };
  }
}

async function loadProgressDrafts(academyId: string): Promise<ProgressAttention> {
  const href = `/app/${academyId}/evaluations?status=draft`;
  // ZAL-fix: athlete_assessments no tiene columna `status` (ver schema
  // src/db/schema/athlete-assessments.ts). La tabla no modela estados
  // draft/published todavía, así que la fuente no está disponible y el
  // bloque se omite en el dashboard hasta que exista (gap consciente,
  // mismo patrón que loadImportActive/ZAL-620).
  const source = "athlete_assessments.status='draft' (columna inexistente — pendiente de schema)";
  void href;
  try {
    return { count: 0, sourceAvailable: false, href: null, source };
  } catch (error) {
    logger.error("attention:loadProgressDrafts failed", { academyId, error });
    return { count: 0, sourceAvailable: false, href: null, source };
  }
}

async function loadImportActive(
  academyId: string,
  tenantId: string,
): Promise<ImportActiveAttention | null> {
  // La tabla real de importación ya registra los lotes que siguen procesando
  // o terminaron con error. No mostramos lotes completados/archivados para no
  // convertir el dashboard en un historial, pero sí damos una ruta de vuelta
  // al módulo donde el owner puede revisar el resultado o reintentar.
  try {
    const [batch] = await db
      .select({
        id: athleteImportBatches.id,
        status: athleteImportBatches.status,
        totalRows: athleteImportBatches.totalRows,
        createdCount: athleteImportBatches.createdCount,
        skippedCount: athleteImportBatches.skippedCount,
        createdAt: athleteImportBatches.createdAt,
      })
      .from(athleteImportBatches)
      .where(
        and(
          eq(athleteImportBatches.academyId, academyId),
          eq(athleteImportBatches.tenantId, tenantId),
          inArray(athleteImportBatches.status, ["processing", "failed"]),
        ),
      )
      .orderBy(desc(athleteImportBatches.createdAt))
      .limit(1);

    if (!batch) return null;

    return {
      jobId: batch.id,
      state: batch.status,
      filename: null,
      totalRows: batch.totalRows,
      createdCount: batch.createdCount,
      skippedCount: batch.skippedCount,
      createdAt: batch.createdAt ? new Date(batch.createdAt).toISOString() : null,
      source: `athlete_import_batches.status='${batch.status}'`,
      href: `/app/${academyId}/athletes?importBatchId=${batch.id}`,
    };
  } catch (error) {
    // La migración puede no existir en una instalación antigua; el resto del
    // bundle sigue siendo útil y no inventamos un estado de importación.
    logger.warn("attention:loadImportActive unavailable", { academyId, error });
    return null;
  }
}

export async function getOwnerAttentionBundle({
  academyId,
  tenantId,
  date,
}: {
  academyId: string;
  tenantId: string;
  date?: string;
}): Promise<OwnerAttentionBundle> {
  // Resolver la fecha en la timezone de la academia si está disponible.
  const [academy] = await db
    .select({
      id: academies.id,
      country: academies.country,
      countryCode: academies.countryCode,
      timezone: academies.timezone,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  const academyTimezone = resolveAcademyTimezone({
    timezone: academy?.timezone,
    countryCode: academy?.countryCode,
    country: academy?.country,
  });
  const resolvedDate = date ?? nowIsoDate(academyTimezone);
  void isNull; // referenciar import usado abajo

  const [todayResult, attendancePending, messagesPending, chargesOverdue, progressDrafts, importActive] =
    await Promise.all([
      loadTodaySessions(academyId, resolvedDate, academyTimezone),
      loadAttendancePending(academyId, resolvedDate),
      loadMessagesPending(academyId, tenantId),
      loadChargesOverdue(academyId, tenantId),
      loadProgressDrafts(academyId),
      loadImportActive(academyId, tenantId),
    ]);

  const today = todayResult.ok
    ? todayResult.sessions
    : ([] as TodaySessionAttention[]);

  const bundle: OwnerAttentionBundle = {
    academyId,
    date: resolvedDate,
    academyTimezone,
    today,
    attendancePending,
    messagesPending,
    chargesOverdue,
    progressDrafts,
    importActive,
    priorityAction: null,
  };
  bundle.priorityAction = deriveOwnerPriorityAction(bundle);
  return bundle;
}

export async function getCoachAttentionBundle({
  academyId,
  tenantId,
  date,
}: {
  academyId: string;
  tenantId: string;
  date?: string;
}): Promise<CoachAttentionBundle> {
  const [academy] = await db
    .select({
      id: academies.id,
      country: academies.country,
      countryCode: academies.countryCode,
      timezone: academies.timezone,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  const academyTimezone = resolveAcademyTimezone({
    timezone: academy?.timezone,
    countryCode: academy?.countryCode,
    country: academy?.country,
  });
  const resolvedDate = date ?? nowIsoDate(academyTimezone);

  const [todayResult, attendancePending, messagesPending] = await Promise.all([
    loadTodaySessions(academyId, resolvedDate, academyTimezone),
    loadAttendancePending(academyId, resolvedDate),
    loadMessagesPending(academyId, tenantId),
  ]);

  const today = todayResult.ok
    ? todayResult.sessions
    : ([] as TodaySessionAttention[]);

  const bundle: CoachAttentionBundle = {
    academyId,
    date: resolvedDate,
    academyTimezone,
    today,
    attendancePending,
    messagesPending,
    priorityAction: null,
  };
  bundle.priorityAction = deriveCoachPriorityAction(bundle);
  return bundle;
}
