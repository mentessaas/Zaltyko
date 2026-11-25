import { sql } from "drizzle-orm";

import { db } from "@/db";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

/**
 * Elvis's decision on 2026-11-24: delete contact requests that do not become
 * customers after six months.
 */
export const CONTACT_LEAD_RETENTION_MONTHS = 6;

const RETENTION_BATCH_SIZE = 100;
const RETENTION_MAX_BATCHES = 50;

export type ContactLeadRetentionResult = {
  enabled: boolean;
  erasedLeads: number;
  erasedInteractions: number;
  erasedLeadTrials: number;
  erasedTrialOutcomes: number;
  erasedInterviews: number;
  erasedGrowthEvents: number;
  erasedEmailLogs: number;
  unlinkedAcademyTrials: number;
  batches: number;
};

type BatchResult = Omit<ContactLeadRetentionResult, "enabled" | "batches"> & {
  selected: number;
};

const EMPTY_RESULT: Omit<ContactLeadRetentionResult, "enabled"> = {
  erasedLeads: 0,
  erasedInteractions: 0,
  erasedLeadTrials: 0,
  erasedTrialOutcomes: 0,
  erasedInterviews: 0,
  erasedGrowthEvents: 0,
  erasedEmailLogs: 0,
  unlinkedAcademyTrials: 0,
  batches: 0,
};

function count(rows: unknown[]): number {
  return rows.length;
}

function lastActivity(alias = "l") {
  return sql`greatest(
    ${sql.raw(`${alias}.created_at`)},
    coalesce((
      select max(i.created_at)
      from public.lead_interactions i
      where i.lead_id = ${sql.raw(`${alias}.id`)}
    ), ${sql.raw(`${alias}.created_at`)}),
    coalesce((
      select max(greatest(t.created_at, t.updated_at, coalesce(o.latest_outcome_at, t.created_at)))
      from public.lead_trials t
      left join lateral (
        select max(outcome.created_at) as latest_outcome_at
        from public.lead_trial_outcomes outcome
        where outcome.lead_trial_id = t.id
      ) o on true
      where t.lead_id = ${sql.raw(`${alias}.id`)}
    ), ${sql.raw(`${alias}.created_at`)}),
    coalesce((
      select max(greatest(interview.created_at, interview.updated_at, coalesce(interview.completed_at, interview.created_at)))
      from public.commercial_interviews interview
      where interview.lead_id = ${sql.raw(`${alias}.id`)}
    ), ${sql.raw(`${alias}.created_at`)}),
    coalesce((
      select max(greatest(trial.created_at, trial.updated_at))
      from public.academy_trials trial
      where trial.lead_id = ${sql.raw(`${alias}.id`)}
    ), ${sql.raw(`${alias}.created_at`)})
  )`;
}

function unconvertedLeadCondition(ids?: string[]) {
  const idFilter = ids
    ? sql`${sql.raw("l.id")} = any(${sqlUuidArray(ids)}) and`
    : sql``;
  return sql`
    ${idFilter}
    l.tenant_id is null
    and l.academy_id is null
    and not exists (
      select 1
      from public.academy_trials converted_trial
      where converted_trial.lead_id = l.id
        and converted_trial.converted_at is not null
    )
    and not exists (
      select 1
      from public.lead_trials lead_trial
      join public.lead_trial_outcomes outcome on outcome.lead_trial_id = lead_trial.id
      where lead_trial.lead_id = l.id
        and lower(btrim(outcome.outcome)) = 'converted'
    )
    and ${lastActivity()} < now() - make_interval(months => ${CONTACT_LEAD_RETENTION_MONTHS}::int)
  `;
}

async function hasRequiredStorage(): Promise<boolean> {
  const result = await db.execute(sql`
    select
      to_regclass('public.leads') is not null as leads,
      to_regclass('public.lead_interactions') is not null as lead_interactions,
      to_regclass('public.lead_trials') is not null as lead_trials,
      to_regclass('public.lead_trial_outcomes') is not null as lead_trial_outcomes,
      to_regclass('public.academy_trials') is not null as academy_trials,
      to_regclass('public.commercial_interviews') is not null as commercial_interviews,
      to_regclass('public.growth_events') is not null as growth_events,
      to_regclass('public.email_logs') is not null as email_logs
  `);
  const tables = result.rows[0] as Record<string, boolean> | undefined;
  return !!tables && Object.values(tables).every(Boolean);
}

async function eraseBatch(): Promise<BatchResult> {
  return db.transaction(
    async (tx) => {
      const candidates = await tx.execute(sql`
        select l.id
        from public.leads l
        where ${unconvertedLeadCondition()}
        order by ${lastActivity()}, l.id
        limit ${RETENTION_BATCH_SIZE}
        for update of l skip locked
      `);
      const candidateIds = (candidates.rows as Array<{ id: string }>).map((row) => row.id);
      const emptyBatch: BatchResult = { ...EMPTY_RESULT, selected: candidateIds.length };
      if (candidateIds.length === 0) return emptyBatch;

      const idArray = sqlUuidArray(candidateIds);

      // Lock linked activity before the final eligibility check. New FK-backed
      // activity waits on the locked lead; updates to existing activity cannot
      // make an otherwise recent or converted lead disappear mid-batch.
      await tx.execute(sql`select id from public.lead_interactions where lead_id = any(${idArray}) for update`);
      await tx.execute(sql`select id from public.lead_trials where lead_id = any(${idArray}) for update`);
      await tx.execute(sql`
        select outcome.id
        from public.lead_trial_outcomes outcome
        join public.lead_trials lead_trial on lead_trial.id = outcome.lead_trial_id
        where lead_trial.lead_id = any(${idArray})
        for update of outcome
      `);
      await tx.execute(sql`select id from public.academy_trials where lead_id = any(${idArray}) for update`);
      await tx.execute(sql`select id from public.commercial_interviews where lead_id = any(${idArray}) for update`);

      const eligible = await tx.execute(sql`
        select l.id
        from public.leads l
        where ${unconvertedLeadCondition(candidateIds)}
      `);
      const eligibleIds = (eligible.rows as Array<{ id: string }>).map((row) => row.id);
      if (eligibleIds.length === 0) return emptyBatch;

      const eligibleArray = sqlUuidArray(eligibleIds);
      const growthEvents = await tx.execute(sql`
        delete from public.growth_events event
        using public.lead_interactions interaction
        where interaction.lead_id = any(${eligibleArray})
          and event.idempotency_key in (
            'contact:' || interaction.submission_id::text,
            'directory:demo:' || interaction.submission_id::text
          )
        returning event.id
      `);
      const emailLogs = await tx.execute(sql`
        delete from public.email_logs email_log
        using public.lead_interactions interaction
        where interaction.lead_id = any(${eligibleArray})
          and email_log.idempotency_key =
            'email:public-contact-lead:' || interaction.submission_id::text
        returning email_log.id
      `);
      const trialOutcomes = await tx.execute(sql`
        delete from public.lead_trial_outcomes outcome
        using public.lead_trials lead_trial
        where outcome.lead_trial_id = lead_trial.id
          and lead_trial.lead_id = any(${eligibleArray})
        returning outcome.id
      `);
      const interviews = await tx.execute(sql`
        delete from public.commercial_interviews
        where lead_id = any(${eligibleArray})
        returning id
      `);
      const leadTrials = await tx.execute(sql`
        delete from public.lead_trials
        where lead_id = any(${eligibleArray})
        returning id
      `);
      const academyTrials = await tx.execute(sql`
        update public.academy_trials
        set lead_id = null
        where lead_id = any(${eligibleArray})
          and converted_at is null
        returning id
      `);
      const interactions = await tx.execute(sql`
        delete from public.lead_interactions
        where lead_id = any(${eligibleArray})
        returning id
      `);
      const leads = await tx.execute(sql`
        delete from public.leads
        where id = any(${eligibleArray})
          and tenant_id is null
          and academy_id is null
        returning id
      `);

      return {
        selected: candidateIds.length,
        erasedLeads: count(leads.rows),
        erasedInteractions: count(interactions.rows),
        erasedLeadTrials: count(leadTrials.rows),
        erasedTrialOutcomes: count(trialOutcomes.rows),
        erasedInterviews: count(interviews.rows),
        erasedGrowthEvents: count(growthEvents.rows),
        erasedEmailLogs: count(emailLogs.rows),
        unlinkedAcademyTrials: count(academyTrials.rows),
        batches: 0,
      };
    },
    { isolationLevel: "serializable" }
  );
}

export async function eraseExpiredContactLeads(): Promise<ContactLeadRetentionResult> {
  if (!(await hasRequiredStorage())) {
    return { enabled: false, ...EMPTY_RESULT };
  }

  const result: ContactLeadRetentionResult = { enabled: true, ...EMPTY_RESULT };
  // Count every attempt, including batches whose candidates all became
  // ineligible on the recheck, so a run always ends.
  for (let attempt = 0; attempt < RETENTION_MAX_BATCHES; attempt += 1) {
    const batch = await eraseBatch();
    if (batch.erasedLeads === 0) {
      if (batch.selected < RETENTION_BATCH_SIZE) break;
      continue;
    }
    result.erasedLeads += batch.erasedLeads;
    result.erasedInteractions += batch.erasedInteractions;
    result.erasedLeadTrials += batch.erasedLeadTrials;
    result.erasedTrialOutcomes += batch.erasedTrialOutcomes;
    result.erasedInterviews += batch.erasedInterviews;
    result.erasedGrowthEvents += batch.erasedGrowthEvents;
    result.erasedEmailLogs += batch.erasedEmailLogs;
    result.unlinkedAcademyTrials += batch.unlinkedAcademyTrials;
    result.batches += 1;
    if (batch.selected < RETENTION_BATCH_SIZE) break;
  }
  return result;
}
