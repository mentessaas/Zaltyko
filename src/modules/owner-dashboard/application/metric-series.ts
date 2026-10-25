import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { metricDefinitions, metricRunValues, metricRuns } from "@/db/zaltyko-schema";
import { getPipelineFreshness } from "@/modules/analytics/application/pipeline-freshness";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const metricSeriesQuerySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).refine((query) => Boolean(query.from) === Boolean(query.to), {
  message: "from y to deben enviarse juntos",
  path: ["from"],
}).refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: "El período es inválido",
  path: ["to"],
});

interface MetricCursor {
  periodEnd: string;
  computedAt: string;
  id: string;
}

function decodeCursor(value?: string): MetricCursor | null {
  if (!value) return null;
  try {
    return z.object({
      periodEnd: z.string().date(),
      computedAt: z.string().datetime(),
      id: z.guid(),
    }).parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new OperationalError("INVALID_RELATION", "Cursor de métricas inválido", 400);
  }
}

function encodeCursor(cursor: MetricCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function getMetricSeries(input: {
  userId: string;
  metricKey: string;
} & z.input<typeof metricSeriesQuerySchema>) {
  const query = metricSeriesQuerySchema.parse(input);
  const metricKey = z.string().regex(/^[a-z][a-z0-9_]{1,79}$/).parse(input.metricKey);
  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: query.organizationId,
    locationId: query.locationId,
  });
  const freshness = await getPipelineFreshness({
    organizationId: scope.organization.id,
    locationId: scope.selectedLocationId,
  });
  const [definition] = await db.select().from(metricDefinitions).where(eq(metricDefinitions.key, metricKey)).limit(1);
  if (!definition) throw new OperationalError("NOT_FOUND", "Métrica no encontrada", 404);

  const locationCondition = scope.selectedLocationId
    ? eq(metricRunValues.locationId, scope.selectedLocationId)
    : isNull(metricRunValues.locationId);
  const cursor = decodeCursor(query.cursor);
  const cursorCondition = cursor
    ? sql`(
        ${metricRunValues.periodEnd}, ${metricRunValues.computedAt}, ${metricRunValues.id}
      ) < (
        ${cursor.periodEnd}::date, ${new Date(cursor.computedAt)}::timestamptz, ${cursor.id}::uuid
      )`
    : undefined;
  const selected = await db.select({
    value: metricRunValues,
    completedAt: metricRuns.completedAt,
  }).from(metricRunValues)
    .innerJoin(metricRuns, and(
      eq(metricRuns.organizationId, metricRunValues.organizationId),
      eq(metricRuns.id, metricRunValues.metricRunId),
      eq(metricRuns.status, "succeeded")
    ))
    .where(and(
      eq(metricRunValues.organizationId, scope.organization.id),
      eq(metricRunValues.metricKey, metricKey),
      locationCondition,
      query.from ? sql`${metricRunValues.periodStart} >= ${query.from}::date` : undefined,
      query.to ? sql`${metricRunValues.periodEnd} <= ${query.to}::date` : undefined,
      query.currency ? eq(metricRunValues.currency, query.currency) : undefined,
      cursorCondition
    ))
    .orderBy(desc(metricRunValues.periodEnd), desc(metricRunValues.computedAt), desc(metricRunValues.id))
    .limit(query.limit + 1);
  const hasMore = selected.length > query.limit;
  const visible = selected.slice(0, query.limit);
  const items = visible.map(({ value, completedAt }) => ({
    id: value.id,
    period: { start: value.periodStart, end: value.periodEnd },
    value: value.valueNumeric === null ? null : Number(value.valueNumeric),
    currency: value.currency,
    numerator: value.numerator === null ? null : Number(value.numerator),
    denominator: value.denominator === null ? null : Number(value.denominator),
    coverage: Number(value.coverage),
    quality: value.quality,
    formulaVersion: value.formulaVersion,
    dimensions: value.dimensions,
    diagnostics: value.diagnostics,
    computedAt: value.computedAt.toISOString(),
    completedAt: completedAt?.toISOString() ?? null,
    sourceWatermark: value.sourceWatermark.toISOString(),
  }));
  const last = visible.at(-1)?.value;
  return {
    organization: scope.organization,
    scope: {
      locationId: scope.selectedLocationId,
      locations: scope.locations,
      canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
    },
    metric: {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      unit: definition.unit,
      direction: definition.direction,
      grain: definition.grain,
      formulaVersion: definition.formulaVersion,
      formula: definition.formula,
    },
    freshness,
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ periodEnd: last.periodEnd, computedAt: last.computedAt.toISOString(), id: last.id })
      : null,
  };
}
