import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const retentionCohortsQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  asOf: z.string().date().optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12),
}).refine((query) => Boolean(query.from) === Boolean(query.to), {
  message: "from y to deben enviarse juntos",
  path: ["from"],
}).refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: "El período es inválido",
  path: ["to"],
});

interface CohortRow extends Record<string, unknown> {
  cohort_month: string;
  cohort_size: number;
  matrix: Array<Record<string, unknown>>;
}

function decodeCursor(value?: string): string | null {
  if (!value) return null;
  try {
    return z.string().date().parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new OperationalError("INVALID_RELATION", "Cursor de cohortes inválido", 400);
  }
}

function encodeCursor(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function numeric(value: unknown): number {
  return Number(value ?? 0);
}

export async function getRetentionCohorts(
  input: z.input<typeof retentionCohortsQuerySchema> & { userId: string }
) {
  const query = retentionCohortsQuerySchema.parse(input);
  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: query.organizationId,
    locationId: query.locationId,
  });
  const asOf = query.asOf ?? new Date().toISOString().slice(0, 10);
  const cursor = decodeCursor(query.cursor);
  const result = await db.execute(sql`
    with scoped_enrollments as not materialized (
      select e.organization_id, e.location_id, e.id, e.athlete_id,
        e.class_template_id, e.starts_on, e.ends_on, e.status
      from zaltyko.enrollments e
      join zaltyko.class_templates ct
        on ct.organization_id = e.organization_id and ct.id = e.class_template_id
      where e.organization_id = ${scope.organization.id}::uuid
        and (${scope.selectedLocationId}::uuid is null or e.location_id = ${scope.selectedLocationId}::uuid)
        and (${query.programId ?? null}::uuid is null or ct.program_id = ${query.programId ?? null}::uuid)
        and (${query.groupId ?? null}::uuid is null or exists (
          select 1 from zaltyko.class_template_groups cg
          where cg.organization_id = e.organization_id and cg.class_template_id = e.class_template_id
            and cg.group_id = ${query.groupId ?? null}::uuid
        ))
    ), first_active_history as (
      select history.organization_id, history.enrollment_id,
        min(history.effective_on)::date as first_active_on
      from zaltyko.enrollment_status_history history
      where history.organization_id = ${scope.organization.id}::uuid
        and history.to_status = 'active'
        and history.effective_on <= ${asOf}::date
      group by history.organization_id, history.enrollment_id
    ), cohort_athletes as (
      select e.athlete_id,
        min(coalesce(active_history.first_active_on, e.starts_on))::date as cohort_date
      from scoped_enrollments e
      left join first_active_history active_history
        on active_history.organization_id = e.organization_id
       and active_history.enrollment_id = e.id
      where active_history.first_active_on is not null
        or e.status in ('active','paused','completed')
      group by e.athlete_id
    ), cohort_sizes as (
      select date_trunc('month', cohort_date)::date as cohort_month,
        count(*)::int as cohort_size
      from cohort_athletes
      where cohort_date <= ${asOf}::date
        and (${query.from ?? null}::date is null or cohort_date >= date_trunc('month', ${query.from ?? null}::date)::date)
        and (${query.to ?? null}::date is null or cohort_date <= ${query.to ?? null}::date)
      group by date_trunc('month', cohort_date)::date
    ), cohort_months as (
      select cohort.cohort_month, cohort.cohort_size, month_end::date as month_end
      from cohort_sizes cohort
      cross join lateral generate_series(
        cohort.cohort_month,
        date_trunc('month', ${asOf}::date)::date,
        interval '1 month'
      ) month_end
    ), enrollment_status_periods as (
      select history.organization_id, history.enrollment_id,
        history.to_status, history.effective_on as valid_from,
        lead(history.effective_on) over (
          partition by history.organization_id, history.enrollment_id
          order by history.effective_on, history.changed_at
        ) as valid_until
      from zaltyko.enrollment_status_history history
      join scoped_enrollments enrollment
        on enrollment.organization_id = history.organization_id
       and enrollment.id = history.enrollment_id
      where history.effective_on <= ${asOf}::date
    ), person_states as (
      select months.cohort_month, months.cohort_size, months.month_end,
        person.athlete_id,
        coalesce(bool_or(
          coalesce(status_period.to_status, enrollment.status) = 'active'
        ), false) as active,
        coalesce(bool_or(
          coalesce(status_period.to_status, enrollment.status) = 'paused'
        ), false) as paused
      from cohort_months months
      join cohort_athletes person
        on date_trunc('month', person.cohort_date)::date = months.cohort_month
      left join scoped_enrollments enrollment
        on enrollment.organization_id = ${scope.organization.id}::uuid
       and enrollment.athlete_id = person.athlete_id
       and enrollment.starts_on <= months.month_end
       and (enrollment.ends_on is null or enrollment.ends_on >= months.month_end)
      left join enrollment_status_periods status_period
        on status_period.organization_id = enrollment.organization_id
       and status_period.enrollment_id = enrollment.id
       and status_period.valid_from <= months.month_end
       and (status_period.valid_until is null or status_period.valid_until > months.month_end)
      group by months.cohort_month, months.cohort_size, months.month_end, person.athlete_id
    ), states as (
      select cohort_month, cohort_size, month_end,
        count(*) filter (where active)::int as active_count,
        count(*) filter (where paused)::int as paused_count
      from person_states
      group by cohort_month, cohort_size, month_end
    ), cohort_matrix as (
      select cohort_month, cohort_size,
        jsonb_agg(jsonb_build_object(
          'periodEnd', month_end,
          'activeCount', active_count,
          'pausedCount', paused_count,
          'retentionRate', case when paused_count > 0 or cohort_size = 0 then null
            else round(active_count::numeric / cohort_size, 4) end,
          'quality', case when paused_count > 0 then 'insufficient_data'
            when cohort_size = 0 then 'insufficient_data' else 'complete' end
        ) order by month_end) as matrix
      from states
      group by cohort_month, cohort_size
    )
    select cohort_month, cohort_size, matrix
    from cohort_matrix
    where ${cursor}::date is null or cohort_month > ${cursor}::date
    order by cohort_month
    limit ${query.limit + 1}
  `);
  const selected = result.rows as unknown as CohortRow[];
  const hasMore = selected.length > query.limit;
  const visible = selected.slice(0, query.limit);
  const items = visible.map((row) => ({
    cohortMonth: row.cohort_month,
    cohortSize: numeric(row.cohort_size),
    matrix: row.matrix,
    definition: "Primer active efectivo en historial (fallback starts_on si falta); transferencias dentro del scope no son bajas.",
  }));
  const last = visible.at(-1)?.cohort_month;
  return {
    organization: scope.organization,
    scope: {
      locationId: scope.selectedLocationId,
      locations: scope.locations,
      canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
    },
    asOf,
    filters: { programId: query.programId ?? null, groupId: query.groupId ?? null },
    pauseGrace: { status: "unconfigured", reason: "No se calcula retentionRate para períodos con inscripciones pausadas hasta definir la gracia de pausa." },
    items,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}
