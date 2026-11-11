import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import { sameStaffSet } from "@/modules/coach-assignment/domain/coach-assignment";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Reintentos: cada cambio deja una entrada en zaltyko.audit_log con la clave
 * `coach-assignment:<clientRequestId>` (índice único por academia). Si la
 * misma petición vuelve, se responde con el estado actual y `replayed: true`;
 * si la clave ya se usó para otra cosa, 409.
 */

export function assignmentIdempotencyKey(clientRequestId: string): string {
  return `coach-assignment:${clientRequestId.toLowerCase()}`;
}

/** Serializa los reintentos de una misma clave antes de buscarla. */
export async function lockAssignmentRequest(
  tx: TransactionClient,
  organizationId: string,
  clientRequestId: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:command:${assignmentIdempotencyKey(clientRequestId)}`}, 0))`
  );
}

export async function findPriorAssignment(
  tx: TransactionClient,
  input: {
    organizationId: string;
    clientRequestId: string;
    targetType: "class_template" | "session";
    targetId: string;
    staffProfileIds: readonly string[];
  }
): Promise<boolean> {
  const result = await tx.execute(sql`
    select target_type, target_id::text as target_id, after
    from zaltyko.audit_log
    where organization_id = ${input.organizationId}::uuid
      and idempotency_key = ${assignmentIdempotencyKey(input.clientRequestId)}
  `);
  const row = result.rows[0] as
    | { target_type: string; target_id: string | null; after: { staffProfileIds?: unknown } | null }
    | undefined;
  if (!row) return false;
  const priorIds = row.after?.staffProfileIds;
  if (
    row.target_type !== input.targetType ||
    row.target_id !== input.targetId.toLowerCase() ||
    !Array.isArray(priorIds) ||
    !priorIds.every((id): id is string => typeof id === "string") ||
    !sameStaffSet(priorIds, input.staffProfileIds)
  ) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "Esta petición ya se usó para otro cambio. Recarga la página y vuelve a intentarlo.",
      409
    );
  }
  return true;
}
