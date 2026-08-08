/**
 * Server-side consent gate (helper puro, sin I/O).
 *
 * Issue:    ZAL-158 [GTM-DEP.2] Consent gate tracking
 * Companion: src/lib/consent/state.ts (contrato read-only cliente)
 *
 * Este módulo es la implementación "server-side" del contrato público que
 * expone `state.ts` (getConsentSnapshot / subscribeConsent / hasAnalyticsConsent).
 * Por ahora solo expone helpers puros de validación + predicate de gating
 * (C1-C4); el wrapper sobre el cliente DB vive en un módulo aparte
 * (src/lib/consent/owner-consent-store.ts) que se crea en el corte 2.
 *
 * Criterios cubiertos:
 *  - Base: validación de `consent_proof`, `policy_version`, `source` (C3).
 *  - C1: predicate `granted_and_active` que compara con current_policy_version.
 *  - C2: el predicado se evalúa al momento (no cacheado).
 *  - C4: helper `appendAuditEvent` (lógica pura; I/O en store).
 */

import {
  CONSENT_AUDIT_EVENTS,
  CONSENT_SOURCES,
  CONSENT_STATES,
  type ConsentAuditEventDb,
  type ConsentSourceDb,
  type ConsentStateDb,
  type OwnerConsent,
} from "@/db/schema/owner-consent";

export const POLICY_VERSION_REGEX =
  /^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
export const CONSENT_PROOF_REGEX =
  /^(signup|claim|settings):[a-zA-Z0-9_-]{1,128}$/;
export const ACTOR_REGEX = /^(owner|system|admin):[a-zA-Z0-9_-]{1,128}$/;

/** MVP: imported queda fuera (C3). */
export function isAllowedSource(value: unknown): value is ConsentSourceDb {
  return (
    typeof value === "string" &&
    (CONSENT_SOURCES as readonly string[]).includes(value)
  );
}

export function isAllowedState(value: unknown): value is ConsentStateDb {
  return (
    typeof value === "string" &&
    (CONSENT_STATES as readonly string[]).includes(value)
  );
}

export function isAllowedAuditEvent(
  value: unknown
): value is ConsentAuditEventDb {
  return (
    typeof value === "string" &&
    (CONSENT_AUDIT_EVENTS as readonly string[]).includes(value)
  );
}

export function isValidPolicyVersion(value: unknown): value is string {
  return typeof value === "string" && POLICY_VERSION_REGEX.test(value);
}

export function isValidConsentProof(value: unknown): value is string {
  return typeof value === "string" && CONSENT_PROOF_REGEX.test(value);
}

export function isValidActor(value: unknown): value is string {
  return typeof value === "string" && ACTOR_REGEX.test(value);
}

/**
 * Predicate de gating (C1+C2, evaluado al momento del evento).
 *
 *  - Fila ausente → unset → retorna false (default-deny).
 *  - state !== 'granted' → revoked → false.
 *  - revoked_at != null → soft-revoke → false.
 *  - policy_version !== currentPolicyVersion → needs_re_consent → false.
 *
 * El "currentPolicyVersion" se evalúa desde `app_config` en el momento del
 * evento, no se cachea (C2: revocación efectiva inmediata).
 */
export function isConsentGrantedAndActive(
  consent: OwnerConsent | null | undefined,
  currentPolicyVersion: string
): boolean {
  if (!consent) return false;
  if (consent.state !== "granted") return false;
  if (consent.revokedAt !== null) return false;
  if (!isValidPolicyVersion(currentPolicyVersion)) return false;
  return consent.policyVersion === currentPolicyVersion;
}

/**
 * Valida que un consent_proof sea coherente con el source declarado.
 * (C3 — defensa contra typos y contra `imported` disfrazado.)
 */
export function assertConsentProofMatchesSource(
  source: ConsentSourceDb,
  consentProof: string
): void {
  if (!isValidConsentProof(consentProof)) {
    throw new Error(`invalid consent_proof: ${consentProof}`);
  }
  const expectedPrefix = `${source}:`;
  if (!consentProof.startsWith(expectedPrefix)) {
    throw new Error(
      `consent_proof prefix mismatch: expected ${expectedPrefix}*, got ${consentProof}`
    );
  }
}

/**
 * Tipo de evento a registrar en audit (C4).
 * Sin I/O — el módulo store es el que inserta la fila.
 */
export type AppendAuditEventInput = {
  ownerId: string;
  event: ConsentAuditEventDb;
  policyVersion: string;
  source: ConsentSourceDb;
  consentProof: string;
  actor: string;
  reason?: string | null;
  previousAuditId?: string | null;
};

/**
 * Valida semánticamente un AppendAuditEventInput antes de pasarlo al store.
 * Devuelve el input normalizado o lanza Error si algo no cumple C3/C4.
 */
export function validateAuditEventInput(
  input: AppendAuditEventInput
): AppendAuditEventInput {
  if (!input.ownerId || typeof input.ownerId !== "string") {
    throw new Error("ownerId required");
  }
  if (!isAllowedAuditEvent(input.event)) {
    throw new Error(`invalid event: ${input.event}`);
  }
  if (!isAllowedSource(input.source)) {
    throw new Error(`invalid source: ${input.source}`);
  }
  if (!isValidPolicyVersion(input.policyVersion)) {
    throw new Error(`invalid policy_version: ${input.policyVersion}`);
  }
  if (!isValidConsentProof(input.consentProof)) {
    throw new Error(`invalid consent_proof: ${input.consentProof}`);
  }
  if (!isValidActor(input.actor)) {
    throw new Error(`invalid actor: ${input.actor}`);
  }
  if (input.reason !== undefined && input.reason !== null) {
    if (typeof input.reason !== "string" || input.reason.length > 500) {
      throw new Error("reason must be string ≤500 chars");
    }
  }
  // event='revoke' o 'policy_bump' deberían traer reason, pero no lo exigimos
  // hard para mantener el helper tolerante; el caller decide.
  return {
    ownerId: input.ownerId,
    event: input.event,
    policyVersion: input.policyVersion,
    source: input.source,
    consentProof: input.consentProof,
    actor: input.actor,
    reason: input.reason ?? null,
    previousAuditId: input.previousAuditId ?? null,
  };
}
