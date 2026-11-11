/**
 * Signed preview token: HMAC-SHA256 over the deflated canonical claims
 * (`v1.<payload>.<signature>`), its verification and the claims of a
 * quarantined event.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { record, canonicalJson } from "./canonical";
import { fail } from "./errors";
import { resolutionFor, hashEvidence } from "./evidence";
import { PREVIEW_TTL_MS, EVIDENCE_TTL_MS, type SaasReconciliationDependencies, type EventRecord, type BaselineRecord, type SnapshotEvidence, type PreviewClaims } from "./model";

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function signingSecret(dependencies?: SaasReconciliationDependencies): string {
  const secret =
    dependencies?.signingSecret ??
    process.env.SAAS_RECONCILIATION_SIGNING_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw fail(
      "FEATURE_NOT_AVAILABLE",
      "La firma de previews de recuperación no está configurada",
      503
    );
  }
  return secret;
}

/**
 * @internal Solo para previewSaasReconciliation, que firma las claims de un
 * evento en cuarentena comprobado. Importa desde reconciliation-service.
 */
export function signToken(claims: PreviewClaims, secret: string): string {
  const payload = deflateRawSync(Buffer.from(canonicalJson(claims), "utf8"), {
    level: 9,
  }).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`saas-reconciliation-v1.${payload}`)
    .digest("base64url");
  return `v1.${payload}.${signature}`;
}

/**
 * @internal Solo para confirmSaasReconciliation: verificar la firma no basta,
 * la confirmación vuelve a comprobar el evento, la evidencia y la línea base
 * bajo bloqueo. Importa desde reconciliation-service.
 */
export function verifyToken(token: string, secret: string): PreviewClaims {
  if (token.length > 16_384) {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 400);
  }
  const [version, payload, providedSignature, extra] = token.split(".");
  if (version !== "v1" || !payload || !providedSignature || extra) {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 409, "PREVIEW_STALE");
  }
  const expected = createHmac("sha256", secret)
    .update(`saas-reconciliation-v1.${payload}`)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(providedSignature, "base64url");
  } catch {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 409, "PREVIEW_STALE");
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw fail("VERSION_CONFLICT", "La firma del preview no es válida", 409, "PREVIEW_STALE");
  }
  let value: unknown;
  try {
    const inflated = inflateRawSync(Buffer.from(payload, "base64url"), {
      maxOutputLength: 16_384,
    });
    value = JSON.parse(inflated.toString("utf8"));
  } catch {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 409, "PREVIEW_STALE");
  }
  const claims = record(value);
  if (
    claims?.version !== 1 ||
    typeof claims.actorUserId !== "string" ||
    typeof claims.eventId !== "string" ||
    typeof claims.organizationId !== "string" ||
    typeof claims.expiresAt !== "string" ||
    typeof claims.snapshotSha256 !== "string" ||
    !record(claims.event) ||
    !record(claims.baseline) ||
    !record(claims.evidence)
  ) {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 409, "PREVIEW_STALE");
  }
  return claims as unknown as PreviewClaims;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function claimsFrom(input: {
  event: EventRecord;
  baseline: BaselineRecord;
  evidence: SnapshotEvidence;
  actorUserId: string;
  requestId: string;
  now: Date;
}): PreviewClaims {
  const { event, baseline, evidence, actorUserId, requestId, now } = input;
  if (
    event.status !== "quarantined" ||
    event.last_error_code !== "ambiguous_event_order" ||
    !event.organization_id ||
    !event.provider_object_reference ||
    !event.event_created_at ||
    event.event_account_reference !== null
  ) {
    throw fail("INVALID_STATE_TRANSITION", "El evento no está en cuarentena recuperable", 409);
  }
  return {
    version: 1,
    actorUserId,
    eventId: event.id,
    organizationId: event.organization_id,
    requestId,
    resolutionKind: resolutionFor(event.event_type),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS).toISOString(),
    event: {
      providerAccountReference: event.provider_account_reference,
      environment: event.environment,
      providerEventId: event.provider_event_id,
      eventCreatedAt: event.event_created_at,
      providerObjectReference: event.provider_object_reference,
      payloadSha256: event.payload_sha256,
      eventType: event.event_type,
      fencingVersion: Number(event.fencing_version),
      lastErrorCode: event.last_error_code,
      previousDecisionId: event.reconciliation_decision_id,
    },
    baseline,
    evidence,
    evidenceObservedAt: now.toISOString(),
    executionExpiresAt: new Date(now.getTime() + EVIDENCE_TTL_MS).toISOString(),
    snapshotSha256: hashEvidence(evidence),
  };
}
