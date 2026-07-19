import { and, eq } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  academies,
  athletes,
  classes,
  coaches,
  events,
  groups,
} from "@/db/schema";

/**
 * Generic entity validator - validates that an entity exists and belongs to the tenant
 */
export async function validateEntity<T extends PgTable>(
  table: T,
  id: string,
  tenantId: string,
  selectFields?: Record<string, any>
): Promise<(typeof table.$inferSelect) | null> {
  const [entity] = await db
    .select(selectFields as any)
    .from(table as any)
    .where(and(eq((table as any).id, id), eq((table as any).tenantId, tenantId)))
    .limit(1);

  return entity as any;
}

/**
 * Validates an academy exists and belongs to the tenant
 */
export async function validateAcademy(academyId: string, tenantId: string) {
  return validateEntity(academies, academyId, tenantId);
}

/**
 * Validates an athlete exists and belongs to the tenant
 */
export async function validateAthlete(athleteId: string, tenantId: string) {
  return validateEntity(athletes, athleteId, tenantId);
}

/**
 * Validates a class exists and belongs to the tenant
 */
export async function validateClass(classId: string, tenantId: string) {
  return validateEntity(classes, classId, tenantId);
}

/**
 * Validates a coach exists and belongs to the tenant
 */
export async function validateCoach(coachId: string, tenantId: string) {
  return validateEntity(coaches, coachId, tenantId);
}

/**
 * Validates an event exists and belongs to the tenant
 */
export async function validateEvent(eventId: string, tenantId: string) {
  return validateEntity(events, eventId, tenantId);
}

/**
 * Validates a group exists and belongs to the tenant
 */
export async function validateGroup(groupId: string, tenantId: string) {
  return validateEntity(groups, groupId, tenantId);
}
