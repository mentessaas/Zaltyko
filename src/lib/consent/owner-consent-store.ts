import type { User } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { ownerConsent, ownerConsentAudit } from "@/db/schema";
import {
  assertConsentProofMatchesSource,
  isValidPolicyVersion,
  isValidConsentProof,
} from "@/lib/consent/owner-consent";

type ConsentMetadata = {
  legal_consent_version?: unknown;
  legal_consent_proof?: unknown;
};

/**
 * Persiste el consentimiento contractual del owner una sola vez.
 *
 * user_metadata solo sirve como transporte desde Auth: es editable por el
 * usuario y nunca se usa para autorizar operaciones. La fuente de verdad es
 * owner_consent + owner_consent_audit, protegidos por sus restricciones SQL.
 */
export async function recordOwnerSignupConsent(user: User): Promise<
  "absent" | "recorded" | "already_recorded"
> {
  const metadata = (user.user_metadata ?? {}) as ConsentMetadata;
  const policyVersion = metadata.legal_consent_version;
  const consentProof = metadata.legal_consent_proof;

  // Mantiene compatibilidad con cuentas creadas antes del gate. Las nuevas
  // altas llevan ambos campos desde RegisterForm y pasan por la ruta estricta.
  if (policyVersion === undefined && consentProof === undefined) return "absent";

  if (!isValidPolicyVersion(policyVersion) || !isValidConsentProof(consentProof)) {
    throw new Error("invalid signup consent metadata");
  }
  assertConsentProofMatchesSource("signup", consentProof);

  const config = await db.execute(sql`
    select value
    from app_config
    where key = 'consent.policy_version'
    limit 1
  `);
  const currentPolicyVersion = (config as unknown as Array<{ value?: string }>)[0]?.value;
  if (currentPolicyVersion !== policyVersion) {
    throw new Error("signup consent policy version is not current");
  }

  const [created] = await db
    .insert(ownerConsent)
    .values({
      ownerId: user.id,
      state: "granted",
      policyVersion,
      source: "signup",
      consentProof,
    })
    .onConflictDoNothing({ target: ownerConsent.ownerId })
    .returning({ id: ownerConsent.id });

  if (!created) return "already_recorded";

  await db.insert(ownerConsentAudit).values({
    ownerId: user.id,
    event: "grant",
    policyVersion,
    source: "signup",
    consentProof,
    actor: `owner:${user.id}`,
  });

  return "recorded";
}
