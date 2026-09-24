import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles } from "@/db/schema";

/**
 * Comprueba si el user actual tiene rol super_admin de Zaltyko.
 * Usado para acciones de mediación, moderación global y admin del SaaS.
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: profiles.role, isSuspended: profiles.isSuspended })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row?.role === "super_admin" && !row.isSuspended;
}
