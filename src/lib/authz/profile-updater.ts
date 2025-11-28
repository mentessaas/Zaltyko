import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { ProfileRow } from "./profile-service";

/**
 * Actualiza el perfil con tenantId y activeAcademyId si es necesario
 */
export async function updateProfileIfNeeded(
  profile: ProfileRow,
  tenantId: string | null,
  activeAcademyId: string | undefined
): Promise<ProfileRow> {
  // Si el perfil ya tiene tenantId, no necesitamos actualizar
  if (profile.tenantId) {
    return profile;
  }

  // Si no hay tenantId para actualizar, retornar perfil sin cambios
  if (!tenantId) {
    return profile;
  }

  try {
    await db
      .update(profiles)
      .set({
        tenantId,
        activeAcademyId: activeAcademyId ?? undefined,
      })
      .where(eq(profiles.id, profile.id));

    // Actualizar el objeto en memoria
    return {
      ...profile,
      tenantId,
      activeAcademyId: activeAcademyId ?? profile.activeAcademyId ?? null,
    };
  } catch (error) {
    logger.warn("Failed to update profile with tenantId", {
      error,
      profileId: profile.id,
      tenantId,
      activeAcademyId,
    });
    // Retornar perfil sin cambios si falla la actualización
    return profile;
  }
}

