import { and, eq, sql } from "drizzle-orm";

import { auditLog, outboxEvents } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { assertAnalyticsSafePayload } from "@/modules/events/domain/domain-event";
import { OperationalError } from "@/modules/shared/domain/operational-error";

type IdempotencyComparable = string | number | boolean | null;

export function assertIdempotencyPayload(
  actual: Record<string, unknown>,
  expected: Record<string, IdempotencyComparable>
): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual[key] !== expectedValue) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de idempotencia ya fue usada con otros parámetros",
        409
      );
    }
  }
}

export async function lockCommand(
  tx: TransactionClient,
  organizationId: string,
  idempotencyKey: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:command:${idempotencyKey}`}, 0))`
  );
}

export async function lockCapacity(
  tx: TransactionClient,
  organizationId: string,
  classTemplateId: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:capacity:${classTemplateId}`}, 0))`
  );
}

export async function findOutboxEvent(
  tx: TransactionClient,
  input: {
    organizationId: string;
    eventName: string;
    idempotencyKey: string;
  }
) {
  const [event] = await tx
    .select()
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.eventName, input.eventName),
        eq(outboxEvents.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);

  return event ?? null;
}

export async function appendOutboxEvent(
  tx: TransactionClient,
  input: {
    organizationId: string;
    locationId: string | null;
    eventName: string;
    aggregateType: string;
    aggregateId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    occurredAt?: Date;
  }
): Promise<void> {
  assertAnalyticsSafePayload(input.payload);

  await tx.insert(outboxEvents).values({
    organizationId: input.organizationId,
    locationId: input.locationId,
    eventName: input.eventName,
    eventVersion: 1,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    occurredAt: input.occurredAt ?? new Date(),
  });
}

export async function appendAuditEntry(
  tx: TransactionClient,
  input: {
    organizationId: string;
    locationId: string | null;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    idempotencyKey: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await tx.insert(auditLog).values({
    organizationId: input.organizationId,
    locationId: input.locationId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    idempotencyKey: input.idempotencyKey,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? {},
  });
}
