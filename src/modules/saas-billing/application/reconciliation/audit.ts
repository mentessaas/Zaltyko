/**
 * Audit entries of the reconciliation (zaltyko.audit_log), always inside the
 * caller's transaction.
 */
import { sql } from "drizzle-orm";
import type { TransactionClient } from "@/lib/db-transactions";

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export async function appendReconciliationAudit(
  tx: TransactionClient,
  input: {
    organizationId: string;
    eventId: string;
    actorUserId: string;
    requestId: string;
    idempotencyKey: string;
    action: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  await tx.execute(sql`
    insert into zaltyko.audit_log (
      organization_id, actor_user_id, action, target_type, target_id,
      request_id, idempotency_key, before, after, metadata
    ) values (
      ${input.organizationId}::uuid, ${input.actorUserId}::uuid, ${input.action},
      'saas_webhook_event', ${input.eventId}::uuid, ${input.requestId},
      ${input.idempotencyKey}, ${JSON.stringify(input.beforeState)}::jsonb,
      ${JSON.stringify(input.afterState)}::jsonb, ${JSON.stringify(input.metadata)}::jsonb
    )
  `);
}
