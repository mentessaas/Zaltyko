import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { actorPages, academies, athletes, coaches, suppliers } from "@/db/schema";
import { ActorPageEditor } from "@/components/actor-page-editor/ActorPageEditor";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEditActorPage } from "@/lib/actor-pages/permissions";
import type { EntityType } from "@/lib/actor-pages/blocks-config";

/**
 * Helper server-side compartido para las 4 páginas de editor:
 *   /app/[academyId]/public-page
 *   /app/coach/[id]/public-page
 *   /app/athlete/[id]/public-page
 *   /app/supplier/[id]/public-page
 *
 * Resuelve la entity por tipo+id, busca o crea la actor_page si no existe,
 * valida permisos y monta el editor con la página precargada.
 *
 * Si el entity no existe → 404.
 * Si el user no es owner → 404 (no leak de existencia).
 */
export async function EditorPageServer({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: string;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();

  let ownerClause: ReturnType<typeof eq> | undefined;

  if (entityType === "academy") {
    const [row] = await db
      .select({ id: academies.id, ownerId: academies.ownerId })
      .from(academies)
      .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
      .where(sql`${academies.id} = ${entityId} AND ${sql.raw("profiles.user_id")} = ${user.id}`)
      .limit(1);
    if (!row) notFound();
  } else if (entityType === "coach") {
    const [row] = await db
      .select({ id: coaches.id })
      .from(coaches)
      .leftJoin(sql`profiles`, sql`${coaches.profileId} = ${sql.raw("profiles.id")}`)
      .where(
        sql`${coaches.id} = ${entityId} AND (${coaches.userId} = ${user.id} OR ${sql.raw("profiles.user_id")} = ${user.id})`
      )
      .limit(1);
    if (!row) notFound();
  } else if (entityType === "athlete") {
    const [row] = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(sql`${athletes.id} = ${entityId} AND ${athletes.userId} = ${user.id}`)
      .limit(1);
    if (!row) notFound();
  } else if (entityType === "supplier") {
    const [row] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(sql`${suppliers.id} = ${entityId} AND ${suppliers.ownerUserId} = ${user.id}`)
      .limit(1);
    if (!row) notFound();
  }

  // Buscar la actor_page existente
  const [page] = await db
    .select()
    .from(actorPages)
    .where(
      and(
        eq(actorPages.entityType, entityType),
        eq(actorPages.entityId, entityId)
      )
    )
    .limit(1);

  const safePage = page
    ? {
        ...page,
        bioBlocks: Array.isArray(page.bioBlocks)
          ? (page.bioBlocks as Array<Record<string, unknown>>)
          : [],
        socialLinks:
          page.socialLinks &&
          typeof page.socialLinks === "object" &&
          !Array.isArray(page.socialLinks)
            ? (page.socialLinks as Record<string, string>)
            : {},
        publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
      }
    : null;

  // Permiso final a través de canEditActorPage
  if (safePage) {
    const allowed = await canEditActorPage(user, safePage as unknown as Parameters<typeof canEditActorPage>[1]);
    if (!allowed) notFound();
  }

  return (
    <ActorPageEditor
      entityType={entityType}
      entityId={entityId}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialPage={safePage as any}
    />
  );
}
