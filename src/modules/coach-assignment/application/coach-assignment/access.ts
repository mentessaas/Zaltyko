import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import {
  COACH_ASSIGNMENT_MANAGER_ROLES,
  COACH_ASSIGNMENT_READER_ROLES,
  addedStaffProfileIds,
  type CoachAssignmentRole,
} from "@/modules/coach-assignment/domain/coach-assignment";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";

import { eligibleCoaches } from "./queries";

/**
 * Autorización de la asignación de entrenadoras. Cada operación la repite
 * dentro de su transacción, aunque la ruta ya haya resuelto el alcance:
 * - Leer y cambiar titulares: dirección, administración y coordinación con
 *   acceso a la sede de la clase.
 * - Leer una sesión: además, la entrenadora de esa sede. Fuera de su sede,
 *   una sesión responde igual que una inexistente.
 * - Cambiar una sesión: solo dirección, administración y coordinación.
 * - Toda escritura pasa por el modo solo lectura del plan (intent "write").
 */

export type ClassTemplateRow = {
  id: string;
  locationId: string;
  status: string;
};

export type SessionRow = {
  id: string;
  locationId: string;
  classTemplateId: string;
  status: "scheduled" | "completed" | "cancelled";
  startsAt: string;
};

export async function loadClassTemplate(
  tx: TransactionClient,
  input: { organizationId: string; classTemplateId: string; locationId?: string | null }
): Promise<ClassTemplateRow> {
  const result = await tx.execute(sql`
    select id::text, location_id::text, status::text
    from zaltyko.class_templates
    where organization_id = ${input.organizationId}::uuid
      and id = ${input.classTemplateId}::uuid
  `);
  const row = result.rows[0] as { id: string; location_id: string; status: string } | undefined;
  if (!row || row.status === "archived" || (input.locationId && row.location_id !== input.locationId.toLowerCase())) {
    throw new OperationalError("NOT_FOUND", "Clase no encontrada", 404);
  }
  return { id: row.id, locationId: row.location_id, status: row.status };
}

export async function loadSession(
  tx: TransactionClient,
  input: { organizationId: string; sessionId: string; locationId: string; forUpdate?: boolean }
): Promise<SessionRow> {
  const result = await tx.execute(sql`
    select id::text, location_id::text, class_template_id::text, status::text,
      to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as starts_at
    from zaltyko.sessions
    where organization_id = ${input.organizationId}::uuid
      and id = ${input.sessionId}::uuid
      and location_id = ${input.locationId}::uuid
    ${input.forUpdate ? sql`for update` : sql``}
  `);
  const row = result.rows[0] as
    | { id: string; location_id: string; class_template_id: string; status: SessionRow["status"]; starts_at: string }
    | undefined;
  if (!row) throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
  return {
    id: row.id,
    locationId: row.location_id,
    classTemplateId: row.class_template_id,
    status: row.status,
    startsAt: row.starts_at,
  };
}

/**
 * Rol de gestión en la academia, antes de cargar la clase: quien no es de la
 * academia o no gestiona recibe 403 tanto si la clase existe como si no.
 */
export async function assertManagerMembership(
  tx: TransactionClient,
  input: { organizationId: string; actor: OperationalActor }
): Promise<void> {
  const result = await tx.execute(sql`
    select 1
    from zaltyko.organization_members
    where organization_id = ${input.organizationId}::uuid
      and id = ${input.actor.memberId}::uuid
      and user_id = ${input.actor.userId}::uuid
      and status = 'active'
      and role in ('owner', 'admin', 'manager')
  `);
  if (result.rows.length === 0) {
    throw new OperationalError("FORBIDDEN", "El miembro no puede ejecutar esta operación", 403);
  }
}

/** Dirección, administración o coordinación con acceso a la sede. */
export async function assertManagerAccess(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; actor: OperationalActor; intent?: "write" }
): Promise<{ memberId: string; role: CoachAssignmentRole }> {
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: COACH_ASSIGNMENT_MANAGER_ROLES,
    ...(input.intent ? { intent: input.intent } : {}),
  });
  return { memberId: member.id, role: member.role as CoachAssignmentRole };
}

/**
 * Acceso de gestión a una clase concreta. Si la sede de la clase queda fuera
 * del alcance, se responde como si la clase no existiera (404): una
 * coordinación con sedes seleccionadas no distingue clases ajenas de
 * inexistentes.
 */
export async function assertClassManagerAccess(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; actor: OperationalActor; intent?: "write" }
): Promise<{ memberId: string; role: CoachAssignmentRole }> {
  try {
    return await assertManagerAccess(tx, input);
  } catch (error) {
    if (error instanceof OperationalError && error.code === "LOCATION_SCOPE_DENIED") {
      throw new OperationalError("NOT_FOUND", "Clase no encontrada", 404);
    }
    throw error;
  }
}

/**
 * Lectura de una sesión. A una entrenadora fuera de su sede se le responde
 * como si la sesión no existiera, igual que en Pasar lista.
 */
export async function assertSessionReader(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; actor: OperationalActor }
): Promise<{ memberId: string; role: CoachAssignmentRole }> {
  try {
    const member = await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      allowedRoles: COACH_ASSIGNMENT_READER_ROLES,
    });
    return { memberId: member.id, role: member.role as CoachAssignmentRole };
  } catch (error) {
    if (error instanceof OperationalError && error.code === "LOCATION_SCOPE_DENIED") {
      const coach = await tx.execute(sql`
        select 1 from zaltyko.organization_members
        where organization_id = ${input.organizationId}::uuid
          and id = ${input.actor.memberId}::uuid
          and role = 'coach'
      `);
      if (coach.rows.length > 0) throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
    }
    throw error;
  }
}

/**
 * Solo se pueden añadir entrenadoras del equipo con rol entrenador y acceso a
 * la sede. Quitar siempre se puede, aunque la persona ya no tenga acceso.
 */
export async function assertAdditionsEligible(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; current: readonly string[]; target: readonly string[] }
): Promise<void> {
  const added = addedStaffProfileIds(input.current, input.target);
  if (added.length === 0) return;
  const eligible = await eligibleCoaches(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    onlyIds: added,
  });
  if (eligible.length !== added.length) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Solo puedes asignar entrenadoras del equipo con acceso a esta sede.",
      422
    );
  }
}

export function staleAssignment(): OperationalError {
  return new OperationalError(
    "VERSION_CONFLICT",
    "Otra persona cambió las entrenadoras mientras editabas. Revisa la lista actual y vuelve a guardar.",
    409
  );
}
