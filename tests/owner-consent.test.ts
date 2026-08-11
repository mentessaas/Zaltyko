/**
 * Tests del helper server-side de consent (ZAL-158, corte 1).
 *
 * Issue:    ZAL-158 [GTM-DEP.2] Consent gate tracking
 * Companion: src/lib/consent/owner-consent.ts
 *
 * Cobertura objetivo: helpers puros (sin DB). El predicate de gating
 * (`isConsentGrantedAndActive`) y las validaciones de regex (C1-C4) son
 * lógica pura, no necesitan mock de DB.
 *
 * El test SQL real (constraints CHECK, trigger append-only, RLS) se valida
 * por separado con `pnpm test:rls:local` en PostgreSQL efímero.
 */

import { describe, it, expect } from "vitest";

import {
  ACTOR_REGEX,
  CONSENT_PROOF_REGEX,
  POLICY_VERSION_REGEX,
  assertConsentProofMatchesSource,
  isAllowedAuditEvent,
  isAllowedSource,
  isAllowedState,
  isConsentGrantedAndActive,
  isValidActor,
  isValidConsentProof,
  isValidPolicyVersion,
  validateAuditEventInput,
} from "@/lib/consent/owner-consent";

const VALID_POLICY = "v1-2026-08-01";

const baseConsent = {
  id: "00000000-0000-0000-0000-000000000001",
  ownerId: "00000000-0000-0000-0000-000000000010",
  state: "granted" as const,
  grantedAt: new Date("2026-08-01T00:00:00Z"),
  policyVersion: VALID_POLICY,
  source: "signup" as const,
  consentProof: "signup:form_abc123",
  revokedAt: null,
  revocationReason: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

describe("ZAL-158 — regex y enums (C3 source, formato)", () => {
  it("policy_version acepta vN-YYYY-MM-DD", () => {
    expect(isValidPolicyVersion("v1-2026-08-01")).toBe(true);
    expect(isValidPolicyVersion("v12-2026-12-31")).toBe(true);
    expect(isValidPolicyVersion("v1-8-1")).toBe(false);
    expect(isValidPolicyVersion("not-a-version")).toBe(false);
    expect(isValidPolicyVersion(null)).toBe(false);
    expect(isValidPolicyVersion(123)).toBe(false);
  });

  it("consent_proof acepta <source>:<id 1-128 chars [a-zA-Z0-9_-]>", () => {
    expect(isValidConsentProof("signup:form_abc123")).toBe(true);
    expect(isValidConsentProof("claim:00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isValidConsentProof("settings:change_42")).toBe(true);
    // Rechaza imported (MVP C3)
    expect(isValidConsentProof("imported:whatever")).toBe(false);
    // Rechaza id vacío
    expect(isValidConsentProof("signup:")).toBe(false);
    // Rechaza id >128 chars
    expect(isValidConsentProof(`signup:${"x".repeat(129)}`)).toBe(false);
    // Rechaza caracteres no permitidos
    expect(isValidConsentProof("signup:form abc")).toBe(false);
    expect(isValidConsentProof("signup:form/abc")).toBe(false);
  });

  it("actor acepta owner|system|admin:<id>", () => {
    expect(isValidActor("owner:00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isValidActor("system:policy_bump")).toBe(true);
    expect(isValidActor("admin:00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isValidActor("hacker:foo")).toBe(false);
    expect(isValidActor("owner:")).toBe(false);
  });

  it("source acepta solo {signup,claim,settings} en MVP", () => {
    expect(isAllowedSource("signup")).toBe(true);
    expect(isAllowedSource("claim")).toBe(true);
    expect(isAllowedSource("settings")).toBe(true);
    expect(isAllowedSource("imported")).toBe(false);
    expect(isAllowedSource("unknown")).toBe(false);
    expect(isAllowedSource(null)).toBe(false);
  });

  it("state acepta solo {granted,revoked}", () => {
    expect(isAllowedState("granted")).toBe(true);
    expect(isAllowedState("revoked")).toBe(true);
    expect(isAllowedState("unset")).toBe(false);
    expect(isAllowedState(null)).toBe(false);
  });

  it("audit event acepta solo {grant,revoke,policy_bump,re_grant}", () => {
    expect(isAllowedAuditEvent("grant")).toBe(true);
    expect(isAllowedAuditEvent("revoke")).toBe(true);
    expect(isAllowedAuditEvent("policy_bump")).toBe(true);
    expect(isAllowedAuditEvent("re_grant")).toBe(true);
    expect(isAllowedAuditEvent("delete")).toBe(false);
  });
});

describe("ZAL-158 — isConsentGrantedAndActive (C1+C2 predicate)", () => {
  it("fila ausente → false (default-deny)", () => {
    expect(isConsentGrantedAndActive(null, VALID_POLICY)).toBe(false);
    expect(isConsentGrantedAndActive(undefined, VALID_POLICY)).toBe(false);
  });

  it("state=granted + revoked_at=null + policy actual → true", () => {
    expect(isConsentGrantedAndActive(baseConsent, VALID_POLICY)).toBe(true);
  });

  it("state=revoked → false aunque revoked_at sea null (no debería pasar pero defensa)", () => {
    expect(
      isConsentGrantedAndActive(
        { ...baseConsent, state: "revoked" },
        VALID_POLICY
      )
    ).toBe(false);
  });

  it("revoked_at != null → false (soft-revoke)", () => {
    expect(
      isConsentGrantedAndActive(
        { ...baseConsent, revokedAt: new Date() },
        VALID_POLICY
      )
    ).toBe(false);
  });

  it("policy_version != current → false (C1 re-consent)", () => {
    expect(isConsentGrantedAndActive(baseConsent, "v2-2026-09-01")).toBe(false);
  });

  it("current_policy_version inválido → false (defensive)", () => {
    expect(isConsentGrantedAndActive(baseConsent, "garbage")).toBe(false);
  });
});

describe("ZAL-158 — assertConsentProofMatchesSource (C3 consistencia)", () => {
  it("acepta proof con prefijo == source", () => {
    expect(() =>
      assertConsentProofMatchesSource("signup", "signup:form_abc")
    ).not.toThrow();
    expect(() =>
      assertConsentProofMatchesSource("claim", "claim:claim-uuid")
    ).not.toThrow();
  });

  it("rechaza proof con prefijo != source", () => {
    expect(() =>
      assertConsentProofMatchesSource("signup", "claim:foo")
    ).toThrow(/prefix mismatch/);
    expect(() =>
      assertConsentProofMatchesSource("settings", "signup:foo")
    ).toThrow(/prefix mismatch/);
  });

  it("rechaza proof con formato inválido", () => {
    expect(() =>
      assertConsentProofMatchesSource("signup", "garbage")
    ).toThrow(/invalid consent_proof/);
    expect(() =>
      assertConsentProofMatchesSource("signup", "imported:foo")
    ).toThrow(/invalid consent_proof/);
  });
});

describe("ZAL-158 — validateAuditEventInput (C4 audit log)", () => {
  const baseInput = {
    ownerId: "00000000-0000-0000-0000-000000000001",
    event: "grant" as const,
    policyVersion: VALID_POLICY,
    source: "signup" as const,
    consentProof: "signup:form_abc123",
    actor: "owner:00000000-0000-0000-0000-000000000001",
  };

  it("input válido se normaliza", () => {
    const out = validateAuditEventInput(baseInput);
    expect(out).toEqual({
      ...baseInput,
      reason: null,
      previousAuditId: null,
    });
  });

  it("input con reason explícito se preserva", () => {
    const out = validateAuditEventInput({ ...baseInput, reason: "user_revoked" });
    expect(out.reason).toBe("user_revoked");
  });

  it("rechaza event inválido", () => {
    expect(() =>
      validateAuditEventInput({ ...baseInput, event: "delete" as never })
    ).toThrow(/invalid event/);
  });

  it("rechaza source inválido (C3 imported)", () => {
    expect(() =>
      validateAuditEventInput({ ...baseInput, source: "imported" as never })
    ).toThrow(/invalid source/);
  });

  it("rechaza policy_version con formato inválido", () => {
    expect(() =>
      validateAuditEventInput({ ...baseInput, policyVersion: "v1-8-1" })
    ).toThrow(/invalid policy_version/);
  });

  it("rechaza consent_proof con formato inválido", () => {
    expect(() =>
      validateAuditEventInput({ ...baseInput, consentProof: "garbage" })
    ).toThrow(/invalid consent_proof/);
  });

  it("rechaza actor con formato inválido", () => {
    expect(() =>
      validateAuditEventInput({ ...baseInput, actor: "hacker:foo" })
    ).toThrow(/invalid actor/);
  });

  it("rechaza reason >500 chars", () => {
    expect(() =>
      validateAuditEventInput({ ...baseInput, reason: "x".repeat(501) })
    ).toThrow(/reason must be string ≤500 chars/);
  });

  it("rechaza ownerId vacío", () => {
    expect(() =>
      validateAuditEventInput({ ...baseInput, ownerId: "" })
    ).toThrow(/ownerId required/);
  });
});

describe("ZAL-158 — constantes exportadas", () => {
  it("regex exportadas son las esperadas", () => {
    expect(POLICY_VERSION_REGEX.source).toBe(
      "^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$"
    );
    expect(CONSENT_PROOF_REGEX.source).toBe(
      "^(signup|claim|settings):[a-zA-Z0-9_-]{1,128}$"
    );
    expect(ACTOR_REGEX.source).toBe(
      "^(owner|system|admin):[a-zA-Z0-9_-]{1,128}$"
    );
  });
});
