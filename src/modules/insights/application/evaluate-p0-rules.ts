import { and, asc, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { insightRuleVersions } from "@/db/zaltyko-schema";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import type { EvaluationActor } from "@/modules/shared/application/actor";
import {
  assertOperationalAccess,
  assertSystemOperationalScope,
} from "@/modules/shared/infrastructure/operational-authorization";
import {
  evaluateCapacityWithoutPrice,
  evaluateCriticalDataMissing,
  evaluateExcessDemand,
  evaluateIncompleteAttendance,
  evaluateLowTrialConversion,
  evaluateOverdueCollections,
  evaluateSessionWithoutCoach,
  evaluateTrialWithoutFollowup,
  evaluateUnderutilizedClass,
  type InsightCandidate,
} from "@/modules/insights/domain/insight-rules";
import { runInsightEvaluation } from "./insight-service";

const activeRuleKeys = [
  "underutilized_class",
  "excess_demand",
  "overdue_collections",
  "incomplete_attendance",
  "trial_without_followup",
  "low_trial_conversion",
  "capacity_without_price",
  "session_without_coach",
  "critical_data_missing",
] as const;
const activeRulePageSize = 100;

type RuleKey = (typeof activeRuleKeys)[number];
type DbRow = Record<string, unknown>;

function rows<T extends DbRow>(result: { rows: unknown }): T[] {
  return result.rows as T[];
}

function numeric(value: unknown): number {
  return Number(value ?? 0);
}

function date(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function threshold(
  config: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Evalúa las nueve reglas P0 activas usando exclusivamente hechos de la sede indicada.
 * Las lecturas quedan limitadas por organization_id/location_id y por el watermark;
 * la persistencia vuelve a comprobar permisos y usa el ciclo idempotente existente.
 */
export async function evaluateP0Insights(input: {
  organizationId: string;
  locationId: string;
  actor: EvaluationActor;
  evaluatedAt: string;
  sourceWatermark: string;
  idempotencyPrefix: string;
}) {
  const watermark = new Date(input.sourceWatermark);
  const evaluatedAt = new Date(input.evaluatedAt);
  if (
    !Number.isFinite(watermark.getTime()) ||
    !Number.isFinite(evaluatedAt.getTime())
  ) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "Watermark o fecha de evaluación inválidos",
      400
    );
  }
  await db.transaction(async (tx) => {
    if ("type" in input.actor) {
      await assertSystemOperationalScope(tx, {
        organizationId: input.organizationId,
        locationId: input.locationId,
        actor: input.actor,
      });
    } else {
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: input.locationId,
        actor: input.actor,
        allowedRoles: ["owner", "admin"],
      });
    }
  });

  const ruleRows: Array<{
    id: string;
    key: string;
    version: number;
    config: Record<string, unknown>;
  }> = [];
  let afterRuleId: string | undefined;
  while (true) {
    const page = await db
      .select({
        id: insightRuleVersions.id,
        key: insightRuleVersions.key,
        version: insightRuleVersions.version,
        config: insightRuleVersions.config,
      })
      .from(insightRuleVersions)
      .where(
        afterRuleId
          ? and(
              eq(insightRuleVersions.status, "active"),
              gt(insightRuleVersions.id, afterRuleId)
            )
          : eq(insightRuleVersions.status, "active")
      )
      .orderBy(asc(insightRuleVersions.id))
      .limit(activeRulePageSize);
    ruleRows.push(...page);
    if (page.length < activeRulePageSize) break;
    afterRuleId = page[page.length - 1].id;
  }

  const ruleRowsByKey = new Map<string, (typeof ruleRows)[number][]>();
  for (const rule of ruleRows) {
    const rowsForKey = ruleRowsByKey.get(rule.key) ?? [];
    rowsForKey.push(rule);
    ruleRowsByKey.set(rule.key, rowsForKey);
  }
  for (const key of activeRuleKeys) {
    const rowsForKey = ruleRowsByKey.get(key) ?? [];
    if (rowsForKey.length > 1) {
      throw new OperationalError(
        "AMBIGUOUS_ACTIVE_INSIGHT_RULE",
        `La regla activa ${key} tiene varias versiones; se bloqueó la evaluación completa`,
        409,
        { ruleKey: key, versions: rowsForKey.map((rule) => rule.version) }
      );
    }
  }

  const rules = new Map(ruleRows.map((rule) => [rule.key, rule]));
  const candidatesByRule = new Map<RuleKey, InsightCandidate[]>();
  for (const key of activeRuleKeys) candidatesByRule.set(key, []);
  const read = async <T extends DbRow>(
    query: ReturnType<typeof sql>
  ): Promise<T[]> => rows<T>(await db.execute(query));
  const underCfg = rules.get("underutilized_class")?.config ?? {};
  const demandCfg = rules.get("excess_demand")?.config ?? {};
  const underWindowDays = threshold(underCfg, "windowDays", 28);

  const classRows = await read<DbRow>(sql`
    select ct.id as class_template_id,
      count(s.id)::int as observed_sessions,
      coalesce(sum(occupancy.effective_capacity), 0)::int as total_capacity,
      coalesce(sum(occupancy.occupied), 0)::int as total_occupied,
      coalesce(max(w.eligible_waitlist), 0)::int as eligible_waitlist
    from zaltyko.class_templates ct
    left join zaltyko.sessions s on s.organization_id = ct.organization_id and s.class_template_id = ct.id
      and s.location_id = ct.location_id and s.status <> 'cancelled'
      and s.starts_at >= ${new Date(watermark.getTime() - underWindowDays * 86400000)} and s.ends_at <= ${watermark}
    left join zaltyko.locations loc on loc.organization_id = ct.organization_id and loc.id = ct.location_id
    left join zaltyko.spaces sp on sp.organization_id = ct.organization_id and sp.id = coalesce(s.space_id, ct.default_space_id)
    left join lateral (
      select case when s.id is not null then least(ct.capacity, coalesce(s.capacity_override, ct.capacity), coalesce(sp.capacity, ct.capacity))::int end as effective_capacity,
        count(distinct e.athlete_id)::int as occupied
      from zaltyko.enrollments e
      where s.id is not null and e.organization_id = ct.organization_id and e.location_id = ct.location_id
        and e.class_template_id = ct.id and e.starts_on <= (s.starts_at at time zone loc.timezone)::date
        and (e.ends_on is null or e.ends_on >= (s.starts_at at time zone loc.timezone)::date)
        and coalesce((select h.to_status from zaltyko.enrollment_status_history h
          where h.organization_id = e.organization_id and h.enrollment_id = e.id and h.effective_on <= (s.starts_at at time zone loc.timezone)::date
          order by h.effective_on desc, h.changed_at desc limit 1), e.status) = 'active'
    ) occupancy on true
    left join lateral (
      select count(*)::int as eligible_waitlist from zaltyko.waitlist_entries w
      where w.organization_id = ct.organization_id and w.location_id = ct.location_id and w.class_template_id = ct.id
        and w.status in ('waiting', 'offered') and w.contactable and w.contact_consent_status = 'granted' and w.joined_at <= ${watermark}
    ) w on true
    where ct.organization_id = ${input.organizationId} and ct.location_id = ${input.locationId}
      and ct.status = 'active' and ct.created_at <= ${watermark}
    group by ct.id
  `);
  for (const row of classRows) {
    const capacity = numeric(row.total_capacity);
    const fillRate = capacity > 0 ? numeric(row.total_occupied) / capacity : 0;
    const observedSessions = numeric(row.observed_sessions);
    const templateId = String(row.class_template_id);
    const underutilized = evaluateUnderutilizedClass({
      classTemplateId: templateId,
      fillRate,
      observedSessions,
      minimumFillRate: threshold(underCfg, "fillRateBelow", 0.5),
      minimumSessions: threshold(underCfg, "minimumSessions", 4),
    });
    if (underutilized)
      candidatesByRule.get("underutilized_class")?.push(underutilized);
    const demand = evaluateExcessDemand({
      classTemplateId: templateId,
      fillRate,
      eligibleWaitlist: numeric(row.eligible_waitlist),
      observedSessions,
      fillRateAtLeast: threshold(demandCfg, "fillRateAtLeast", 0.9),
      eligibleWaitlistAtLeast: threshold(
        demandCfg,
        "eligibleWaitlistAtLeast",
        3
      ),
    });
    if (demand) candidatesByRule.get("excess_demand")?.push(demand);
  }

  const openClassRows = await read<DbRow>(sql`
    select ct.id as class_template_id,
      greatest(least(ct.capacity, coalesce(sp.capacity, ct.capacity)) - count(distinct e.athlete_id), 0)::int as open_capacity,
      exists (
        select 1 from zaltyko.enrollments priced_e
        join zaltyko.enrollment_price_assignments epa on epa.organization_id = priced_e.organization_id and epa.enrollment_id = priced_e.id
        join zaltyko.price_plans pp on pp.organization_id = epa.organization_id and pp.id = epa.price_plan_id
        where priced_e.organization_id = ct.organization_id and priced_e.location_id = ct.location_id
          and priced_e.class_template_id = ct.id and priced_e.status = 'active'
          and epa.starts_on <= ${watermark.toISOString().slice(0, 10)}
          and (epa.ends_on is null or epa.ends_on >= ${watermark.toISOString().slice(0, 10)}) and pp.is_active
      ) as has_active_price
    from zaltyko.class_templates ct
    left join zaltyko.spaces sp on sp.organization_id = ct.organization_id and sp.id = ct.default_space_id
    left join zaltyko.enrollments e on e.organization_id = ct.organization_id and e.location_id = ct.location_id
      and e.class_template_id = ct.id and e.status = 'active' and e.starts_on <= ${watermark.toISOString().slice(0, 10)}
      and (e.ends_on is null or e.ends_on >= ${watermark.toISOString().slice(0, 10)})
    where ct.organization_id = ${input.organizationId} and ct.location_id = ${input.locationId}
      and ct.status = 'active' and ct.created_at <= ${watermark}
    group by ct.id, sp.capacity
  `);
  const priceCfg = rules.get("capacity_without_price")?.config ?? {};
  for (const row of openClassRows) {
    const item = evaluateCapacityWithoutPrice({
      classTemplateId: String(row.class_template_id),
      openCapacity: numeric(row.open_capacity),
      hasActivePrice: Boolean(row.has_active_price),
      commerciallyOpen: Boolean(priceCfg.requiresOpenCapacity ?? true),
    });
    if (item) candidatesByRule.get("capacity_without_price")?.push(item);
  }

  const overdueRows = await read<DbRow>(sql`
    select c.currency, sum(greatest(c.amount_cents - coalesce(p.paid, 0), 0))::bigint as balance,
      count(distinct c.family_id) filter (where c.amount_cents - coalesce(p.paid, 0) > 0)::int as families,
      floor(extract(epoch from (${watermark} - min(c.due_at) filter (where c.amount_cents - coalesce(p.paid, 0) > 0))) / 86400)::int as oldest_days
    from zaltyko.charges c
    left join lateral (
      select coalesce(sum(greatest(pa.amount_cents - coalesce(r.amount_cents, 0), 0)), 0)::bigint as paid
      from zaltyko.payment_allocations pa
      join zaltyko.payments p on p.organization_id = pa.organization_id and p.id = pa.payment_id
      left join lateral (
        select sum(r.amount_cents)::bigint as amount_cents from zaltyko.refunds r
        where r.organization_id = pa.organization_id and r.payment_allocation_id = pa.id
          and r.status = 'succeeded' and r.refunded_at <= ${watermark}
      ) r on true
      where pa.organization_id = c.organization_id and pa.charge_id = c.id and p.status in ('succeeded','partially_refunded') and pa.allocated_at <= ${watermark}
    ) p on true
    where c.organization_id = ${input.organizationId} and c.location_id = ${input.locationId}
      and c.status in ('due','partially_paid') and c.due_at <= ${new Date(watermark.getTime() - threshold(rules.get("overdue_collections")?.config ?? {}, "minimumAgeDays", 3) * 86400000)}
    group by c.currency
  `);
  const overdueCfg = rules.get("overdue_collections")?.config ?? {};
  for (const row of overdueRows) {
    const item = evaluateOverdueCollections({
      locationId: input.locationId,
      overdueBalanceMinor: numeric(row.balance),
      currency: String(row.currency),
      oldestAgeDays: numeric(row.oldest_days),
      affectedFamilyCount: numeric(row.families),
      minimumAgeDays: threshold(overdueCfg, "minimumAgeDays", 3),
      minimumBalanceMinor: threshold(overdueCfg, "outstandingAboveMinor", 0),
    });
    if (item) candidatesByRule.get("overdue_collections")?.push(item);
  }

  const incompleteRows = await read<DbRow>(sql`
    select s.id, floor(extract(epoch from (${watermark} - s.ends_at)) / 3600)::int as hours_after_end,
      greatest(count(distinct e.id) - count(distinct ar.enrollment_id), 0)::int as missing
    from zaltyko.sessions s join zaltyko.enrollments e on e.organization_id = s.organization_id
      and e.location_id = s.location_id and e.class_template_id = s.class_template_id and e.status = 'active'
      and e.starts_on <= s.starts_at::date and (e.ends_on is null or e.ends_on >= s.starts_at::date)
    left join zaltyko.attendance_records ar on ar.organization_id = s.organization_id and ar.session_id = s.id
    where s.organization_id = ${input.organizationId} and s.location_id = ${input.locationId}
      and s.status = 'completed' and s.ends_at <= ${new Date(watermark.getTime() - threshold(rules.get("incomplete_attendance")?.config ?? {}, "hoursAfterSession", 12) * 3600000)}
    group by s.id, s.ends_at
  `);
  for (const row of incompleteRows) {
    const item = evaluateIncompleteAttendance({
      sessionId: String(row.id),
      hoursAfterEnd: numeric(row.hours_after_end),
      incompleteRecordCount: numeric(row.missing),
      thresholdHours: threshold(
        rules.get("incomplete_attendance")?.config ?? {},
        "hoursAfterSession",
        12
      ),
    });
    if (item) candidatesByRule.get("incomplete_attendance")?.push(item);
  }

  const trialRows = await read<DbRow>(sql`
    select t.id, t.status, t.completed_at, count(tf.id)::int as followups
    from zaltyko.trials t left join zaltyko.trial_followups tf on tf.organization_id = t.organization_id
      and tf.trial_id = t.id and tf.completed_at <= ${watermark}
    where t.organization_id = ${input.organizationId} and t.location_id = ${input.locationId}
      and t.status in ('completed','converted') and t.completed_at <= ${new Date(watermark.getTime() - threshold(rules.get("trial_without_followup")?.config ?? {}, "hoursAfterCompletion", 24) * 3600000)}
    group by t.id
  `);
  let completedTrials = 0;
  let convertedTrials = 0;
  const lowConversionConfig = rules.get("low_trial_conversion")?.config ?? {};
  const conversionWindowStart =
    watermark.getTime() -
    threshold(lowConversionConfig, "windowDays", 90) * 86400000;
  for (const row of trialRows) {
    if (date(row.completed_at).getTime() >= conversionWindowStart) {
      completedTrials += 1;
      if (row.status === "converted") convertedTrials += 1;
    }
    if (numeric(row.followups) === 0) {
      const item = evaluateTrialWithoutFollowup({
        trialId: String(row.id),
        hoursSinceCompletion:
          (watermark.getTime() - date(row.completed_at).getTime()) / 3600000,
        thresholdHours: threshold(
          rules.get("trial_without_followup")?.config ?? {},
          "hoursAfterCompletion",
          24
        ),
      });
      if (item) candidatesByRule.get("trial_without_followup")?.push(item);
    }
  }
  const targetRows = await read<DbRow>(sql`
    select bmt.target_numeric from zaltyko.benchmark_profiles bp
    join zaltyko.benchmark_metric_targets bmt on bmt.benchmark_profile_id = bp.id
    where bp.organization_id = ${input.organizationId} and bp.status = 'active' and bp.effective_from <= ${watermark.toISOString().slice(0, 10)}
      and (bp.effective_to is null or bp.effective_to >= ${watermark.toISOString().slice(0, 10)}) and bmt.metric_key = 'trial_conversion_rate'
    order by bp.version desc limit 1
  `);
  const lowConversion = evaluateLowTrialConversion({
    locationId: input.locationId,
    completedTrialCount: completedTrials,
    convertedTrialCount: convertedTrials,
    targetConversionRate: targetRows[0]
      ? numeric(targetRows[0].target_numeric)
      : undefined,
    minimumTrials: threshold(lowConversionConfig, "minimumTrials", 10),
  });
  if (lowConversion)
    candidatesByRule.get("low_trial_conversion")?.push(lowConversion);

  const coachRows = await read<DbRow>(sql`
    select s.id, ceil(extract(epoch from (s.starts_at - ${watermark})) / 3600)::int as hours_until,
      count(ss.id) filter (where ss.assignment_role = 'coach')::int as staff_count
    from zaltyko.sessions s left join zaltyko.session_staff ss on ss.organization_id = s.organization_id and ss.session_id = s.id
    where s.organization_id = ${input.organizationId} and s.location_id = ${input.locationId}
      and s.status = 'scheduled' and s.starts_at > ${watermark} and s.starts_at <= ${new Date(watermark.getTime() + threshold(rules.get("session_without_coach")?.config ?? {}, "hoursBeforeSession", 72) * 3600000)}
    group by s.id
  `);
  for (const row of coachRows) {
    const item = evaluateSessionWithoutCoach({
      sessionId: String(row.id),
      hoursUntilStart: numeric(row.hours_until),
      assignedCoachCount: numeric(row.staff_count),
      thresholdHours: threshold(
        rules.get("session_without_coach")?.config ?? {},
        "hoursBeforeSession",
        72
      ),
    });
    if (item) candidatesByRule.get("session_without_coach")?.push(item);
  }

  const issueRows = await read<DbRow>(sql`
    select dqi.metric_key, dqi.issue_code, count(*)::int as issue_count
    from zaltyko.data_quality_issues dqi join zaltyko.metric_runs mr on mr.organization_id = dqi.organization_id and mr.id = dqi.metric_run_id
    where dqi.organization_id = ${input.organizationId} and dqi.location_id = ${input.locationId}
      and dqi.status = 'open' and dqi.severity = 'error' and dqi.detected_at <= ${watermark} and mr.completed_at <= ${watermark}
    group by dqi.metric_key, dqi.issue_code
  `);
  const fieldByMetricKey: Record<string, string> = {
    class_fill_rate: "capacity",
    attendance_rate: "attendance",
    attendance_coverage: "attendance",
  };
  const missingFields = [
    ...new Set(
      issueRows
        .filter((row) => row.issue_code === "METRIC_INVALID")
        .map((row) => fieldByMetricKey[String(row.metric_key)])
        .filter((field): field is string => Boolean(field))
    ),
  ];
  const missing = evaluateCriticalDataMissing({
    entityType: "location",
    entityId: input.locationId,
    missingFields,
  });
  if (missing) candidatesByRule.get("critical_data_missing")?.push(missing);

  const results = [];
  for (const key of activeRuleKeys) {
    const rule = rules.get(key);
    if (!rule) continue;
    results.push(
      await runInsightEvaluation({
        organizationId: input.organizationId,
        authorizationLocationId: input.locationId,
        targetLocationId: input.locationId,
        ruleKey: key,
        ruleVersion: rule.version,
        evaluatedAt: evaluatedAt.toISOString(),
        sourceWatermark: watermark.toISOString(),
        idempotencyKey:
          `${input.idempotencyPrefix}:${key}:${watermark.getTime()}`.slice(
            0,
            150
          ),
        candidates: candidatesByRule.get(key) ?? [],
        actor: input.actor,
      })
    );
  }
  return {
    evaluatedRules: results.length,
    candidates: [...candidatesByRule.values()].reduce(
      (sum, items) => sum + items.length,
      0
    ),
    results,
  };
}
