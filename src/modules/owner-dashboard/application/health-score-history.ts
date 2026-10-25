import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  benchmarkProfiles,
  healthDimension,
  healthScoreDimensionSnapshots,
  healthScoreSnapshots,
} from "@/db/zaltyko-schema";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const healthScoreHistoryQuerySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type HealthScoreHistoryQuery = z.input<typeof healthScoreHistoryQuerySchema>;

interface HistoryCursor {
  periodEnd: string;
  computedAt: string;
  id: string;
}

function decodeCursor(cursor?: string): HistoryCursor | null {
  if (!cursor) return null;
  try {
    return z.object({
      periodEnd: z.string().date(),
      computedAt: z.string().datetime(),
      id: z.guid(),
    }).parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new OperationalError("INVALID_RELATION", "Cursor de historial inválido", 400);
  }
}

function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function getHealthScoreHistory(
  input: HealthScoreHistoryQuery & { userId: string }
) {
  const query = healthScoreHistoryQuerySchema.parse(input);
  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: query.organizationId,
    locationId: query.locationId,
  });
  const locationCondition = scope.selectedLocationId
    ? eq(healthScoreSnapshots.locationId, scope.selectedLocationId)
    : isNull(healthScoreSnapshots.locationId);
  const cursor = decodeCursor(query.cursor);
  const cursorCondition = cursor
    ? sql`(
        ${healthScoreSnapshots.periodEnd},
        ${healthScoreSnapshots.computedAt},
        ${healthScoreSnapshots.id}
      ) < (
        ${cursor.periodEnd}::date,
        ${new Date(cursor.computedAt)}::timestamptz,
        ${cursor.id}::uuid
      )`
    : undefined;
  const selected = await db
    .select({
      snapshot: healthScoreSnapshots,
      benchmarkName: benchmarkProfiles.name,
      benchmarkSource: benchmarkProfiles.sourceTitle,
    })
    .from(healthScoreSnapshots)
    .innerJoin(benchmarkProfiles, eq(benchmarkProfiles.id, healthScoreSnapshots.benchmarkProfileId))
    .where(and(
      eq(healthScoreSnapshots.organizationId, scope.organization.id),
      locationCondition,
      cursorCondition
    ))
    .orderBy(
      desc(healthScoreSnapshots.periodEnd),
      desc(healthScoreSnapshots.computedAt),
      desc(healthScoreSnapshots.id)
    )
    .limit(query.limit + 1);
  const hasMore = selected.length > query.limit;
  const visible = selected.slice(0, query.limit);
  const snapshotIds = visible.map(({ snapshot }) => snapshot.id);
  const dimensions = snapshotIds.length === 0
    ? []
    : await db.select().from(healthScoreDimensionSnapshots).where(and(
        eq(healthScoreDimensionSnapshots.organizationId, scope.organization.id),
        inArray(healthScoreDimensionSnapshots.healthScoreSnapshotId, snapshotIds)
      )).limit(snapshotIds.length * healthDimension.enumValues.length);
  const dimensionsBySnapshot = new Map<string, typeof dimensions>();
  for (const dimension of dimensions) {
    const items = dimensionsBySnapshot.get(dimension.healthScoreSnapshotId) ?? [];
    items.push(dimension);
    dimensionsBySnapshot.set(dimension.healthScoreSnapshotId, items);
  }
  const items = visible.map(({ snapshot, benchmarkName, benchmarkSource }) => ({
    id: snapshot.id,
    period: { start: snapshot.periodStart, end: snapshot.periodEnd },
    score: snapshot.score === null ? null : Number(snapshot.score),
    status: snapshot.status,
    coverage: Number(snapshot.coverage),
    computedAt: snapshot.computedAt.toISOString(),
    sourceWatermark: snapshot.sourceWatermark.toISOString(),
    benchmark: { name: benchmarkName, source: benchmarkSource },
    explanation: snapshot.explanation,
    dimensions: (dimensionsBySnapshot.get(snapshot.id) ?? []).map((dimension) => ({
      key: dimension.dimension,
      score: dimension.score === null ? null : Number(dimension.score),
      status: dimension.status,
      coverage: Number(dimension.coverage),
      availableMetricWeight: Number(dimension.availableMetricWeight),
      configuredMetricWeight: Number(dimension.configuredMetricWeight),
      explanation: dimension.explanation,
    })),
  }));
  const last = visible.at(-1)?.snapshot;
  return {
    organization: scope.organization,
    scope: {
      locationId: scope.selectedLocationId,
      locations: scope.locations,
      canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
    },
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ periodEnd: last.periodEnd, computedAt: last.computedAt.toISOString(), id: last.id })
      : null,
  };
}
