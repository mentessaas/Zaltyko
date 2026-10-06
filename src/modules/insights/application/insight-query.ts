import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  insightActions,
  insightRuleVersions,
  insights,
  insightStatusHistory,
} from "@/db/zaltyko-schema";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const visibleStatuses = ["open", "viewed", "actioned", "snoozed"] as const;

export const insightListQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
  status: z
    .enum(["open", "viewed", "actioned", "snoozed", "dismissed", "resolved"])
    .optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type InsightListQuery = z.input<typeof insightListQuerySchema>;

export interface InsightListItem {
  id: string;
  organizationId: string;
  locationId: string | null;
  ruleKey: string;
  ruleName: string;
  ruleVersion: number;
  status: string;
  severity: string;
  priorityScore: number;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  assumptions: unknown[];
  ctaKey: string;
  ctaPayload: Record<string, unknown>;
  estimatedValueMinMinor: number | null;
  estimatedValueMaxMinor: number | null;
  estimateCurrency: string | null;
  entityType: string;
  entityId: string | null;
  detectedAt: string;
  lastSeenAt: string;
  snoozedUntil: string | null;
  version: number;
}

export interface InsightListBundle {
  organization: { id: string; name: string; defaultCurrency: string };
  scope: {
    locationId: string | null;
    entityId: string | null;
    locations: Array<{ id: string; name: string }>;
    canViewOrganizationAggregate: boolean;
  };
  items: InsightListItem[];
  nextCursor: string | null;
}

interface CursorValue {
  priority: number;
  lastSeenAt: string;
  id: string;
}

function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): CursorValue | null {
  if (!value) return null;
  try {
    return z
      .object({
        priority: z.number().min(0).max(100),
        lastSeenAt: z.string().datetime(),
        id: z.string().uuid(),
      })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new OperationalError("INVALID_RELATION", "Cursor inválido", 400);
  }
}

function toListItem(row: {
  insight: typeof insights.$inferSelect;
  ruleKey: string;
  ruleName: string;
  ruleVersion: number;
}): InsightListItem {
  return {
    id: row.insight.id,
    organizationId: row.insight.organizationId,
    locationId: row.insight.locationId,
    ruleKey: row.ruleKey,
    ruleName: row.ruleName,
    ruleVersion: row.ruleVersion,
    status: row.insight.status,
    severity: row.insight.severity,
    priorityScore: Number(row.insight.priorityScore),
    title: row.insight.title,
    detail: row.insight.detail,
    evidence: row.insight.evidence,
    assumptions: row.insight.assumptions,
    ctaKey: row.insight.ctaKey,
    ctaPayload: row.insight.ctaPayload,
    estimatedValueMinMinor:
      row.insight.estimatedValueMinMinor === null
        ? null
        : Number(row.insight.estimatedValueMinMinor),
    estimatedValueMaxMinor:
      row.insight.estimatedValueMaxMinor === null
        ? null
        : Number(row.insight.estimatedValueMaxMinor),
    estimateCurrency: row.insight.estimateCurrency,
    entityType: row.insight.entityType,
    entityId: row.insight.entityId,
    detectedAt: row.insight.detectedAt.toISOString(),
    lastSeenAt: row.insight.lastSeenAt.toISOString(),
    snoozedUntil: row.insight.snoozedUntil?.toISOString() ?? null,
    version: row.insight.version,
  };
}

export async function listInsights(
  input: InsightListQuery & { userId: string }
): Promise<InsightListBundle> {
  const query = insightListQuerySchema.parse(input);
  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: query.organizationId,
    locationId: query.locationId,
  });
  const cursor = decodeCursor(query.cursor);
  const statusCondition = query.status
    ? eq(insights.status, query.status)
    : inArray(insights.status, visibleStatuses);
  const locationCondition = scope.selectedLocationId
    ? eq(insights.locationId, scope.selectedLocationId)
    : undefined;
  const entityCondition = query.entityId
    ? eq(insights.entityId, query.entityId)
    : undefined;
  const cursorCondition = cursor
    ? sql`(
        ${insights.priorityScore}, ${insights.lastSeenAt}, ${insights.id}
      ) < (
        ${cursor.priority}::numeric, ${new Date(cursor.lastSeenAt)}::timestamptz, ${cursor.id}::uuid
      )`
    : undefined;
  const rows = await db
    .select({
      insight: insights,
      ruleKey: insightRuleVersions.key,
      ruleName: insightRuleVersions.name,
      ruleVersion: insightRuleVersions.version,
    })
    .from(insights)
    .innerJoin(
      insightRuleVersions,
      eq(insightRuleVersions.id, insights.ruleVersionId)
    )
    .where(
      and(
        eq(insights.organizationId, scope.organization.id),
        statusCondition,
        locationCondition,
        entityCondition,
        cursorCondition
      )
    )
    .orderBy(
      desc(insights.priorityScore),
      desc(insights.lastSeenAt),
      desc(insights.id)
    )
    .limit(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const visible = rows.slice(0, query.limit).map(toListItem);
  const last = visible.at(-1);
  return {
    organization: scope.organization,
    scope: {
      locationId: scope.selectedLocationId,
      entityId: query.entityId ?? null,
      locations: scope.locations,
      canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
    },
    items: visible,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            priority: last.priorityScore,
            lastSeenAt: last.lastSeenAt,
            id: last.id,
          })
        : null,
  };
}

export async function getInsightDetail(input: {
  userId: string;
  insightId: string;
  organizationId?: string;
  locationId?: string;
}) {
  const scope = await resolveOwnerScope(input);
  const locationCondition = scope.selectedLocationId
    ? eq(insights.locationId, scope.selectedLocationId)
    : undefined;
  const [row] = await db
    .select({
      insight: insights,
      ruleKey: insightRuleVersions.key,
      ruleName: insightRuleVersions.name,
      ruleVersion: insightRuleVersions.version,
    })
    .from(insights)
    .innerJoin(
      insightRuleVersions,
      eq(insightRuleVersions.id, insights.ruleVersionId)
    )
    .where(
      and(
        eq(insights.organizationId, scope.organization.id),
        eq(insights.id, input.insightId),
        locationCondition
      )
    )
    .limit(1);
  if (!row)
    throw new OperationalError("NOT_FOUND", "Insight no encontrado", 404);
  const actions = await db
    .select()
    .from(insightActions)
    .where(
      and(
        eq(insightActions.organizationId, scope.organization.id),
        eq(insightActions.insightId, row.insight.id)
      )
    )
    .orderBy(desc(insightActions.createdAt))
    .limit(100);
  const history = await db
    .select()
    .from(insightStatusHistory)
    .where(
      and(
        eq(insightStatusHistory.organizationId, scope.organization.id),
        eq(insightStatusHistory.insightId, row.insight.id)
      )
    )
    .orderBy(desc(insightStatusHistory.changedAt))
    .limit(100);
  return {
    insight: toListItem(row),
    actions: actions.map((action) => ({
      ...action,
      evaluationEndsAt: action.evaluationEndsAt.toISOString(),
      completedAt: action.completedAt?.toISOString() ?? null,
      createdAt: action.createdAt.toISOString(),
      updatedAt: action.updatedAt.toISOString(),
    })),
    history: history.map((item) => ({
      ...item,
      changedAt: item.changedAt.toISOString(),
    })),
  };
}
