import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { actorPages, actorConsents, type ActorPage } from "@/db/schema";

/**
 * Servicio de páginas públicas por actor (academia, coach, atleta, proveedor).
 *
 * Sprint 1: lectura pública + helpers para backfill.
 * Sprint 2 añadirá: editor, permisos por actor, validaciones de consentimiento.
 *
 * Reglas de lectura pública:
 *   - actor_pages.public_visible = true
 *   - actor_pages.published_at IS NOT NULL
 *   - si entity_type='athlete' y consent_status='revoked' → no se muestra
 */

export type ActorType = "academy" | "coach" | "athlete" | "supplier";

export type PublicActorPage = Pick<
  ActorPage,
  | "id"
  | "entityType"
  | "entityId"
  | "publicSlug"
  | "displayName"
  | "tagline"
  | "bioBlocks"
  | "photoUrl"
  | "contactEmail"
  | "contactPhone"
  | "socialLinks"
  | "theme"
  | "seoTitle"
  | "seoDescription"
  | "seoImageUrl"
  | "language"
  | "publishedAt"
>;

/**
 * Resuelve una página pública por su slug.
 * Devuelve null si no existe, está oculta, no está publicada o está bloqueada.
 */
export async function getPublicPageBySlug(
  slug: string
): Promise<PublicActorPage | null> {
  const [row] = await db
    .select({
      id: actorPages.id,
      entityType: actorPages.entityType,
      entityId: actorPages.entityId,
      publicSlug: actorPages.publicSlug,
      displayName: actorPages.displayName,
      tagline: actorPages.tagline,
      bioBlocks: actorPages.bioBlocks,
      photoUrl: actorPages.photoUrl,
      contactEmail: actorPages.contactEmail,
      contactPhone: actorPages.contactPhone,
      socialLinks: actorPages.socialLinks,
      theme: actorPages.theme,
      seoTitle: actorPages.seoTitle,
      seoDescription: actorPages.seoDescription,
      seoImageUrl: actorPages.seoImageUrl,
      language: actorPages.language,
      publishedAt: actorPages.publishedAt,
    })
    .from(actorPages)
    .where(
      and(
        eq(actorPages.publicSlug, slug),
        eq(actorPages.publicVisible, true),
        sql`${actorPages.publishedAt} IS NOT NULL`,
        sql`${actorPages.blockedAt} IS NULL`,
        // atletas con consentimiento revocado nunca son públicos
        sql`(${actorPages.entityType} <> 'athlete' OR ${actorPages.consentStatus} <> 'revoked')`
      )
    )
    .limit(1);

  return row ?? null;
}

/**
 * Cuenta cuántas páginas públicas hay por tipo de actor.
 * Útil para landing y métricas de adopción.
 */
export async function countPublicPages(): Promise<
  Record<ActorType, number>
> {
  const rows = await db
    .select({
      entityType: actorPages.entityType,
      n: sql<number>`count(*)::int`,
    })
    .from(actorPages)
    .where(
      and(
        eq(actorPages.publicVisible, true),
        sql`${actorPages.publishedAt} IS NOT NULL`
      )
    )
    .groupBy(actorPages.entityType);

  const out: Record<ActorType, number> = {
    academy: 0,
    coach: 0,
    athlete: 0,
    supplier: 0,
  };
  for (const r of rows) {
    out[r.entityType as ActorType] = r.n;
  }
  return out;
}
