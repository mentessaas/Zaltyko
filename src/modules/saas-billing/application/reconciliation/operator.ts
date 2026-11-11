/**
 * Platform operator check. The only module that reads the legacy profiles
 * table (reviewed exception in tests/canonical-schema-boundary.test.ts).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
// eslint-disable-next-line no-restricted-imports -- platform identity: the super-admin role and suspension live only in the legacy profiles table.
import { profiles } from "@/db/schema/profiles";
import { fail } from "./errors";

export async function assertOperator(actorUserId: string): Promise<void> {
  const [profile] = await db
    .select({ role: profiles.role, isSuspended: profiles.isSuspended })
    .from(profiles)
    .where(eq(profiles.userId, actorUserId))
    .limit(1);
  if (!profile || profile.role !== "super_admin" || profile.isSuspended) {
    throw fail("FORBIDDEN", "Se requiere un operador de plataforma activo", 403);
  }
}
