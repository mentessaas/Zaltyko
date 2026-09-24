import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { actorConsents, athletes } from "@/db/schema";

/**
 * Reglas duras de consentimiento para atletas.
 *
 * <13 años  → BLOQUEO: actor_pages.public_visible forzado a false (no publicable)
 * 13-15     → REQUIERE actor_consents.granted_at con consentScope='public_page'
 * 16-17     → idem, o consentimiento del propio atleta
 * ≥18       → libre
 *
 * Implementación server-side. La UI no debe permitir bypass.
 */

export type ConsentDecision = {
  canPublish: boolean;
  reason: string;
  /** Si requiere acción del guardian antes de publicar */
  requiresGuardianConsent: boolean;
};

function calculateAge(dob: Date | string | null): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Devuelve la decisión de consentimiento para un atleta dado su DOB.
 * La página actor_pages NO debe poder saltarse esta comprobación.
 */
export async function evaluateAthleteConsent(
  athleteId: string
): Promise<ConsentDecision> {
  const [athlete] = await db
    .select({ dob: athletes.dob })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athlete) {
    return {
      canPublish: false,
      reason: "athlete_not_found",
      requiresGuardianConsent: false,
    };
  }

  const age = calculateAge(athlete.dob);

  // Sin DOB: exigimos consentimiento por defecto (más conservador).
  if (age === null) {
    return {
      canPublish: false,
      reason: "dob_missing_requires_consent",
      requiresGuardianConsent: true,
    };
  }

  // <13: BLOQUEO total
  if (age < 13) {
    return {
      canPublish: false,
      reason: `age_${age}_blocked_by_policy`,
      requiresGuardianConsent: false,
    };
  }

  // 13-17: requiere consentimiento explícito (guardian o atleta)
  if (age < 18) {
    const hasConsent = await hasGrantedPublicConsent(athleteId);
    return {
      canPublish: hasConsent,
      reason: hasConsent
        ? "guardian_consent_granted"
        : `age_${age}_requires_consent`,
      requiresGuardianConsent: !hasConsent,
    };
  }

  // ≥18: libre
  return {
    canPublish: true,
    reason: "adult_self_authored",
    requiresGuardianConsent: false,
  };
}

/**
 * ¿Hay al menos un consent granted activo para publicar la página del atleta?
 * Solo cuenta consents sin revocar y sin expirar.
 */
export async function hasGrantedPublicConsent(
  athleteId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: actorConsents.id })
    .from(actorConsents)
    .innerJoin(
      sql`actor_pages`,
      sql`${actorConsents.actorPageId} = ${sql.raw("actor_pages.id")}`
    )
    .where(
      and(
        eq(actorConsents.consentScope, "public_page"),
        eq(sql`actor_pages.entity_type`, "athlete"),
        eq(sql`actor_pages.entity_id`, athleteId),
        sql`${actorConsents.grantedAt} IS NOT NULL`,
        isNull(actorConsents.revokedAt),
        sql`(${actorConsents.expiresAt} IS NULL OR ${actorConsents.expiresAt} > ${todayIsoDate()})`
      )
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Revoca todos los consents activos de un actor_page.
 * Usado cuando un guardian retira consentimiento o cuando el atleta cumple mayoría
 * de edad (en ese caso se llama a una variante que solo limpia, no revoca).
 */
export async function revokeAllConsentsForPage(
  actorPageId: string,
  reason: string
): Promise<number> {
  const result = await db
    .update(actorConsents)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(
      and(
        eq(actorConsents.actorPageId, actorPageId),
        isNull(actorConsents.revokedAt)
      )
    );
  return Number((result as { rowCount?: number }).rowCount ?? 0);
}
