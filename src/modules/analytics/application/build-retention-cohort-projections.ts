import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { metricRuns, retentionCohortProjectionRuns } from "@/db/zaltyko-schema";
import {
  getSnapshotLocationIds,
  loadActiveLocationSnapshot,
  type ActiveLocationSnapshot,
} from "@/modules/analytics/application/active-location-snapshot";
import { assertCurrentCronSystemActor } from "@/lib/cron-system-actor";
import type { SystemActor } from "@/modules/shared/application/actor";

const FORMULA_VERSION = 1;
const RUN_BATCH_SIZE = 500;

function chunks<T>(items: readonly T[], size = RUN_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Builds privacy-safe monthly cohort aggregates from operational enrollment
 * history. The operation is tied to a successful metric run and may be retried
 * safely by the outbox worker.
 */
export async function buildRetentionCohortProjections(input: {
  organizationId: string;
  metricRunId: string;
  actor: SystemActor;
  locationSnapshot?: ActiveLocationSnapshot;
}): Promise<{ projectionRuns: number; projectionRows: number }> {
  assertCurrentCronSystemActor(input.actor);

  const [metricRun] = await db
    .select({ id: metricRuns.id, sourceWatermark: metricRuns.sourceWatermark })
    .from(metricRuns)
    .where(
      and(
        eq(metricRuns.organizationId, input.organizationId),
        eq(metricRuns.id, input.metricRunId),
        eq(metricRuns.status, "succeeded")
      )
    )
    .limit(1);
  if (!metricRun) {
    throw new Error("Retention projection requires a successful metric run");
  }

  const locationSnapshot =
    input.locationSnapshot ??
    (await loadActiveLocationSnapshot(input.organizationId));
  const activeLocationIds = getSnapshotLocationIds(
    locationSnapshot,
    input.organizationId
  );
  const scopes: Array<{ locationId: string | null; idempotencyKey: string }> = [
    {
      locationId: null,
      idempotencyKey: `metric:${metricRun.id}:scope:organization`,
    },
    ...activeLocationIds.map((locationId) => ({
      locationId,
      idempotencyKey: `metric:${metricRun.id}:scope:location:${locationId}`,
    })),
  ];

  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '120s'`);
    const orderedScopes = scopes
      .slice()
      .sort((left, right) =>
        compareIds(left.idempotencyKey, right.idempotencyKey)
      );
    for (const scopeBatch of chunks(orderedScopes)) {
      await tx
        .insert(retentionCohortProjectionRuns)
        .values(
          scopeBatch.map((scope) => ({
            organizationId: input.organizationId,
            metricRunId: metricRun.id,
            locationId: scope.locationId,
            formulaVersion: FORMULA_VERSION,
            sourceWatermark: metricRun.sourceWatermark,
            status: "running" as const,
            idempotencyKey: scope.idempotencyKey,
          }))
        )
        .onConflictDoNothing({
          target: [
            retentionCohortProjectionRuns.organizationId,
            retentionCohortProjectionRuns.idempotencyKey,
          ],
        });
    }

    const scopeKeys = [...new Set(scopes.map((scope) => scope.idempotencyKey))];
    const discoveredRunIds: string[] = [];
    for (const keyBatch of chunks(scopeKeys)) {
      const batchRuns = await tx
        .select({ id: retentionCohortProjectionRuns.id })
        .from(retentionCohortProjectionRuns)
        .where(
          and(
            eq(
              retentionCohortProjectionRuns.organizationId,
              input.organizationId
            ),
            inArray(retentionCohortProjectionRuns.idempotencyKey, keyBatch)
          )
        )
        .orderBy(asc(retentionCohortProjectionRuns.id))
        .limit(keyBatch.length);
      discoveredRunIds.push(...batchRuns.map((run) => run.id));
    }

    const orderedRunIds = [...new Set(discoveredRunIds)].sort(compareIds);
    const runs: Array<{
      id: string;
      locationId: string | null;
      status: string;
      idempotencyKey: string;
    }> = [];
    for (const idBatch of chunks(orderedRunIds)) {
      const lockedRuns = await tx
        .select({
          id: retentionCohortProjectionRuns.id,
          locationId: retentionCohortProjectionRuns.locationId,
          status: retentionCohortProjectionRuns.status,
          idempotencyKey: retentionCohortProjectionRuns.idempotencyKey,
        })
        .from(retentionCohortProjectionRuns)
        .where(
          and(
            eq(
              retentionCohortProjectionRuns.organizationId,
              input.organizationId
            ),
            inArray(retentionCohortProjectionRuns.id, idBatch)
          )
        )
        .orderBy(asc(retentionCohortProjectionRuns.id))
        .limit(idBatch.length)
        .for("update");
      runs.push(...lockedRuns);
    }

    const pendingRuns = runs.filter((run) => run.status !== "succeeded");
    if (pendingRuns.length === 0) {
      return {
        projectionRuns: runs.length,
        projectionRows: 0,
      };
    }

    const runIds = pendingRuns.map((run) => run.id);
    const runIdsArray = sql`${sql.param(runIds)}::uuid[]`;
    await tx.execute(sql`
      delete from zaltyko.retention_cohort_projections
      where organization_id = ${input.organizationId}::uuid
        and projection_run_id = any(${runIdsArray})
    `);
    for (const idBatch of chunks(runIds)) {
      await tx
        .update(retentionCohortProjectionRuns)
        .set({
          status: "running",
          rowCount: 0,
          startedAt: new Date(),
          completedAt: null,
          errorCode: null,
        })
        .where(
          and(
            eq(
              retentionCohortProjectionRuns.organizationId,
              input.organizationId
            ),
            inArray(retentionCohortProjectionRuns.id, idBatch)
          )
        );
    }

    await tx.execute(sql`
      with projection_scopes as materialized (
        select run.id as projection_run_id,
          run.location_id as scope_location_id,
          timezone('UTC', run.source_watermark)::date as as_of
        from zaltyko.retention_cohort_projection_runs run
        where run.organization_id = ${input.organizationId}::uuid
          and run.id = any(${runIdsArray})
      ), first_active_history as (
        select history.organization_id, history.enrollment_id,
          min(history.effective_on)::date as first_active_on
        from zaltyko.enrollment_status_history history
        where history.organization_id = ${input.organizationId}::uuid
          and history.to_status = 'active'
          and history.effective_on <= (
            select max(scope.as_of) from projection_scopes scope
          )
        group by history.organization_id, history.enrollment_id
      ), source_enrollments as materialized (
        select scope.projection_run_id, scope.scope_location_id,
          scope.as_of, enrollment.organization_id,
          enrollment.location_id, enrollment.id as enrollment_id,
          enrollment.athlete_id, enrollment.class_template_id,
          template.program_id,
          enrollment.starts_on, enrollment.ends_on, enrollment.status,
          active_history.first_active_on
        from projection_scopes scope
        join zaltyko.enrollments enrollment
          on enrollment.organization_id = ${input.organizationId}::uuid
         and (scope.scope_location_id is null
           or enrollment.location_id = scope.scope_location_id)
        join zaltyko.class_templates template
          on template.organization_id = enrollment.organization_id
         and template.id = enrollment.class_template_id
        left join first_active_history active_history
          on active_history.organization_id = enrollment.organization_id
         and active_history.enrollment_id = enrollment.id
        where active_history.first_active_on is not null
           or enrollment.status in ('active', 'paused', 'completed')
      ), scoped_enrollments as materialized (
        select distinct source.projection_run_id,
          source.scope_location_id, source.as_of,
          source.organization_id, source.enrollment_id,
          source.athlete_id, source.class_template_id,
          source.starts_on, source.ends_on,
          source.status, source.first_active_on, source.location_id,
          dimensions.program_id, dimensions.group_id
        from source_enrollments source
        left join zaltyko.class_template_groups template_group
          on template_group.organization_id = source.organization_id
         and template_group.class_template_id = source.class_template_id
        cross join lateral (values
          (source.program_id, template_group.group_id),
          (source.program_id, null::uuid),
          (null::uuid, template_group.group_id),
          (null::uuid, null::uuid)
        ) as dimensions(program_id, group_id)
      ), cohort_athletes as materialized (
        select enrollment.projection_run_id,
          enrollment.scope_location_id, enrollment.program_id,
          enrollment.group_id, enrollment.athlete_id,
          min(coalesce(enrollment.first_active_on, enrollment.starts_on))::date
            as cohort_date
        from scoped_enrollments enrollment
        group by enrollment.projection_run_id, enrollment.scope_location_id,
          enrollment.program_id, enrollment.group_id, enrollment.athlete_id
      ), cohort_sizes as materialized (
        select person.projection_run_id, person.scope_location_id,
          person.program_id, person.group_id,
          date_trunc('month', person.cohort_date)::date as cohort_month,
          count(*)::int as cohort_size
        from cohort_athletes person
        join projection_scopes scope
          on scope.projection_run_id = person.projection_run_id
        where person.cohort_date <= scope.as_of
        group by person.projection_run_id, person.scope_location_id,
          person.program_id, person.group_id,
          date_trunc('month', person.cohort_date)::date
      ), cohort_months as materialized (
        select cohort.projection_run_id, cohort.scope_location_id,
          cohort.program_id, cohort.group_id, cohort.cohort_month,
          cohort.cohort_size, month_start::date as observation_month
        from cohort_sizes cohort
        join projection_scopes scope
          on scope.projection_run_id = cohort.projection_run_id
        cross join lateral generate_series(
          cohort.cohort_month,
          date_trunc('month', scope.as_of)::date,
          interval '1 month'
        ) month_start
      ), relevant_enrollments as materialized (
        select distinct organization_id, enrollment_id
        from source_enrollments
      ), enrollment_status_periods as materialized (
        select history.organization_id, history.enrollment_id,
          history.to_status, history.effective_on as valid_from,
          lead(history.effective_on) over (
            partition by history.organization_id, history.enrollment_id
            order by history.effective_on, history.changed_at
          ) as valid_until
        from zaltyko.enrollment_status_history history
        join relevant_enrollments relevant
          on relevant.organization_id = history.organization_id
         and relevant.enrollment_id = history.enrollment_id
        where history.effective_on <= (
          select max(scope.as_of) from projection_scopes scope
        )
      ), person_states as materialized (
        select month.projection_run_id, month.scope_location_id,
          month.program_id, month.group_id, month.cohort_month,
          month.cohort_size, month.observation_month, person.athlete_id,
          coalesce(bool_or(
            coalesce(status_period.to_status, enrollment.status) = 'active'
          ), false) as active,
          coalesce(bool_or(
            coalesce(status_period.to_status, enrollment.status) = 'paused'
          ), false) as paused
        from cohort_months month
        join cohort_athletes person
          on person.projection_run_id = month.projection_run_id
         and coalesce(person.program_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(month.program_id, '00000000-0000-0000-0000-000000000000'::uuid)
         and coalesce(person.group_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(month.group_id, '00000000-0000-0000-0000-000000000000'::uuid)
         and date_trunc('month', person.cohort_date)::date = month.cohort_month
        left join scoped_enrollments enrollment
          on enrollment.projection_run_id = month.projection_run_id
         and coalesce(enrollment.program_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(month.program_id, '00000000-0000-0000-0000-000000000000'::uuid)
         and coalesce(enrollment.group_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(month.group_id, '00000000-0000-0000-0000-000000000000'::uuid)
         and enrollment.athlete_id = person.athlete_id
         and enrollment.starts_on <= month.observation_month
         and (enrollment.ends_on is null
           or enrollment.ends_on >= month.observation_month)
        left join enrollment_status_periods status_period
          on status_period.organization_id = enrollment.organization_id
         and status_period.enrollment_id = enrollment.enrollment_id
         and status_period.valid_from <= month.observation_month
         and (status_period.valid_until is null
           or status_period.valid_until > month.observation_month)
        group by month.projection_run_id, month.scope_location_id,
          month.program_id, month.group_id, month.cohort_month,
          month.cohort_size, month.observation_month, person.athlete_id
      ), aggregate_states as (
        select state.projection_run_id, state.scope_location_id,
          state.program_id, state.group_id, state.cohort_month,
          state.cohort_size, state.observation_month,
          count(*) filter (where state.active)::int as active_count,
          count(*) filter (where state.paused)::int as paused_count
        from person_states state
        group by state.projection_run_id, state.scope_location_id,
          state.program_id, state.group_id, state.cohort_month,
          state.cohort_size, state.observation_month
      )
      insert into zaltyko.retention_cohort_projections (
        organization_id, projection_run_id, location_id, program_id, group_id,
        cohort_month, observation_month, cohort_size, active_count,
        paused_count, retention_rate, quality, numerator, denominator
      )
      select ${input.organizationId}::uuid, aggregate.projection_run_id,
        aggregate.scope_location_id, aggregate.program_id, aggregate.group_id,
        aggregate.cohort_month, aggregate.observation_month,
        aggregate.cohort_size, aggregate.active_count, aggregate.paused_count,
        case when aggregate.paused_count > 0 then null
          else round(aggregate.active_count::numeric / aggregate.cohort_size, 4)
        end,
        case when aggregate.paused_count > 0 then 'insufficient'::zaltyko.metric_quality
          else 'complete'::zaltyko.metric_quality end,
        aggregate.active_count, aggregate.cohort_size
      from aggregate_states aggregate
    `);

    await tx.execute(sql`
      update zaltyko.retention_cohort_projection_runs run
      set status = 'succeeded', completed_at = now(), error_code = null,
          row_count = (
            select count(*)::int
            from zaltyko.retention_cohort_projections projection
            where projection.organization_id = run.organization_id
              and projection.projection_run_id = run.id
          )
      where run.organization_id = ${input.organizationId}::uuid
        and run.id = any(${runIdsArray})
    `);

    const completedRuns: Array<{ rowCount: number }> = [];
    for (const idBatch of chunks(runIds)) {
      const batch = await tx
        .select({ rowCount: retentionCohortProjectionRuns.rowCount })
        .from(retentionCohortProjectionRuns)
        .where(
          and(
            eq(
              retentionCohortProjectionRuns.organizationId,
              input.organizationId
            ),
            inArray(retentionCohortProjectionRuns.id, idBatch)
          )
        )
        .limit(idBatch.length);
      completedRuns.push(...batch);
    }

    return {
      projectionRuns: runs.length,
      projectionRows: completedRuns.reduce(
        (total, run) => total + run.rowCount,
        0
      ),
    };
  });
}
