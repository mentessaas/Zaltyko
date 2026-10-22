import { and, count, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";
import { athletes, classes, groups, academies } from "@/db/schema";
import type { LimitResource } from "./errors";

/**
 * Obtiene el conteo actual de atletas en una academia
 */
export async function getAthleteCount(
  academyId: string,
  tenantId: string,
  client: DatabaseClient = db
): Promise<number> {
  // unbounded-read-ok: aggregate count scoped to one academy and tenant
  const [{ value: athleteCount }] = await client
    .select({ value: count() })
    .from(athletes)
    .where(
      and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        isNull(athletes.deletedAt),
      ),
    );

  return Number(athleteCount ?? 0);
}

/**
 * Obtiene el conteo actual de clases en una academia
 */
export async function getClassCount(
  academyId: string,
  tenantId: string,
  client: DatabaseClient = db
): Promise<number> {
  // unbounded-read-ok: aggregate count scoped to one academy and tenant
  const [{ value: classCount }] = await client
    .select({ value: count() })
    .from(classes)
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, tenantId),
        isNull(classes.deletedAt),
      ),
    );

  return Number(classCount ?? 0);
}

/**
 * Obtiene el conteo actual de grupos en una academia
 */
export async function getGroupCount(
  academyId: string,
  tenantId: string,
  client: DatabaseClient = db
): Promise<number> {
  // unbounded-read-ok: aggregate count scoped to one academy and tenant
  const [{ value: groupCount }] = await client
    .select({ value: count() })
    .from(groups)
    .where(
      and(
        eq(groups.academyId, academyId),
        eq(groups.tenantId, tenantId),
        isNull(groups.deletedAt),
      ),
    );

  return Number(groupCount ?? 0);
}

/**
 * Obtiene el conteo actual de academias de un usuario
 */
export async function getAcademyCount(ownerId: string): Promise<number> {
  // unbounded-read-ok: aggregate count scoped to one owner
  const [{ value: academyCount }] = await db
    .select({ value: count() })
    .from(academies)
    .where(eq(academies.ownerId, ownerId));

  return Number(academyCount ?? 0);
}

/**
 * Obtiene el conteo actual de un recurso específico
 */
export async function getResourceCount(
  resource: LimitResource,
  academyId: string,
  tenantId: string,
  ownerId?: string,
  client: DatabaseClient = db
): Promise<number> {
  switch (resource) {
    case "athletes":
      return getAthleteCount(academyId, tenantId, client);
    case "classes":
      return getClassCount(academyId, tenantId, client);
    case "groups":
      return getGroupCount(academyId, tenantId, client);
    case "academies":
      if (!ownerId) {
        throw new Error("ownerId is required for academies resource");
      }
      return getAcademyCount(ownerId);
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}
