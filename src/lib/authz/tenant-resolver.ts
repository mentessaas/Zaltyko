import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { getCurrentProfile } from "./profile-service";

export interface TenantResolutionResult {
  tenantId: string | null;
  shouldUpdateProfile: boolean;
  newTenantId?: string;
  newActiveAcademyId?: string;
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

  const isAdmin = profile.role === "admin" || profile.role === "super_admin";

  // Si hay academyId, intentar obtener tenantId desde la academia
  // Esto funciona para admins y también para owners que acaban de crear su academia
  if (academyId) {
    const [academy] = await db
      .select({ tenantId: academies.tenantId, ownerId: academies.ownerId })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (academy) {
      // Si es admin o es el owner de la academia, usar el tenantId de la academia
      if (isAdmin || academy.ownerId === profile.id) {
        return academy.tenantId ?? null;
      }
    }
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
  const isAdmin = profile.role === "super_admin" || profile.role === "admin";
  
  // Si no hay academyId, usar tenantId del perfil
  if (!academyId) {
    return {
      tenantId: profile.tenantId ?? null,
      shouldUpdateProfile: false,
    };
  }

  // Obtener información de la academia
  const [academy] = await db
    .select({ tenantId: academies.tenantId, ownerId: academies.ownerId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    return {
      tenantId: profile.tenantId ?? null,
      shouldUpdateProfile: false,
    };
  }

  // Verificar acceso a la academia
  const hasAccess = isAdmin || academy.ownerId === profile.id;
  if (!hasAccess) {
    return {
      tenantId: profile.tenantId ?? null,
      shouldUpdateProfile: false,
    };
  }

  // Si el perfil no tiene tenantId pero la academia sí, necesitamos actualizar
  const shouldUpdate = !profile.tenantId && academy.tenantId !== null;

  return {
    tenantId: academy.tenantId ?? profile.tenantId ?? null,
    shouldUpdateProfile: shouldUpdate,
    newTenantId: academy.tenantId ?? undefined,
    newActiveAcademyId: academyId,
  };
}

