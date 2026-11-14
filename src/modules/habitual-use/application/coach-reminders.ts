import { sql } from "drizzle-orm";

import { db } from "@/db";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

import {
  buildCoachReminderMessage,
  planCoachReminders,
  type CoachReminderChannel,
  type CoachReminderDelivery,
  type CoachReminderDeliveryResult,
  type CoachSessionCandidate,
} from "../domain/coach-reminders";
import { isCoachRemindersEnabled } from "../domain/flags";
import { safeTimezone } from "../domain/local-time";
import { buildHabitualUsePreferencesUrl, isHabitualUseEnabledFor } from "./preferences";

/** Tope por disparo: un cron cada 5 minutos no necesita más y protege al proveedor. */
export const COACH_REMINDERS_MAX_PER_RUN = 300;

export const COACH_REMINDER_TEMPLATES = {
  soon: "coach-session-soon",
  missing_attendance: "coach-session-missing-attendance",
} as const;

interface CandidateRow {
  organization_id: string;
  organization_name: string;
  location_id: string;
  location_name: string;
  timezone: string | null;
  session_id: string;
  class_name: string;
  status: "scheduled" | "completed" | "cancelled";
  starts_at: string | Date;
  ends_at: string | Date;
  expected_athletes: number | string;
  has_attendance: boolean;
  member_id: string;
  user_id: string;
  email: string;
}

/**
 * Sesiones próximas a empezar o recién terminadas con su equipo asignado
 * (`session_staff`). Solo personas con membresía activa y sede en su alcance:
 * el enlace del aviso abre Pasar lista y lo mismo que ya pueden abrir.
 * «Esperadas» sigue la regla de Pasar lista (inscripción activa o de prueba).
 */
export async function loadCoachSessionCandidates(now: Date): Promise<CoachSessionCandidate[]> {
  const at = now.toISOString();
  const result = await db.execute(sql`
    select
      o.id as organization_id,
      o.name as organization_name,
      l.id as location_id,
      l.name as location_name,
      l.timezone,
      s.id as session_id,
      ct.name as class_name,
      s.status::text as status,
      s.starts_at,
      s.ends_at,
      (
        select count(*)
        from zaltyko.enrollments e
        join zaltyko.athletes athlete
          on athlete.organization_id = e.organization_id
         and athlete.id = e.athlete_id
         and athlete.is_active
        where e.organization_id = ct.organization_id
          and e.location_id = ct.location_id
          and e.class_template_id = ct.id
          and e.status in ('active', 'trial')
          and e.starts_on <= (s.starts_at at time zone l.timezone)::date
          and (e.ends_on is null or e.ends_on > (s.starts_at at time zone l.timezone)::date)
      )::int as expected_athletes,
      exists (
        select 1 from zaltyko.attendance_records a
        where a.organization_id = s.organization_id and a.session_id = s.id
      ) as has_attendance,
      m.id as member_id,
      m.user_id,
      u.email
    from zaltyko.sessions s
    join zaltyko.organizations o
      on o.id = s.organization_id and o.status in ('trial', 'active')
    join zaltyko.locations l
      on l.organization_id = s.organization_id and l.id = s.location_id and l.is_active
    join zaltyko.class_templates ct
      on ct.organization_id = s.organization_id and ct.id = s.class_template_id
    join zaltyko.session_staff ss
      on ss.organization_id = s.organization_id and ss.session_id = s.id
    join zaltyko.staff_profiles sp
      on sp.organization_id = ss.organization_id and sp.id = ss.staff_profile_id
     and sp.is_active and sp.member_id is not null
    join zaltyko.organization_members m
      on m.organization_id = sp.organization_id and m.id = sp.member_id and m.status = 'active'
    join auth.users u on u.id = m.user_id
    where s.status <> 'cancelled'
      and u.email is not null
      and (
        (s.starts_at > ${at}::timestamptz and s.starts_at <= ${at}::timestamptz + interval '20 minutes')
        or (s.ends_at <= ${at}::timestamptz - interval '10 minutes'
            and s.ends_at > ${at}::timestamptz - interval '24 hours')
      )
      and (
        m.location_scope_mode = 'all'
        or exists (
          select 1 from zaltyko.member_location_scopes mls
          where mls.organization_id = m.organization_id
            and mls.member_id = m.id
            and mls.location_id = s.location_id
        )
      )
    order by s.starts_at, m.id
    limit ${COACH_REMINDERS_MAX_PER_RUN * 2}
  `);

  return (result.rows as unknown as CandidateRow[]).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    locationId: row.location_id,
    locationName: row.location_name,
    timezone: safeTimezone(row.timezone),
    sessionId: row.session_id,
    className: row.class_name,
    status: row.status,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    expectedAthletes: Number(row.expected_athletes ?? 0),
    hasAttendance: row.has_attendance === true,
    recipientMemberId: row.member_id,
    recipientUserId: row.user_id,
    recipientEmail: row.email,
  }));
}

/** Canal por correo: el único activo. Usa el emisor común (preferencias, baja y deduplicación). */
export function createEmailCoachReminderChannel(): CoachReminderChannel {
  return {
    name: "email",
    async deliver(delivery: CoachReminderDelivery): Promise<CoachReminderDeliveryResult> {
      const accepted = await sendEmailWithLogging({
        purpose: "transactional",
        to: delivery.recipient.email,
        subject: delivery.message.subject,
        html: delivery.message.html,
        text: delivery.message.text,
        template: COACH_REMINDER_TEMPLATES[delivery.message.kind],
        // El emisor común enlaza academyId con la tabla antigua `academies`; la
        // organización canónica va como tenant, que no tiene clave foránea.
        tenantId: delivery.organizationId,
        metadata: {
          kind: "coach_session_reminder",
          reminder: delivery.message.kind,
          sessionId: delivery.sessionId,
        },
        dedupeKey: delivery.dedupeKey,
      });
      return accepted ? "sent" : "skipped";
    },
  };
}

export interface CoachRemindersSummary {
  enabled: boolean;
  candidates: number;
  planned: number;
  sent: number;
  /** Ya enviados antes (deduplicación) o rechazados por baja global. */
  notSent: number;
  optedOut: number;
  withoutPreferencesLink: number;
  failed: number;
}

const EMPTY: CoachRemindersSummary = {
  enabled: false,
  candidates: 0,
  planned: 0,
  sent: 0,
  notSent: 0,
  optedOut: 0,
  withoutPreferencesLink: 0,
  failed: 0,
};

/**
 * Un disparo del cron. Con la bandera apagada no toca la base de datos. Los
 * canales y la carga de candidatos se pueden sustituir (pruebas, push futuro).
 */
export async function runCoachSessionReminders(
  options: {
    now?: Date;
    channels?: readonly CoachReminderChannel[];
    load?: (now: Date) => Promise<CoachSessionCandidate[]>;
    appUrl?: string;
  } = {}
): Promise<CoachRemindersSummary> {
  if (!isCoachRemindersEnabled()) return { ...EMPTY };
  const now = options.now ?? new Date();
  const channels = options.channels ?? [createEmailCoachReminderChannel()];
  const appUrl = options.appUrl ?? getAppUrl();
  const candidates = await (options.load ?? loadCoachSessionCandidates)(now);
  const planned = planCoachReminders(candidates, now).slice(0, COACH_REMINDERS_MAX_PER_RUN);
  const summary: CoachRemindersSummary = { ...EMPTY, enabled: true, candidates: candidates.length, planned: planned.length };

  for (const reminder of planned) {
    const { candidate } = reminder;
    try {
      if (!(await isHabitualUseEnabledFor(candidate.recipientEmail, "coach_session_reminders"))) {
        summary.optedOut += 1;
        continue;
      }
      const preferencesUrl = buildHabitualUsePreferencesUrl(appUrl, candidate.recipientEmail, "coach_session_reminders");
      // Sin forma de desactivarlo no se envía.
      if (!preferencesUrl) {
        summary.withoutPreferencesLink += 1;
        continue;
      }
      const message = buildCoachReminderMessage({ kind: reminder.kind, candidate, appUrl, preferencesUrl });
      const delivery: CoachReminderDelivery = {
        message,
        dedupeKey: reminder.dedupeKey,
        organizationId: candidate.organizationId,
        sessionId: candidate.sessionId,
        recipient: {
          memberId: candidate.recipientMemberId,
          userId: candidate.recipientUserId,
          email: candidate.recipientEmail,
        },
      };
      let delivered = false;
      for (const channel of channels) {
        const result = await channel.deliver(delivery);
        if (result === "sent") delivered = true;
        if (result === "failed") summary.failed += 1;
      }
      if (delivered) summary.sent += 1;
      else summary.notSent += 1;
    } catch (error) {
      summary.failed += 1;
      logger.error("habitual_use.coach_reminder_failed", error, {
        organizationId: candidate.organizationId,
        sessionId: candidate.sessionId,
      });
    }
  }
  return summary;
}
