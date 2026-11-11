import { and, eq, sql } from "drizzle-orm";

import {
  classTemplates,
  locations,
  memberLocationScopes,
  sessions,
  type OrganizationMember,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { localDateInTimeZone } from "@/modules/athlete-progress/domain/athlete-progress";
import type { PlanMemberRole } from "@/modules/session-plans/domain/session-plan";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";

import { assertSessionPlanStorageAvailable } from "./storage";

/**
 * Autorización de la planificación (P2 #17, segunda parte). Uso interno: el
 * resto del código entra por la fachada session-plan-service.ts.
 *
 * Todo ocurre en servidor y dentro de la transacción:
 * - assertOperationalAccess: miembro activo, rol permitido y sede dentro de su
 *   alcance. El plan de la sesión usa el criterio de Pasar lista (la sede), no
 *   la asignación de la sesión (session_staff).
 * - la sede es de la academia y está activa;
 * - la sesión o la clase son de esa sede; otra sede u otra academia responden
 *   como inexistentes (404).
 * El plan en solo lectura se comprueba aparte, después de reconocer un
 * reintento idempotente. La app conecta como postgres con BYPASSRLS: RLS solo
 * es defensa en profundidad frente a clientes directos.
 */

export type ActorInput = { actor: OperationalActor };

export type Access = {
  member: OrganizationMember;
  role: PlanMemberRole;
  location: { id: string; timezone: string | null };
  /** null = todas las sedes de la academia. */
  visibleLocationIds: string[] | null;
};

export function notFound(message: string): OperationalError {
  return new OperationalError("NOT_FOUND", message, 404);
}

export function staleRevision(): OperationalError {
  return new OperationalError(
    "VERSION_CONFLICT",
    "Alguien ha cambiado el guion mientras lo editabas. Recarga para ver la última versión.",
    409
  );
}

export async function authorizeMember(
  tx: TransactionClient,
  input: {
    organizationId: string;
    locationId: string;
    actor: OperationalActor;
    allowedRoles: readonly PlanMemberRole[];
  }
): Promise<Access> {
  await assertSessionPlanStorageAvailable(tx);
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: input.allowedRoles,
  });
  // assertOperationalAccess no comprueba que la sede exista para quien tiene
  // todas las sedes: una sede de otra academia o desactivada no existe aquí.
  const [location] = await tx
    .select({ id: locations.id, timezone: locations.timezone })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, input.organizationId),
        eq(locations.id, input.locationId),
        eq(locations.isActive, true)
      )
    )
    .limit(1);
  if (!location) throw notFound("Sede no encontrada");

  let visibleLocationIds: string[] | null = null;
  if (member.locationScopeMode !== "all") {
    // unbounded-read-ok: las sedes asignadas a un miembro están acotadas por las sedes de su academia.
    const scoped = await tx
      .select({ locationId: memberLocationScopes.locationId })
      .from(memberLocationScopes)
      .where(
        and(
          eq(memberLocationScopes.organizationId, input.organizationId),
          eq(memberLocationScopes.memberId, member.id)
        )
      );
    visibleLocationIds = [...new Set(scoped.map((row) => row.locationId))].sort();
  }
  return { member, role: member.role as PlanMemberRole, location, visibleLocationIds };
}

export function isVisible(access: Access, locationId: string): boolean {
  return access.visibleLocationIds === null || access.visibleLocationIds.includes(locationId);
}

export type PlannedSession = {
  id: string;
  classTemplateId: string;
  startsAt: Date;
  status: string;
  sessionDate: string;
};

/** La sesión debe ser de la sede pedida; otra sede responde como inexistente. */
export async function loadSession(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; sessionId: string }
): Promise<PlannedSession> {
  const [session] = await tx
    .select({
      id: sessions.id,
      classTemplateId: sessions.classTemplateId,
      startsAt: sessions.startsAt,
      status: sessions.status,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.organizationId, input.organizationId),
        eq(sessions.locationId, access.location.id),
        eq(sessions.id, input.sessionId)
      )
    )
    .limit(1);
  if (!session) throw notFound("Sesión no encontrada");
  const startsAt = new Date(session.startsAt);
  return {
    id: session.id,
    classTemplateId: session.classTemplateId,
    startsAt,
    status: session.status,
    sessionDate: localDateInTimeZone(startsAt, access.location.timezone),
  };
}

/** La clase debe ser de la sede pedida; otra sede responde como inexistente. */
export async function loadClassAtLocation(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; classTemplateId: string }
): Promise<{ id: string }> {
  const [row] = await tx
    .select({ id: classTemplates.id })
    .from(classTemplates)
    .where(
      and(
        eq(classTemplates.organizationId, input.organizationId),
        eq(classTemplates.locationId, access.location.id),
        eq(classTemplates.id, input.classTemplateId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Clase no encontrada");
  return row;
}

export function assertSessionEditable(session: PlannedSession): void {
  if (session.status === "cancelled") {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "La sesión está cancelada: su guion es de solo lectura.",
      409
    );
  }
}

/**
 * Gimnastas que participan en la sesión, con el mismo criterio que una
 * observación vinculada a una sesión: inscripción en su clase o pertenencia a
 * un grupo de esa clase, vigentes en la fecha de la sesión. Solo gimnastas
 * activas. Acotado por la capacidad de la clase y sus grupos.
 */
export async function sessionParticipants(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; session: PlannedSession }
): Promise<Map<string, string>> {
  const day = input.session.sessionDate;
  const result = await tx.execute(sql`
    select athlete.id as athlete_id,
           btrim(person.given_name || ' ' || person.family_name) as athlete_name
      from zaltyko.athletes as athlete
      join zaltyko.people as person
        on person.organization_id = athlete.organization_id
       and person.id = athlete.person_id
     where athlete.organization_id = ${input.organizationId}::uuid
       and athlete.is_active
       and (
         exists (
           select 1 from zaltyko.enrollments as enrollment
            where enrollment.organization_id = athlete.organization_id
              and enrollment.location_id = ${input.locationId}::uuid
              and enrollment.athlete_id = athlete.id
              and enrollment.class_template_id = ${input.session.classTemplateId}::uuid
              and enrollment.starts_on <= ${day}::date
              and (enrollment.ends_on is null or enrollment.ends_on >= ${day}::date)
         )
         or exists (
           select 1
             from zaltyko.class_template_groups as class_group
             join zaltyko.group_memberships as membership
               on membership.organization_id = class_group.organization_id
              and membership.group_id = class_group.group_id
            where class_group.organization_id = athlete.organization_id
              and class_group.class_template_id = ${input.session.classTemplateId}::uuid
              and membership.athlete_id = athlete.id
              and membership.starts_on <= ${day}::date
              and (membership.ends_on is null or membership.ends_on >= ${day}::date)
         )
       )
     order by athlete_name, athlete.id
     limit 500
  `);
  return new Map(
    (result.rows as Array<{ athlete_id: string; athlete_name: string }>).map((row) => [
      row.athlete_id,
      row.athlete_name,
    ])
  );
}
