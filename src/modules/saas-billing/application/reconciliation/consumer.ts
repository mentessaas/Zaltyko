/**
 * consumeSaasReconciliationBatch: claims leased events (skip locked) and
 * processes each decision in order.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { applyDecision } from "./apply";
import { objectRows } from "./canonical";
import { fail } from "./errors";
import { retrieveProviderEvidence, hashEvidence } from "./evidence";
import { scheduleRetry } from "./lease";
import { LEASE_TTL_MS, MAX_BATCH_SIZE, type ConsumeSaasReconciliationBatchInput, type SaasReconciliationDependencies, type EventRecord, type SnapshotEvidence, type ClaimedEvent, type Runtime } from "./model";
import { closeStaleDecision } from "./outcomes";
import { readEvent, readDecision } from "./reads";
import { getRuntime } from "./runtime";

export async function consumeSaasReconciliationBatch(
  input: ConsumeSaasReconciliationBatchInput = {},
  dependencies?: SaasReconciliationDependencies
): Promise<{ claimed: number; applied: number; stale: number; retrying: number; leaseLost: number }> {
  const batchSize = input.batchSize ?? 10;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw fail("VERSION_CONFLICT", `batchSize debe estar entre 1 y ${MAX_BATCH_SIZE}`, 400);
  }
  const claimedRows = await db.execute(sql`
    with candidates as (
      select id, status as candidate_status, lease_until as candidate_lease_until,
        gen_random_uuid() as lease_token
      from zaltyko.organization_saas_webhook_events
      where reconciliation_decision_id is not null
        and (
          (status in ('received', 'failed')
            and (reconciliation_next_attempt_at is null
              or reconciliation_next_attempt_at <= clock_timestamp()))
          or (status = 'processing' and lease_until <= clock_timestamp())
        )
      order by reconciliation_next_attempt_at nulls first, received_at
      for update skip locked
      limit ${batchSize}
    )
    update zaltyko.organization_saas_webhook_events event
    set status = 'processing',
        lease_token = candidates.lease_token,
        lease_until = clock_timestamp() + ${LEASE_TTL_MS} * interval '1 millisecond',
        fencing_version = event.fencing_version + 1,
        attempts = event.attempts + 1,
        reconciliation_next_attempt_at = null,
        last_error_code = null
    from candidates
    where event.id = candidates.id
      and event.status = candidates.candidate_status
      and event.reconciliation_decision_id is not null
      and (
        (candidates.candidate_status in ('received', 'failed')
          and (event.reconciliation_next_attempt_at is null
            or event.reconciliation_next_attempt_at <= clock_timestamp()))
        or (candidates.candidate_status = 'processing'
          and event.lease_until = candidates.candidate_lease_until
          and event.lease_until <= clock_timestamp())
      )
    returning event.id, event.reconciliation_decision_id as decision_id,
      event.lease_token, event.lease_until::text as lease_until,
      event.fencing_version, event.attempts
  `);
  const claims = objectRows<ClaimedEvent>(claimedRows);
  const counts = { claimed: claims.length, applied: 0, stale: 0, retrying: 0, leaseLost: 0 };
  for (const claim of claims) {
    const decision = await readDecision(claim.decision_id);
    if (!decision) {
      counts.leaseLost += 1;
      continue;
    }
    const now = (dependencies?.now ?? (() => new Date()))();
    if (Date.parse(decision.execution_expires_at) <= now.getTime()) {
      const closed = await closeStaleDecision(claim, decision, null, "evidence_expired");
      if (closed) counts.stale += 1;
      else counts.leaseLost += 1;
      continue;
    }
    let runtime: Runtime;
    let event: EventRecord;
    let evidence: SnapshotEvidence;
    try {
      runtime = getRuntime(dependencies);
      event = await readEvent(decision.webhook_event_id);
      const resolved = await retrieveProviderEvidence({
        event,
        config: runtime.config,
        provider: runtime.provider,
        fallbackInvoicePlanCode: decision.invoice_plan_code,
      });
      evidence = resolved.evidence;
    } catch {
      const retried = await scheduleRetry(claim, decision);
      if (retried) counts.retrying += 1;
      else counts.leaseLost += 1;
      continue;
    }
    if (hashEvidence(evidence) !== decision.snapshot_sha256) {
      const staleClosed = await closeStaleDecision(
        claim,
        decision,
        hashEvidence(evidence),
        "provider_snapshot_changed"
      );
      if (staleClosed) counts.stale += 1;
      else counts.leaseLost += 1;
      continue;
    }
    const applied = await applyDecision(claim, decision, evidence, runtime.now());
    if (applied === "applied") counts.applied += 1;
    else if (applied === "stale") counts.stale += 1;
    else if (applied === "retrying") counts.retrying += 1;
    else counts.leaseLost += 1;
  }
  return counts;
}
