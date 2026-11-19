import { sql } from "drizzle-orm";

import type { OrganizationMember } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { SKILL_ROLES, type SkillMemberRole } from "@/modules/skill-levels/domain/skill-levels";

import { assertElementLibraryAvailable } from "./storage";

/**
 * Autorización de la biblioteca. Uso interno: el resto del código entra por la
 * fachada element-library-service.ts.
 *
 * Dentro de la transacción de cada operación: la función existe (banderas y
 * tablas), miembro activo de la academia con rol del equipo técnico
 * (dirección, administración, coordinación y entrenadores: SKILL_ROLES), sede
 * de su alcance y activa y, en escrituras, plan fuera de solo lectura. Las
 * familias no son miembros del equipo: no entran (ADR-0029 §2.2).
 */

export type ActorInput = { actor: OperationalActor };

export type LibraryAccess = { member: OrganizationMember; role: SkillMemberRole };

export function notFound(message = "No encontrado"): OperationalError {
  return new OperationalError("NOT_FOUND", message, 404);
}

export async function authorizeLibraryMember(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; actor: OperationalActor; intent?: "write" }
): Promise<LibraryAccess> {
  await assertElementLibraryAvailable(tx);
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: SKILL_ROLES,
    intent: input.intent,
  });
  // assertOperationalAccess no comprueba que la sede exista para quien tiene
  // todas las sedes: una sede de otra academia o desactivada no existe aquí.
  const location = await tx.execute(sql`
    select 1 as present from zaltyko.locations
    where organization_id = ${input.organizationId}::uuid
      and id = ${input.locationId}::uuid
      and is_active
    limit 1
  `);
  if (location.rows.length === 0) throw notFound("Sede no encontrada");
  return { member, role: member.role as SkillMemberRole };
}

/** El plan en solo lectura se consulta, pero no se escribe. */
export async function isOrganizationWritable(tx: TransactionClient, organizationId: string): Promise<boolean> {
  try {
    await assertOrganizationOperationalWritable(tx, organizationId);
    return true;
  } catch (error) {
    if (error instanceof OperationalError && error.code === "PLAN_OVER_CAPACITY") return false;
    throw error;
  }
}
