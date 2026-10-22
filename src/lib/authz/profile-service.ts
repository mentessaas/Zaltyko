import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles } from "@/db/schema";

export type ProfileRow = typeof profiles.$inferSelect;

/**
 * Obtiene el perfil actual de un usuario
 */
export async function getCurrentProfile(userId: string): Promise<ProfileRow | null> {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  
  return profile ?? null;
}

