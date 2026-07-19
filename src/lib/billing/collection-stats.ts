import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { charges } from "@/db/schema";

export interface CollectionStats {
  period: string;
  collectedCents: number;
  pendingCents: number;
  overdueCents: number;
  failedCents: number;
  refundedCents: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  failedCount: number;
  autoPaidCount: number;
  manualPaidCount: number;
  // % de cobros exitosos sobre (pagados + fallidos) del periodo.
  successRate: number;
}

/**
 * Estadísticas de cobro de una academia para un periodo (YYYY-MM).
 * Calculadas en una sola consulta agregada con sumas condicionales.
 */
export async function getCollectionStats(
  academyId: string,
  period: string
): Promise<CollectionStats> {
  const [row] = await db
    .select({
      collectedCents: sql<number>`coalesce(sum(case when ${charges.status} = 'paid' then ${charges.amountCents} else 0 end), 0)`,
      pendingCents: sql<number>`coalesce(sum(case when ${charges.status} in ('pending','overdue','failed') then ${charges.amountCents} else 0 end), 0)`,
      overdueCents: sql<number>`coalesce(sum(case when ${charges.status} = 'overdue' then ${charges.amountCents} else 0 end), 0)`,
      failedCents: sql<number>`coalesce(sum(case when ${charges.status} = 'failed' then ${charges.amountCents} else 0 end), 0)`,
      refundedCents: sql<number>`coalesce(sum(case when ${charges.status} = 'refunded' then ${charges.amountCents} else 0 end), 0)`,
      paidCount: sql<number>`count(*) filter (where ${charges.status} = 'paid')`,
      pendingCount: sql<number>`count(*) filter (where ${charges.status} in ('pending','overdue','failed'))`,
      overdueCount: sql<number>`count(*) filter (where ${charges.status} = 'overdue')`,
      failedCount: sql<number>`count(*) filter (where ${charges.status} = 'failed')`,
      autoPaidCount: sql<number>`count(*) filter (where ${charges.status} = 'paid' and ${charges.paymentMethod} = 'card')`,
      manualPaidCount: sql<number>`count(*) filter (where ${charges.status} = 'paid' and (${charges.paymentMethod} is null or ${charges.paymentMethod} <> 'card'))`,
    })
    .from(charges)
    .where(and(eq(charges.academyId, academyId), eq(charges.period, period)));

  const paidCount = Number(row?.paidCount ?? 0);
  const failedCount = Number(row?.failedCount ?? 0);
  const attempts = paidCount + failedCount;
  const successRate = attempts > 0 ? Math.round((paidCount / attempts) * 100) : 0;

  return {
    period,
    collectedCents: Number(row?.collectedCents ?? 0),
    pendingCents: Number(row?.pendingCents ?? 0),
    overdueCents: Number(row?.overdueCents ?? 0),
    failedCents: Number(row?.failedCents ?? 0),
    refundedCents: Number(row?.refundedCents ?? 0),
    paidCount,
    pendingCount: Number(row?.pendingCount ?? 0),
    overdueCount: Number(row?.overdueCount ?? 0),
    failedCount,
    autoPaidCount: Number(row?.autoPaidCount ?? 0),
    manualPaidCount: Number(row?.manualPaidCount ?? 0),
    successRate,
  };
}

/** Periodo actual en formato YYYY-MM. */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
