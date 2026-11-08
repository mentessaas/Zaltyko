import { sql } from "drizzle-orm";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";
import { insertTemplateSessionsInRange } from "./session-service";

/** Keep at least this many days of generated sessions ahead of today. */
export const SESSION_HORIZON_REFILL_DAYS = 60;
/** Generate up to this many days ahead (same cap as class creation). */
export const SESSION_HORIZON_TARGET_DAYS = 120;
export const SESSION_HORIZON_BATCH_LIMIT = 500;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Next local-date range to generate for one template, or null when its
 * calendar already reaches the refill threshold or the template has ended.
 */
export function computeSessionHorizonRange(input: {
  today: string;
  lastGeneratedDate: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}): { startDate: string; endDate: string } | null {
  const refillUntil = addDays(input.today, SESSION_HORIZON_REFILL_DAYS);
  if (input.lastGeneratedDate && input.lastGeneratedDate >= refillUntil) return null;

  const candidates = [input.today, input.effectiveFrom];
  if (input.lastGeneratedDate) candidates.push(addDays(input.lastGeneratedDate, 1));
  const startDate = candidates.sort().at(-1)!;

  const target = addDays(input.today, SESSION_HORIZON_TARGET_DAYS - 1);
  const endDate = input.effectiveTo && input.effectiveTo < target ? input.effectiveTo : target;

  return startDate <= endDate ? { startDate, endDate } : null;
}

type HorizonCandidate = {
  organizationId: string;
  locationId: string;
  classTemplateId: string;
  today: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  lastGeneratedDate: string | null;
};

export type SessionHorizonResult = {
  checked: number;
  extended: number;
  skippedReadOnly: number;
  failed: number;
  truncated: boolean;
};

/**
 * Daily system job: extends the generated calendar of active class templates
 * whose sessions end within SESSION_HORIZON_REFILL_DAYS. Each template runs in
 * its own transaction so one academy cannot block the rest; read-only
 * academies are skipped by the same rule that blocks their operational writes.
 */
export async function extendSessionHorizons(input: {
  correlationId: string;
}): Promise<SessionHorizonResult> {
  const candidates = await db.execute(sql`
    select
      template.organization_id,
      template.location_id,
      template.id as class_template_id,
      to_char((now() at time zone location.timezone)::date, 'YYYY-MM-DD') as today,
      to_char(template.effective_from, 'YYYY-MM-DD') as effective_from,
      to_char(template.effective_to, 'YYYY-MM-DD') as effective_to,
      to_char(last_session.local_date, 'YYYY-MM-DD') as last_generated_date
    from zaltyko.class_templates template
    join zaltyko.locations location
      on location.organization_id = template.organization_id
     and location.id = template.location_id
    left join lateral (
      select max((session.starts_at at time zone location.timezone)::date) as local_date
      from zaltyko.sessions session
      where session.organization_id = template.organization_id
        and session.class_template_id = template.id
    ) last_session on true
    where template.status = 'active'
      and (template.effective_to is null
        or template.effective_to >= (now() at time zone location.timezone)::date)
      and exists (
        select 1 from zaltyko.class_template_weekdays weekday
        where weekday.organization_id = template.organization_id
          and weekday.class_template_id = template.id
      )
      and (last_session.local_date is null
        or last_session.local_date < (now() at time zone location.timezone)::date
          + ${SESSION_HORIZON_REFILL_DAYS}::int)
    order by last_session.local_date asc nulls first, template.id asc
    limit ${SESSION_HORIZON_BATCH_LIMIT + 1}
  `);

  const rows = (candidates.rows as Array<Record<string, string | null>>).map(
    (row): HorizonCandidate => ({
      organizationId: String(row.organization_id),
      locationId: String(row.location_id),
      classTemplateId: String(row.class_template_id),
      today: String(row.today),
      effectiveFrom: String(row.effective_from),
      effectiveTo: row.effective_to ?? null,
      lastGeneratedDate: row.last_generated_date ?? null,
    })
  );
  const batch = rows.slice(0, SESSION_HORIZON_BATCH_LIMIT);
  const result: SessionHorizonResult = {
    checked: batch.length,
    extended: 0,
    skippedReadOnly: 0,
    failed: 0,
    truncated: rows.length > SESSION_HORIZON_BATCH_LIMIT,
  };

  for (const candidate of batch) {
    const range = computeSessionHorizonRange(candidate);
    if (!range) continue;
    try {
      await db.transaction(async (tx) => {
        await assertOrganizationOperationalWritable(tx, candidate.organizationId);
        await insertTemplateSessionsInRange(tx, {
          organizationId: candidate.organizationId,
          classTemplateId: candidate.classTemplateId,
          ...range,
        });
        await appendAuditEntry(tx, {
          organizationId: candidate.organizationId,
          locationId: candidate.locationId,
          actorUserId: null,
          action: "sessions.horizon_extended",
          targetType: "class_template",
          targetId: candidate.classTemplateId,
          idempotencyKey: `session-horizon:${candidate.classTemplateId}:${range.startDate}:${range.endDate}`,
          after: range,
          metadata: { system: true, jobKey: "session-horizon", correlationId: input.correlationId },
        });
      });
      result.extended += 1;
    } catch (error) {
      if (error instanceof OperationalError && error.code === "PLAN_OVER_CAPACITY") {
        result.skippedReadOnly += 1;
        continue;
      }
      result.failed += 1;
      logger.error("Session horizon extension failed", {
        organizationId: candidate.organizationId,
        classTemplateId: candidate.classTemplateId,
        error,
      });
    }
  }

  return result;
}
