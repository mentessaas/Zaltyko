/**
 * previewSaasReconciliation: validates the operator and the quarantined
 * event, observes Stripe and signs a preview.
 */
import { fail } from "./errors";
import { resolutionFor, retrieveProviderEvidence } from "./evidence";
import type { ResolutionKind, PreviewSaasReconciliationInput, SaasReconciliationDependencies, SnapshotEvidence } from "./model";
import { assertOperator } from "./operator";
import { signingSecret, signToken, claimsFrom } from "./preview-token";
import { readEvent, hasStaleResult } from "./reads";
import { getRuntime } from "./runtime";
import { assertUuid, validateRequestId } from "./validation";

export async function previewSaasReconciliation(
  input: PreviewSaasReconciliationInput,
  dependencies?: SaasReconciliationDependencies
): Promise<{
  previewToken: string;
  expiresAt: string;
  event: { id: string; type: string; createdAt: string; objectReference: string };
  resolutionKind: ResolutionKind;
  snapshotSha256: string;
  evidence: SnapshotEvidence;
}> {
  assertUuid(input.eventId, "eventId");
  assertUuid(input.actorUserId, "actorUserId");
  validateRequestId(input.requestId);
  await assertOperator(input.actorUserId);
  const runtime = getRuntime(dependencies);
  const event = await readEvent(input.eventId);
  const resolutionKind = resolutionFor(event.event_type);
  if (
    event.provider_account_reference !== runtime.config.providerAccountReference ||
    event.environment !== runtime.config.environment
  ) {
    throw fail("NOT_FOUND", "Evento no encontrado en la cuenta SaaS configurada", 404);
  }
  if (
    event.status !== "quarantined" ||
    event.last_error_code !== "ambiguous_event_order" ||
    (event.reconciliation_decision_id &&
      !(await hasStaleResult(event.reconciliation_decision_id)))
  ) {
    throw fail("INVALID_STATE_TRANSITION", "El evento no está disponible para un nuevo preview", 409);
  }
  const { evidence, baseline } = await retrieveProviderEvidence({
    event,
    config: runtime.config,
    provider: runtime.provider,
  });
  const now = runtime.now();
  const claims = claimsFrom({
    event,
    baseline,
    evidence,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    now,
  });
  const token = signToken(claims, signingSecret(dependencies));
  return {
    previewToken: token,
    expiresAt: claims.expiresAt,
    event: {
      id: event.id,
      type: event.event_type,
      createdAt: event.event_created_at as string,
      objectReference: event.provider_object_reference as string,
    },
    resolutionKind,
    snapshotSha256: claims.snapshotSha256,
    evidence,
  };
}
