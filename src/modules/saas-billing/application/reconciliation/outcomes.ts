/**
 * Outcomes of a claimed decision: stale close (own transaction or inside the
 * caller's) and applied / already applied, with result row and audit.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { appendReconciliationAudit } from "./audit";
import { fail } from "./errors";
import { lockClaimedState, finishEvent } from "./lease";
import type { EventRecord, SubscriptionBaseline, EntitlementBaseline, DecisionRecord, ClaimedEvent } from "./model";

export function actualEntitlement(entitlement: EntitlementBaseline | null): {
  revision: number;
  sourceReference: string;
} {
  if (!entitlement) throw fail("VERSION_CONFLICT", "El entitlement ya no existe", 409);
  const revision = Number(entitlement.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw fail("FEATURE_NOT_AVAILABLE", "Revisión de entitlement inválida", 503);
  }
  return { revision, sourceReference: entitlement.source_reference };
}

export async function closeStaleDecision(
  claim: ClaimedEvent,
  decision: DecisionRecord,
  observedSnapshotSha256: string | null,
  resultCode: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const locked = await lockClaimedState(tx, claim, decision);
    if (!locked) return false;
    const actual = actualEntitlement(locked.entitlement);
    await tx.execute(sql`
      insert into zaltyko.organization_saas_webhook_reconciliation_results (
        decision_id, outcome, processor_fencing_version,
        observed_snapshot_sha256, entitlement_revision_before,
        entitlement_revision_after, entitlement_source_reference_before,
        entitlement_source_reference_after, result_code
      ) values (
        ${decision.id}::uuid, 'stale', ${Number(claim.fencing_version)},
        ${observedSnapshotSha256}, ${actual.revision}, ${actual.revision},
        ${actual.sourceReference}, ${actual.sourceReference}, ${resultCode}
      )
    `);
    await appendReconciliationAudit(tx, {
      organizationId: decision.organization_id,
      eventId: decision.webhook_event_id,
      actorUserId: decision.actor_user_id,
      requestId: decision.request_id,
      idempotencyKey: `${decision.id}:stale`,
      action: "saas_webhook.quarantine_resolution_stale",
      beforeState: { revision: actual.revision, sourceReference: actual.sourceReference },
      afterState: { revision: actual.revision, sourceReference: actual.sourceReference },
      metadata: { decisionId: decision.id, resultCode, observedSnapshotSha256 },
    });
    const finished = await tx.execute(sql`
      update zaltyko.organization_saas_webhook_events
      set status = 'quarantined', processed_at = null,
          lease_token = null, lease_until = null,
          last_error_code = 'reconciliation_stale',
          reconciliation_next_attempt_at = null
      where id = ${claim.id}::uuid and status = 'processing'
        and reconciliation_decision_id = ${decision.id}::uuid
        and lease_token = ${claim.lease_token}::uuid
        and fencing_version = ${claim.fencing_version}
        and lease_until > clock_timestamp()
      returning id
    `);
    if (finished.rows.length !== 1) {
      throw fail("VERSION_CONFLICT", "El lease venció antes del cierre stale", 409);
    }
    return true;
  });
}

export async function insertStaleWithinTransaction(
  tx: TransactionClient,
  claim: ClaimedEvent,
  decision: DecisionRecord,
  locked: {
    event: EventRecord;
    subscription: SubscriptionBaseline | null;
    entitlement: EntitlementBaseline | null;
  },
  observedSnapshotSha256: string | null,
  resultCode: string
): Promise<"stale"> {
  const actual = actualEntitlement(locked.entitlement);
  await tx.execute(sql`
    insert into zaltyko.organization_saas_webhook_reconciliation_results (
      decision_id, outcome, processor_fencing_version, observed_snapshot_sha256,
      entitlement_revision_before, entitlement_revision_after,
      entitlement_source_reference_before, entitlement_source_reference_after, result_code
    ) values (
      ${decision.id}::uuid, 'stale', ${Number(claim.fencing_version)},
      ${observedSnapshotSha256}, ${actual.revision}, ${actual.revision},
      ${actual.sourceReference}, ${actual.sourceReference}, ${resultCode}
    )
  `);
  await appendReconciliationAudit(tx, {
    organizationId: decision.organization_id,
    eventId: decision.webhook_event_id,
    actorUserId: decision.actor_user_id,
    requestId: decision.request_id,
    idempotencyKey: `${decision.id}:stale`,
    action: "saas_webhook.quarantine_resolution_stale",
    beforeState: { revision: actual.revision, sourceReference: actual.sourceReference },
    afterState: { revision: actual.revision, sourceReference: actual.sourceReference },
    metadata: { decisionId: decision.id, resultCode, observedSnapshotSha256 },
  });
  await finishEvent(tx, claim, decision, "quarantined", "reconciliation_stale");
  return "stale";
}

export async function finishAppliedWithinTransaction(
  tx: TransactionClient,
  claim: ClaimedEvent,
  decision: DecisionRecord,
  locked: { event: EventRecord; subscription: SubscriptionBaseline | null; entitlement: EntitlementBaseline | null },
  outcome: "applied" | "already_applied",
  resultCode: string,
  _now: Date
): Promise<"applied"> {
  const actual = actualEntitlement(locked.entitlement);
  await tx.execute(sql`
    insert into zaltyko.organization_saas_webhook_reconciliation_results (
      decision_id, outcome, processor_fencing_version, observed_snapshot_sha256,
      entitlement_revision_before, entitlement_revision_after,
      entitlement_source_reference_before, entitlement_source_reference_after, result_code
    ) values (
      ${decision.id}::uuid, ${outcome}, ${Number(claim.fencing_version)},
      ${decision.snapshot_sha256}, ${Number(decision.expected_entitlement_revision)},
      ${actual.revision}, ${decision.expected_entitlement_source_reference},
      ${actual.sourceReference}, ${resultCode}
    )
  `);
  await appendReconciliationAudit(tx, {
    organizationId: decision.organization_id,
    eventId: decision.webhook_event_id,
    actorUserId: decision.actor_user_id,
    requestId: decision.request_id,
    idempotencyKey: `${decision.id}:result`,
    action: "saas_webhook.quarantine_resolution_applied",
    beforeState: {
      revision: Number(decision.expected_entitlement_revision),
      sourceReference: decision.expected_entitlement_source_reference,
    },
    afterState: { revision: actual.revision, sourceReference: actual.sourceReference },
    metadata: { decisionId: decision.id, resultCode, outcome },
  });
  await finishEvent(tx, claim, decision, "processed", null);
  return "applied";
}
