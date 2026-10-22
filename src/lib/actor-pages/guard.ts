import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current-user";

/**
 * Comprueba que el user actual es owner del academy dado.
 * Devuelve true / false. No lanza.
 *
 * IMPORTANTE: esta es la versión simple basada en profiles.userId === auth.uid
 * + academies.ownerId === profiles.id. Sprint 2.5 deberá revisar si hay roles
 * adicionales (admin_staff, manager) que también deban tener acceso.
 */
export async function assertAcademyOwner(
  academyId: string,
  user: CurrentUser
): Promise<boolean> {
  if (!user?.id) return false;
  const [row] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(
      and(
        eq(academies.id, academyId),
        sql`${sql.raw("profiles.user_id")} = ${user.id}`
      )
    )
    .limit(1);
  return Boolean(row);
}
