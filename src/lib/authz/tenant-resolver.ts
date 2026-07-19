import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships } from "@/db/schema";
import { getCurrentProfile } from "./profile-service";

export interface TenantResolutionResult {
  tenantId: string | null;
  shouldUpdateProfile: boolean;
  newTenantId?: string;
  newActiveAcademyId?: string;
}

async function getAcademyTenantForUser({
  academyId,
  profile,
}: {
  academyId: string;
  profile: { id: string; userId: string; role: string };
}): Promise<string | null> {
  const [academy] = await db
    .select({ tenantId: academies.tenantId, ownerId: academies.ownerId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) return null;
  if (profile.role === "super_admin" || academy.ownerId === profile.id) {
    return academy.tenantId ?? null;
  }

  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.academyId, academyId),
        eq(memberships.userId, profile.userId)
      )
    )
    .limit(1);

  return membership ? (academy.tenantId ?? null) : null;
}

/**
 * Obtiene el tenantId de un usuario, intentando desde diferentes fuentes
 */
export async function getTenantId(
  userId: string,
  academyId?: string
): Promise<string | null> {
  const profile = await getCurrentProfile(userId);
  if (!profile) {
    return null;
  }

  // El academyId siempre se resuelve contra ownership o membership. Un rol
  // global `admin` no concede acceso transversal entre tenants.
  if (academyId) {
    return getAcademyTenantForUser({ academyId, profile });
  }

  // Fallback al tenantId del perfil
  return profile.tenantId ?? null;
}

/**
 * Resuelve el tenantId y determina si necesita actualizar el perfil
 */
export async function resolveTenantWithUpdate(
  userId: string,
  academyId: string | undefined,
  profile: { id: string; tenantId: string | null; role: string }
): Promise<TenantResolutionResult> {
  // Si no hay academyId, usar tenantId del perfil
  if (!academyId) {
    return {
      tenantId: profile.tenantId ?? null,
      shouldUpdateProfile: false,
    };
  }

  const academyTenantId = await getAcademyTenantForUser({
    academyId,
    profile: {
      ...profile,
      userId,
    },
  });

  if (!academyTenantId) {
    return {
      tenantId: null,
      shouldUpdateProfile: false,
    };
  }

  // Si el perfil no tiene tenantId pero la academia sí, necesitamos actualizar
  const shouldUpdate = !profile.tenantId;

  return {
    tenantId: academyTenantId,
    shouldUpdateProfile: shouldUpdate,
    newTenantId: academyTenantId,
    newActiveAcademyId: academyId,
  };
}
