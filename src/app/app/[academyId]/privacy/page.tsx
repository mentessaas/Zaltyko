import { and, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { actorConsents, actorPages, athletes } from "@/db/schema";
import { PrivacyConsentManager } from "@/components/actor-page-editor/PrivacyConsentManager";
import { getCurrentUser } from "@/lib/auth/current-user";
import { evaluateAthleteConsent } from "@/lib/actor-pages/consent";

/**
 * Página de privacidad para familias/guardians.
 * Lista los atletas del user actual que tienen actor_pages activas y permite:
 *   - ver el estado de consentimiento
 *   - firmar (granted) si falta
 *   - revocar
 *
 * Ruta: /app/[academyId]/privacy
 *
 * Sprint 3.5: en lugar de un solo academyId, esta pantalla debería ser
 * multi-academia (todas las del guardian). Por ahora se filtra por academyId.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const rows = await db
    .select({
      athleteId: athletes.id,
      athleteName: athletes.name,
      athleteDob: athletes.dob,
      pageId: actorPages.id,
      pageSlug: actorPages.publicSlug,
      pageVisible: actorPages.publicVisible,
      consentStatus: actorPages.consentStatus,
    })
    .from(athletes)
    .innerJoin(
      actorPages,
      and(
        eq(actorPages.entityType, "athlete"),
        eq(actorPages.entityId, athletes.id)
      )
    )
    .where(
      and(
        eq(athletes.academyId, academyId),
        eq(athletes.userId, user.id)
      )
    )
    .limit(50);

  const enriched = await Promise.all(
    rows.map(async (r) => {
      const decision = await evaluateAthleteConsent(r.athleteId);
      const consents = await db
        .select()
        .from(actorConsents)
        .where(
          and(
            eq(actorConsents.actorPageId, r.pageId),
            eq(actorConsents.guardianUserId, user.id)
          )
        );
      // Convertir `Date` → `string` (ISO) para el componente PrivacyConsentManager
      const consentsSerialized = consents.map((c) => ({
        ...c,
        grantedAt: c.grantedAt.toISOString(),
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
        revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
      }));
      return { ...r, decision, consents: consentsSerialized };
    })
  );

  return <PrivacyConsentManager items={enriched} />;
}
