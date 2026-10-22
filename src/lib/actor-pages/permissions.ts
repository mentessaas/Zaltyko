import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { actorPages, academies, coaches, athletes, suppliers } from "@/db/schema";

import type { CurrentUser } from "@/lib/auth/current-user";

/**
 * Permisos para editar una actor_page.
 *
 * Reglas:
 *   - admin (cualquier tipo) → puede editar cualquier página
 *   - academia: owner es el userId que coincide con academies.ownerId (que apunta
 *       a profiles.id, no userId — necesitamos buscar profiles.user_id = auth.uid)
 *   - coach: userId o profile_id del coach coincide con auth.uid
 *   - athlete: athletes.user_id = auth.uid (campo profile-linked)
 *   - supplier: suppliers.owner_user_id = auth.uid
 *
 * Sprint 1: implementación simple basada en ownership directo.
 * Sprint 2: añadir jerarquía (academy owner puede editar coaches/atletas de su academia).
 */
export async function canEditActorPage(
  user: CurrentUser,
  page: typeof actorPages.$inferSelect
): Promise<boolean> {
  if (!user?.id) return false;

  if (page.entityType === "academy") {
    const [row] = await db
      .select({ ownerId: academies.ownerId })
      .from(academies)
      .innerJoin(
        sql`profiles`,
        sql`${sql.raw("profiles.id")} = ${academies.ownerId}`
      )
      .where(
        sql`(${academies.id} = ${page.entityId} AND profiles.user_id = ${user.id})`
      )
      .limit(1);
    if (row) return true;
  }

  if (page.entityType === "coach") {
    const [row] = await db
      .select({ id: coaches.id })
      .from(coaches)
      .leftJoin(
        sql`profiles`,
        sql`${sql.raw("profiles.id")} = ${coaches.profileId}`
      )
      .where(
        sql`(${coaches.id} = ${page.entityId} AND (${coaches.userId} = ${user.id} OR profiles.user_id = ${user.id}))`
      )
      .limit(1);
    if (row) return true;
  }

  if (page.entityType === "athlete") {
    const [row] = await db
      .select({ id: athletes.id })
      .from(athletes)
      .leftJoin(
        sql`profiles`,
        sql`${sql.raw("profiles.user_id")} = ${athletes.userId}`
      )
      .where(
        sql`(${athletes.id} = ${page.entityId} AND profiles.user_id = ${user.id})`
      )
      .limit(1);
    if (row) return true;
    // Alternativa: el user actual es guardian del atleta.
    // Sprint 3 implementará la lógica completa de guardianes.
  }

  if (page.entityType === "supplier") {
    const [row] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        sql`(${suppliers.id} = ${page.entityId} AND ${suppliers.ownerUserId} = ${user.id})`
      )
      .limit(1);
    if (row) return true;
  }

  return false;
}

/**
 * Devuelve la actor_page del entity dado, o null si no existe.
 * Útil para que el editor la encuentre o la cree bajo demanda.
 */
export async function getActorPageByEntity(
  entityType: "academy" | "coach" | "athlete" | "supplier",
  entityId: string
) {
  const [row] = await db
    .select()
    .from(actorPages)
    .where(
      sql`${actorPages.entityType} = ${entityType} AND ${actorPages.entityId} = ${entityId}`
    )
    .limit(1);
  return row ?? null;
}
