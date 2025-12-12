import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Obtiene los emails del personal interno de una academia
 */
export async function getInternalStaffEmails(academyId: string): Promise<string[]> {
  const recipients = await db
    .select({
      userId: profiles.userId,
      name: profiles.name,
    })
    .from(memberships)
    .innerJoin(profiles, eq(memberships.userId, profiles.userId))
    .where(eq(memberships.academyId, academyId));

  const adminClient = getSupabaseAdminClient();
  const emails: string[] = [];

  for (const recipient of recipients) {
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(recipient.userId);
      if (authUser?.user?.email) {
        emails.push(authUser.user.email);
      }
    } catch (error) {
      logger.error(`Error obteniendo email para usuario ${recipient.userId}`, error as Error, { userId: recipient.userId });
    }
  }

  return Array.from(new Set(emails)); // Eliminar duplicados
}

/**
 * Obtiene los emails de contacto de academias en la misma ubicación
 */
export async function getAcademiesEmailsByLocation(
  academyId: string,
  locationType: "city" | "province" | "country"
): Promise<string[]> {
  // Obtener la academia organizadora para conocer su ubicación
  const [organizingAcademy] = await db
    .select({
      country: academies.country,
      region: academies.region,
      city: academies.city,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!organizingAcademy) {
    return [];
  }

  // Construir filtros según el tipo de ubicación
  const filters: ReturnType<typeof eq | typeof sql>[] = [
    eq(academies.isSuspended, false),
    sql`${academies.id} != ${academyId}`, // Excluir la academia organizadora
  ];

  if (locationType === "country" && organizingAcademy.country) {
    const normalizedCountry = organizingAcademy.country.trim().toLowerCase();
    filters.push(sql`LOWER(TRIM(${academies.country})) = LOWER(TRIM(${normalizedCountry}))`);
  } else if (locationType === "province" && organizingAcademy.region) {
    const normalizedRegion = organizingAcademy.region.trim().toLowerCase();
    filters.push(sql`LOWER(TRIM(${academies.region})) = LOWER(TRIM(${normalizedRegion}))`);
  } else if (locationType === "city" && organizingAcademy.city) {
    const normalizedCity = organizingAcademy.city.trim().toLowerCase();
    filters.push(sql`LOWER(TRIM(${academies.city})) = LOWER(TRIM(${normalizedCity}))`);
  } else {
    return []; // No hay ubicación para filtrar
  }

  // Obtener academias en la misma ubicación
  const targetAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
      contactEmail: academies.contactEmail,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(and(...filters));

  const emails: string[] = [];

  // Obtener emails de contacto de las academias
  for (const academy of targetAcademies) {
    // Priorizar email de contacto de la academia
    if (academy.contactEmail) {
      emails.push(academy.contactEmail);
    } else {
      // Si no hay email de contacto, obtener email del owner
      const [ownerProfile] = await db
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.id, academy.ownerId))
        .limit(1);

      if (ownerProfile) {
        try {
          const adminClient = getSupabaseAdminClient();
          const { data: authUser } = await adminClient.auth.admin.getUserById(ownerProfile.userId);
          if (authUser?.user?.email) {
            emails.push(authUser.user.email);
          }
        } catch (error) {
          logger.error(`Error obteniendo email del owner de academia ${academy.id}`, error as Error, { academyId: academy.id, ownerId: academy.ownerId });
        }
      }
    }
  }

  return Array.from(new Set(emails)); // Eliminar duplicados
}

