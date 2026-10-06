import { sql } from "drizzle-orm";

import { db } from "@/db";
import { consumeMetricInvalidationEvent } from "@/modules/analytics/application/metric-engine";

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_LEASE_MS = 60_000;
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 15 * 60_000;

interface ClaimedEvent {
  id: string;
  organization_id: string;
  event_name: string;
  attempts: number;
  lease_until: Date;
}

export interface OutboxDispatchResult {
  claimed: number;
  processed: number;
  retried: number;
  deadLettered: number;
  skipped: number;
}

function safeErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,80}$/.test(error.code)
  ) {
    return error.code;
  }
  return "PROCESSING_FAILED";
}

/**
 * Claims due outbox rows with a recoverable lease. `available_at` doubles as
 * the lease deadline while processing; stale claims become eligible again.
 * Consumers must be idempotent because a crash can occur after their commit
 * and before this dispatcher acknowledges the outbox row.
 */
export async function dispatchOutboxBatch(options: {
  batchSize?: number;
  maxAttempts?: number;
  leaseMs?: number;
} = {}): Promise<OutboxDispatchResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError("batchSize debe estar entre 1 y 100");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new RangeError("maxAttempts debe estar entre 1 y 20");
  }
  if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 300_000) {
    throw new RangeError("leaseMs debe estar entre 1000 y 300000");
  }

  const claim = await db.transaction(async (tx) => {
    const exhausted = await tx.execute(sql`
      update zaltyko.outbox_events
      set status = 'failed', last_error = 'MAX_ATTEMPTS_EXHAUSTED'
      where status = 'processing' and available_at <= now() and attempts >= ${maxAttempts}
      returning id
    `);
    const result = await tx.execute(sql`
      with due as (
        select id
        from zaltyko.outbox_events
        where attempts < ${maxAttempts} and (
          (status = 'pending' and available_at <= now())
          or (status = 'processing' and available_at <= now())
        )
        order by available_at asc, created_at asc
        for update skip locked
        limit ${batchSize}
      )
      update zaltyko.outbox_events event
      set status = 'processing',
          attempts = event.attempts + 1,
          available_at = now() + (${leaseMs} * interval '1 millisecond'),
          last_error = null
      from due
      where event.id = due.id
      returning event.id, event.organization_id, event.event_name,
        event.attempts, event.available_at as lease_until
    `);
    return { events: result.rows as unknown as ClaimedEvent[], exhausted: exhausted.rows.length };
  });

  const summary: OutboxDispatchResult = {
    claimed: claim.events.length,
    processed: 0,
    retried: 0,
    deadLettered: claim.exhausted,
    skipped: 0,
  };
  for (const event of claim.events) {
    try {
      const consumed = event.event_name.startsWith("metrics.")
        ? false
        : await consumeMetricInvalidationEvent({
            organizationId: event.organization_id,
            outboxEventId: event.id,
          });
      const acknowledged = await db.execute(sql`
        update zaltyko.outbox_events
        set status = 'processed', processed_at = now(), last_error = null
        where id = ${event.id}::uuid and organization_id = ${event.organization_id}::uuid
          and status = 'processing' and attempts = ${event.attempts}
        returning id
      `);
      if (acknowledged.rows.length > 0) {
        summary.processed += 1;
        if (!consumed) summary.skipped += 1;
      }
    } catch (error) {
      const delayMs = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * 2 ** Math.min(event.attempts - 1, 10)
      );
      const terminal = event.attempts >= maxAttempts;
      const failure = await db.execute(sql`
        update zaltyko.outbox_events
        set status = ${terminal ? "failed" : "pending"}::zaltyko.outbox_status,
            available_at = now() + (${delayMs} * interval '1 millisecond'),
            last_error = ${safeErrorCode(error)}
        where id = ${event.id}::uuid and organization_id = ${event.organization_id}::uuid
          and status = 'processing' and attempts = ${event.attempts}
        returning id
      `);
      if (failure.rows.length > 0) {
        if (terminal) summary.deadLettered += 1;
        else summary.retried += 1;
      }
    }
  }
  return summary;
}
