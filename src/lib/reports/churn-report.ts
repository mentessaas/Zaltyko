import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { athletes, auditLogs } from "@/db/schema";
import { INACTIVE_STATUSES } from "@/lib/athletes/constants";

export interface ChurnReportFilters {
  academyId: string;
  tenantId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ChurnReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface ChurnedAthlete {
  athleteId: string;
  athleteName: string;
  churnDate: string | null;
  reason: string;
  membershipEndDate: string | null;
  monthsActive: number | null;
}

export interface ChurnStats {
  totalChurned: number;
  churnRate: number;
  voluntaryChurn: number;
  involuntaryChurn: number;
  reasons: ChurnReason[];
  recentChurns: ChurnedAthlete[];
}

type StatusChangeMeta = {
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
};

export async function calculateChurnReport(filters: ChurnReportFilters): Promise<ChurnStats> {
  const athleteWhere = [
    eq(athletes.academyId, filters.academyId),
    filters.tenantId ? eq(athletes.tenantId, filters.tenantId) : undefined,
  ].filter(Boolean);

  const athleteRows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      status: athletes.status,
      createdAt: athletes.createdAt,
      deletedAt: athletes.deletedAt,
    })
    .from(athletes)
    .where(and(...athleteWhere));

  const athleteIds = athleteRows.map((athlete) => athlete.id);
  const statusChangeLogs =
    athleteIds.length > 0
      ? await db
          .select({
            resourceId: auditLogs.resourceId,
            createdAt: auditLogs.createdAt,
            meta: auditLogs.meta,
          })
          .from(auditLogs)
          .where(
            and(
              filters.tenantId ? eq(auditLogs.tenantId, filters.tenantId) : undefined,
              eq(auditLogs.action, "athletes.status_change"),
              inArray(auditLogs.resourceId, athleteIds),
              filters.startDate ? gte(auditLogs.createdAt, filters.startDate) : undefined,
              filters.endDate ? lte(auditLogs.createdAt, filters.endDate) : undefined
            )
          )
      : [];

  const logsByAthlete = new Map<
    string,
    { createdAt: Date | null; meta: StatusChangeMeta | null }[]
  >();
  statusChangeLogs.forEach((log) => {
    if (!log.resourceId) return;
    const list = logsByAthlete.get(log.resourceId) ?? [];
    list.push({
      createdAt: log.createdAt,
      meta: isStatusChangeMeta(log.meta) ? log.meta : null,
    });
    logsByAthlete.set(log.resourceId, list);
  });

  const inactiveStatuses = new Set<string>(INACTIVE_STATUSES);
  const totalAthletes = athleteRows.length;
  const churnedCandidates = athleteRows.filter(
    (athlete) => athlete.deletedAt || inactiveStatuses.has(athlete.status)
  );

  const churnedAthletes = churnedCandidates
    .map((athlete) => {
      const athleteLogs = logsByAthlete.get(athlete.id) ?? [];
      const matchingLog = athleteLogs
        .filter((entry) => {
          const newStatus = entry.meta?.newStatus;
          return newStatus ? inactiveStatuses.has(newStatus) : false;
        })
        .sort((left, right) => {
          const leftTime = left.createdAt?.getTime() ?? 0;
          const rightTime = right.createdAt?.getTime() ?? 0;
          return rightTime - leftTime;
        })[0];

      const churnDate = matchingLog?.createdAt ?? athlete.deletedAt ?? null;

      if (filters.startDate || filters.endDate) {
        if (!churnDate) {
          return null;
        }
        if (filters.startDate && churnDate < filters.startDate) {
          return null;
        }
        if (filters.endDate && churnDate > filters.endDate) {
          return null;
        }
      }

      const reason = inferChurnReason({
        currentStatus: athlete.status,
        meta: matchingLog?.meta ?? null,
        deletedAt: athlete.deletedAt,
      });

      return {
        athleteId: athlete.id,
        athleteName: athlete.name || "Sin nombre",
        churnDate: churnDate ? churnDate.toISOString() : null,
        reason,
        membershipEndDate: athlete.deletedAt ? athlete.deletedAt.toISOString() : null,
        monthsActive:
          churnDate && athlete.createdAt
            ? diffInMonths(athlete.createdAt, churnDate)
            : null,
      } satisfies ChurnedAthlete;
    })
    .filter((item): item is ChurnedAthlete => Boolean(item))
    .sort((left, right) => {
      const leftTime = left.churnDate ? new Date(left.churnDate).getTime() : 0;
      const rightTime = right.churnDate ? new Date(right.churnDate).getTime() : 0;
      return rightTime - leftTime;
    });

  const totalChurned = churnedAthletes.length;
  const churnRate = totalAthletes > 0 ? (totalChurned / totalAthletes) * 100 : 0;

  const reasonCounts = new Map<string, number>();
  churnedAthletes.forEach((athlete) => {
    reasonCounts.set(athlete.reason, (reasonCounts.get(athlete.reason) ?? 0) + 1);
  });

  const reasons: ChurnReason[] = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: totalChurned > 0 ? Math.round((count / totalChurned) * 100) : 0,
    }))
    .sort((left, right) => right.count - left.count);

  const involuntaryReasons = new Set(["payment_failed", "archived", "deleted"]);
  const involuntaryChurn = churnedAthletes.filter((athlete) =>
    involuntaryReasons.has(athlete.reason)
  ).length;

  return {
    totalChurned,
    churnRate: Number(churnRate.toFixed(1)),
    voluntaryChurn: totalChurned - involuntaryChurn,
    involuntaryChurn,
    reasons,
    recentChurns: churnedAthletes.slice(0, 10),
  };
}

function isStatusChangeMeta(value: unknown): value is StatusChangeMeta {
  return typeof value === "object" && value !== null;
}

function inferChurnReason({
  currentStatus,
  meta,
  deletedAt,
}: {
  currentStatus: string;
  meta: StatusChangeMeta | null;
  deletedAt: Date | null;
}) {
  const explicitReason = meta?.reason?.trim();
  if (explicitReason) {
    return explicitReason;
  }

  if (deletedAt) {
    return "deleted";
  }

  switch (meta?.newStatus ?? currentStatus) {
    case "paused":
      return "schedule";
    case "archived":
      return "archived";
    case "inactive":
      return "unregistered";
    default:
      return "other";
  }
}

function diffInMonths(start: Date, end: Date) {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(months, 0);
}
