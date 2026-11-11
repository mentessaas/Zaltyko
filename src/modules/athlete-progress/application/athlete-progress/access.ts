import { and, eq, inArray, sql, type SQL } from "drizzle-orm";

import {
  athletes,
  enrollments,
  locations,
  memberLocationScopes,
  people,
  sessions,
  type OrganizationMember,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  localDateInTimeZone,
  PROGRESS_ROLES,
  type ProgressMemberRole,
} from "@/modules/athlete-progress/domain/athlete-progress";
import {
  athleteObjectives,
  athleteObservations,
} from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";

import { assertAthleteProgressStorageAvailable } from "./storage";

/**
 * Autorización de objetivos y observaciones (P2 #17). Uso interno: el resto
 * del código entra por la fachada athlete-progress-service.ts.
 *
 * Toda la autorización ocurre en servidor y dentro de la transacción:
 * - assertOperationalAccess: miembro activo de la academia, rol permitido,
 *   sede dentro de su alcance y, en escrituras, plan fuera de solo lectura.
 * - la sede es de la academia y está activa;
 * - la gimnasta es de la academia y está vinculada a la sede pedida. Para el
 *   entrenador el vínculo es el de Pasar lista: inscripción o grupo ABIERTO en
 *   esa sede. La dirección también ve gimnastas con historial en la sede.
 * - cada registro guarda la sede desde la que se creó; quien solo tiene
 *   algunas sedes ve únicamente los registros de esas sedes.
 * La app conecta como postgres con BYPASSRLS: RLS es solo defensa en
 * profundidad frente a clientes directos.
 */

export type ActorInput = { actor: OperationalActor };

export type Access = {
  member: OrganizationMember;
  role: ProgressMemberRole;
  location: { id: string; timezone: string | null };
  /** null = todas las sedes de la academia. */
  visibleLocationIds: string[] | null;
};

export type AthleteAccess = Access & {
  athlete: { id: string; name: string; isActive: boolean };
};

const OPEN_ENROLLMENT_STATUSES = ["pending", "trial", "active", "paused"] as const;
const OPEN_GROUP_MEMBERSHIP_STATUSES = ["pending", "active", "paused"] as const;

export function notFound(message = "Gimnasta no encontrada"): OperationalError {
  return new OperationalError("NOT_FOUND", message, 404);
}

export function idempotencyConflict(): OperationalError {
  return new OperationalError(
    "IDEMPOTENCY_CONFLICT",
    "Esta petición ya se usó con otros datos. Recarga y vuelve a intentarlo.",
    409
  );
}

export async function authorizeMember(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; actor: OperationalActor }
): Promise<Access> {
  await assertAthleteProgressStorageAvailable(tx);
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: PROGRESS_ROLES,
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
  return { member, role: member.role as ProgressMemberRole, location, visibleLocationIds };
}

function inList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  );
}

async function isAthleteLinkedToLocation(
  tx: TransactionClient,
  input: { organizationId: string; athleteId: string; locationId: string; openOnly: boolean }
): Promise<boolean> {
  const enrollmentFilter = input.openOnly
    ? sql`and enrollment.status in (${inList(OPEN_ENROLLMENT_STATUSES)})`
    : sql``;
  const membershipFilter = input.openOnly
    ? sql`and membership.status in (${inList(OPEN_GROUP_MEMBERSHIP_STATUSES)})`
    : sql``;
  const attendanceLink = input.openOnly
    ? sql`false`
    : sql`exists (
        select 1 from zaltyko.attendance_records as attendance
        where attendance.organization_id = ${input.organizationId}::uuid
          and attendance.athlete_id = ${input.athleteId}::uuid
          and attendance.location_id = ${input.locationId}::uuid
      )`;
  const result = await tx.execute(sql`
    select (
      exists (
        select 1 from zaltyko.enrollments as enrollment
        where enrollment.organization_id = ${input.organizationId}::uuid
          and enrollment.athlete_id = ${input.athleteId}::uuid
          and enrollment.location_id = ${input.locationId}::uuid
          ${enrollmentFilter}
      )
      or exists (
        select 1
        from zaltyko.group_memberships as membership
        join zaltyko.groups as academy_group
          on academy_group.organization_id = membership.organization_id
         and academy_group.id = membership.group_id
        where membership.organization_id = ${input.organizationId}::uuid
          and membership.athlete_id = ${input.athleteId}::uuid
          and academy_group.location_id = ${input.locationId}::uuid
          ${membershipFilter}
      )
      or ${attendanceLink}
    ) as linked
  `);
  return (result.rows[0] as { linked?: unknown } | undefined)?.linked === true;
}

export async function authorizeAthlete(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; athleteId: string; intent: "read" | "write" }
): Promise<AthleteAccess> {
  const [athlete] = await tx
    .select({
      id: athletes.id,
      isActive: athletes.isActive,
      givenName: people.givenName,
      familyName: people.familyName,
    })
    .from(athletes)
    .innerJoin(people, and(eq(people.organizationId, athletes.organizationId), eq(people.id, athletes.personId)))
    .where(and(eq(athletes.organizationId, input.organizationId), eq(athletes.id, input.athleteId)))
    .limit(1);
  if (!athlete) throw notFound();
  const isCoach = access.role === "coach";
  // Una gimnasta archivada no existe para el entrenador; la dirección conserva
  // la lectura del historial, pero nadie puede escribir.
  if (!athlete.isActive && isCoach) throw notFound();
  if (!athlete.isActive && input.intent === "write") {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "La gimnasta está archivada: sus objetivos y observaciones son de solo lectura.",
      409
    );
  }
  const linked = await isAthleteLinkedToLocation(tx, {
    organizationId: input.organizationId,
    athleteId: input.athleteId,
    locationId: access.location.id,
    openOnly: isCoach,
  });
  if (!linked) throw notFound("La gimnasta no está vinculada a esta sede");
  return {
    ...access,
    athlete: {
      id: athlete.id,
      name: `${athlete.givenName} ${athlete.familyName}`.trim(),
      isActive: athlete.isActive,
    },
  };
}

export function isVisible(access: Access, locationId: string): boolean {
  return access.visibleLocationIds === null || access.visibleLocationIds.includes(locationId);
}

export function visibleFilter(
  access: Access,
  column: typeof athleteObjectives.locationId | typeof athleteObservations.locationId
): SQL | undefined {
  if (access.visibleLocationIds === null) return undefined;
  if (access.visibleLocationIds.length === 0) return sql`false`;
  return inArray(column, access.visibleLocationIds);
}

/* ------------------------------------------------------------------------ */
/* Sesiones                                                                  */
/* ------------------------------------------------------------------------ */

export type SessionAtLocation = { id: string; classTemplateId: string; sessionDate: string };

/** La sesión debe ser de la sede pedida; otra sede responde como inexistente. */
export async function loadSessionAtLocation(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; sessionId: string }
): Promise<SessionAtLocation> {
  const [session] = await tx
    .select({ id: sessions.id, classTemplateId: sessions.classTemplateId, startsAt: sessions.startsAt })
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
  return {
    id: session.id,
    classTemplateId: session.classTemplateId,
    sessionDate: localDateInTimeZone(new Date(session.startsAt), access.location.timezone),
  };
}

/** La inscripción debe ser de la clase de esa sesión y de su sede. */
export async function athleteOfSessionEnrollment(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; enrollmentId: string; session: SessionAtLocation }
): Promise<string> {
  const [enrollment] = await tx
    .select({ athleteId: enrollments.athleteId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.id, input.enrollmentId),
        eq(enrollments.locationId, access.location.id),
        eq(enrollments.classTemplateId, input.session.classTemplateId)
      )
    )
    .limit(1);
  if (!enrollment) throw notFound("Inscripción no encontrada en esta sesión");
  return enrollment.athleteId;
}

/**
 * Una observación vinculada a una sesión exige que la gimnasta participara en
 * ella: inscripción en su clase, o pertenencia a un grupo de esa clase,
 * vigentes en la fecha de la sesión.
 */
export async function assertAthleteInSession(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; athleteId: string; session: SessionAtLocation }
): Promise<void> {
  const day = input.session.sessionDate;
  const result = await tx.execute(sql`
    select (
      exists (
        select 1 from zaltyko.enrollments as enrollment
        where enrollment.organization_id = ${input.organizationId}::uuid
          and enrollment.location_id = ${input.locationId}::uuid
          and enrollment.athlete_id = ${input.athleteId}::uuid
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
        where class_group.organization_id = ${input.organizationId}::uuid
          and class_group.class_template_id = ${input.session.classTemplateId}::uuid
          and membership.athlete_id = ${input.athleteId}::uuid
          and membership.starts_on <= ${day}::date
          and (membership.ends_on is null or membership.ends_on >= ${day}::date)
      )
    ) as participates
  `);
  if ((result.rows[0] as { participates?: unknown } | undefined)?.participates !== true) {
    throw new OperationalError(
      "INVALID_RELATION",
      "La gimnasta no participa en esa sesión.",
      422
    );
  }
}
