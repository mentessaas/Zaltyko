import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { retentionCohortProjectionRuns } from "@/db/zaltyko-schema";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const retentionCohortsQuerySchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    programId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    asOf: z.string().date().optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(24).default(12),
  })
  .refine((query) => Boolean(query.from) === Boolean(query.to), {
    message: "from y to deben enviarse juntos",
    path: ["from"],
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
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
    return z
      .string()
      .date()
      .parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new OperationalError(
      "INVALID_RELATION",
      "Cursor de cohortes inválido",
      400
    );
  }
}

function encodeCursor(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function numeric(value: unknown): number {
  return Number(value ?? 0);
}

function emptyResult(input: {
  organization: Awaited<ReturnType<typeof resolveOwnerScope>>["organization"];
  scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  asOf: string;
  programId: string | null;
  groupId: string | null;
  status: "updating" | "unavailable";
  reason: string;
}) {
  return {
    organization: input.organization,
    scope: {
      locationId: input.scope.selectedLocationId,
      locations: input.scope.locations,
      canViewOrganizationAggregate: input.scope.canViewOrganizationAggregate,
    },
    asOf: input.asOf,
    filters: {
      programId: input.programId,
      groupId: input.groupId,
    },
    projection: {
      status: input.status,
      sourceWatermark: null,
      reason: input.reason,
    },
    pauseGrace: {
      status: "unconfigured" as const,
      reason:
        "No se calcula retentionRate para períodos con inscripciones pausadas hasta definir la gracia de pausa.",
    },
    items: [],
    nextCursor: null,
  };
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
  const latestRun = await db
    .select({
      id: retentionCohortProjectionRuns.id,
      sourceWatermark: retentionCohortProjectionRuns.sourceWatermark,
    })
    .from(retentionCohortProjectionRuns)
    .where(
      and(
        eq(retentionCohortProjectionRuns.organizationId, scope.organization.id),
        scope.selectedLocationId
          ? eq(retentionCohortProjectionRuns.locationId, scope.selectedLocationId)
          : isNull(retentionCohortProjectionRuns.locationId),
        eq(retentionCohortProjectionRuns.status, "succeeded")
      )
    )
    .orderBy(
      desc(retentionCohortProjectionRuns.sourceWatermark),
      desc(retentionCohortProjectionRuns.completedAt)
    )
    .limit(1)
    .then((runs) => runs[0]);

  if (!latestRun) {
    return emptyResult({
      organization: scope.organization,
      scope,
      asOf: query.asOf ?? new Date().toISOString().slice(0, 10),
      programId: query.programId ?? null,
      groupId: query.groupId ?? null,
      status: "unavailable",
      reason: "La proyección todavía no se ha generado para este ámbito.",
    });
  }

  const sourceWatermark = latestRun.sourceWatermark.toISOString();
  const projectionAsOf = sourceWatermark.slice(0, 10);
  const asOf = query.asOf ?? projectionAsOf;
  if (asOf > projectionAsOf) {
    return {
      ...emptyResult({
        organization: scope.organization,
        scope,
        asOf,
        programId: query.programId ?? null,
        groupId: query.groupId ?? null,
        status: "updating",
        reason: "Los datos todavía no están calculados hasta la fecha solicitada.",
      }),
      projection: {
        status: "updating" as const,
        sourceWatermark,
        reason: "Los datos todavía no están calculados hasta la fecha solicitada.",
      },
    };
  }

  const cursor = decodeCursor(query.cursor);
  const result = await db.execute(sql`
    with filtered as materialized (
      select projection.cohort_month, projection.observation_month,
        projection.cohort_size, projection.active_count,
        projection.paused_count, projection.retention_rate,
        projection.quality
      from zaltyko.retention_cohort_projections projection
      where projection.organization_id = ${scope.organization.id}::uuid
        and projection.projection_run_id = ${latestRun.id}::uuid
        and projection.location_id is not distinct from ${scope.selectedLocationId}::uuid
        and projection.program_id is not distinct from ${query.programId ?? null}::uuid
        and projection.group_id is not distinct from ${query.groupId ?? null}::uuid
        and projection.observation_month <= date_trunc('month', ${asOf}::date)::date
        and (${query.from ?? null}::date is null
          or projection.cohort_month >= date_trunc('month', ${query.from ?? null}::date)::date)
        and (${query.to ?? null}::date is null
          or projection.cohort_month <= date_trunc('month', ${query.to ?? null}::date)::date)
    ), page as (
      select cohort_month, max(cohort_size)::int as cohort_size
      from filtered
      where ${cursor}::date is null or cohort_month > ${cursor}::date
      group by cohort_month
      order by cohort_month
      limit ${query.limit + 1}
    )
    select page.cohort_month, page.cohort_size,
      jsonb_agg(jsonb_build_object(
        'periodEnd', filtered.observation_month,
        'activeCount', filtered.active_count,
        'pausedCount', filtered.paused_count,
        'retentionRate', filtered.retention_rate,
        'quality', case when filtered.quality = 'insufficient'
          then 'insufficient_data' else 'complete' end
      ) order by filtered.observation_month) as matrix
    from page
    join filtered on filtered.cohort_month = page.cohort_month
    group by page.cohort_month, page.cohort_size
    order by page.cohort_month
  `);
  const selected = result.rows as unknown as CohortRow[];
  const hasMore = selected.length > query.limit;
  const visible = selected.slice(0, query.limit);
  const items = visible.map((row) => ({
    cohortMonth: row.cohort_month,
    cohortSize: numeric(row.cohort_size),
    matrix: row.matrix,
    definition:
      "Primer estado activo registrado; si falta historial, usa el inicio de la inscripción. Las transferencias dentro del ámbito no son bajas.",
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
    filters: {
      programId: query.programId ?? null,
      groupId: query.groupId ?? null,
    },
    projection: {
      status: "ready" as const,
      sourceWatermark,
      reason: null,
    },
    pauseGrace: {
      status: "unconfigured" as const,
      reason:
        "No se calcula retentionRate para períodos con inscripciones pausadas hasta definir la gracia de pausa.",
    },
    items,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}
