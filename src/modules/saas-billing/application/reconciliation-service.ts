/**
 * Public facade of the SaaS webhook reconciliation. Routes, crons and tests
 * import from here; the implementation lives in ./reconciliation/:
 *
 * - model.ts          public inputs, records, claims and TTLs
 * - errors.ts         fail() and the public error codes
 * - canonical.ts      canonical JSON, SHA-256, value parsers, request hash
 * - validation.ts     UUIDs, request id, idempotency key, reason
 * - preview-token.ts  signed preview token and its claims
 * - runtime.ts        Stripe configuration, provider and clock
 * - evidence.ts       Stripe evidence, canonical price, snapshot hash
 * - reads.ts          event, baseline and decision reads
 * - operator.ts       platform operator check (legacy profiles table)
 * - audit.ts          audit entries
 * - preview.ts        previewSaasReconciliation
 * - confirm.ts        confirmSaasReconciliation
 * - lease.ts          lease and fencing of a claimed event
 * - outcomes.ts       stale and applied outcomes
 * - apply.ts          status snapshot and paid invoice grant
 * - consumer.ts       consumeSaasReconciliationBatch
 */
export type {
  ConfirmSaasReconciliationInput,
  ConsumeSaasReconciliationBatchInput,
  PreviewSaasReconciliationInput,
  SaasReconciliationDependencies,
  StripeReconciliationProvider,
} from "./reconciliation/model";
export { createSaasReconciliationRequestHash } from "./reconciliation/canonical";
export { normalizeSaasReconciliationReason } from "./reconciliation/validation";
export { previewSaasReconciliation } from "./reconciliation/preview";
export { confirmSaasReconciliation } from "./reconciliation/confirm";
export { consumeSaasReconciliationBatch } from "./reconciliation/consumer";
