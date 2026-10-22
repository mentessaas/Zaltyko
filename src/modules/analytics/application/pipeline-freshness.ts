import { sql } from "drizzle-orm";

import { db } from "@/db";

export const METRIC_FRESHNESS_SLA_SECONDS = 15 * 60;

export type PipelineFreshnessStatus = "current" | "pending" | "stale" | "failed";

export interface PipelineFreshness {
  status: PipelineFreshnessStatus;
  pendingEventCount: number;
  processingEventCount: number;
  failedEventCount: number;
  oldestUnsettledAt: string | null;
  oldestUnsettledAgeSeconds: number | null;
  slaSeconds: number;
}

export function derivePipelineFreshness(input: {
  pendingEventCount: number;
  processingEventCount: number;
  failedEventCount: number;
  oldestUnsettledAt: Date | string | null;
  now?: Date;
}): PipelineFreshness {
  const counts = [
    input.pendingEventCount,
    input.processingEventCount,
    input.failedEventCount,
  ];
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
    throw new RangeError("Los contadores del outbox deben ser enteros no negativos");
  }

  const oldest = input.oldestUnsettledAt
    ? new Date(input.oldestUnsettledAt)
    : null;
  if (oldest && Number.isNaN(oldest.getTime())) {
    throw new RangeError("La fecha del evento pendiente no es válida");
  }
  const unsettledCount = counts.reduce((total, count) => total + count, 0);
  const oldestUnsettledAgeSeconds =
    oldest && unsettledCount > 0
      ? Math.max(0, Math.ceil(((input.now ?? new Date()).getTime() - oldest.getTime()) / 1_000))
      : null;
  const status: PipelineFreshnessStatus =
    input.failedEventCount > 0
      ? "failed"
      : unsettledCount === 0
        ? "current"
        : (oldestUnsettledAgeSeconds ?? 0) > METRIC_FRESHNESS_SLA_SECONDS
          ? "stale"
          : "pending";

  return {
    status,
    pendingEventCount: input.pendingEventCount,
    processingEventCount: input.processingEventCount,
    failedEventCount: input.failedEventCount,
    oldestUnsettledAt: oldest?.toISOString() ?? null,
    oldestUnsettledAgeSeconds,
    slaSeconds: METRIC_FRESHNESS_SLA_SECONDS,
  };
}

export async function getPipelineFreshness(input: {
  organizationId: string;
  locationId: string | null;
}): Promise<PipelineFreshness> {
  const result = await db.execute(sql`
    select
      count(*) filter (where status = 'pending')::int as pending_count,
      count(*) filter (where status = 'processing')::int as processing_count,
      count(*) filter (where status = 'failed')::int as failed_count,
      min(occurred_at) as oldest_unsettled_at
    from zaltyko.outbox_events
    where organization_id = ${input.organizationId}::uuid
      and status in ('pending', 'processing', 'failed')
      and (${input.locationId}::uuid is null
        or location_id = ${input.locationId}::uuid
        or location_id is null)
      and (
        event_name like any(array[
          'enrollment.%', 'sessions.%', 'attendance.%', 'waitlist.%', 'trial.%',
          'invoice.%', 'charge.%', 'payment.%', 'financial.%', 'benchmark.%'
        ]::text[])
        or event_name = 'organization.bootstrapped'
      )
  `);
  const row = result.rows[0] as
    | {
        pending_count: number | string;
        processing_count: number | string;
        failed_count: number | string;
        oldest_unsettled_at: Date | string | null;
      }
    | undefined;
  return derivePipelineFreshness({
    pendingEventCount: Number(row?.pending_count ?? 0),
    processingEventCount: Number(row?.processing_count ?? 0),
    failedEventCount: Number(row?.failed_count ?? 0),
    oldestUnsettledAt: row?.oldest_unsettled_at ?? null,
  });
}
