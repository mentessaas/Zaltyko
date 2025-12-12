import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { athletes, classes, groups, academies } from "@/db/schema";
import type { LimitResource } from "./errors";

/**
 * Obtiene el conteo actual de atletas en una academia
 */
export async function getAthleteCount(
  academyId: string,
  tenantId: string
): Promise<number> {
  const [{ value: athleteCount }] = await db
    .select({ value: count() })
    .from(athletes)
    .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, tenantId)));

  return Number(athleteCount ?? 0);
}

/**
 * Obtiene el conteo actual de clases en una academia
 */
export async function getClassCount(
  academyId: string,
  tenantId: string
): Promise<number> {
  const [{ value: classCount }] = await db
    .select({ value: count() })
    .from(classes)
    .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, tenantId)));

  return Number(classCount ?? 0);
}

/**
 * Obtiene el conteo actual de grupos en una academia
 */
export async function getGroupCount(
  academyId: string,
  tenantId: string
): Promise<number> {
  const [{ value: groupCount }] = await db
    .select({ value: count() })
    .from(groups)
    .where(and(eq(groups.academyId, academyId), eq(groups.tenantId, tenantId)));

  return Number(groupCount ?? 0);
}

/**
 * Obtiene el conteo actual de academias de un usuario
 */
export async function getAcademyCount(ownerId: string): Promise<number> {
  const ownedAcademies = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.ownerId, ownerId));

  return ownedAcademies.length;
}

/**
 * Obtiene el conteo actual de un recurso específico
 */
export async function getResourceCount(
  resource: LimitResource,
  academyId: string,
  tenantId: string,
  ownerId?: string
): Promise<number> {
  switch (resource) {
    case "athletes":
      return getAthleteCount(academyId, tenantId);
    case "classes":
      return getClassCount(academyId, tenantId);
    case "groups":
      return getGroupCount(academyId, tenantId);
    case "academies":
      if (!ownerId) {
        throw new Error("ownerId is required for academies resource");
      }
      return getAcademyCount(ownerId);
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}

