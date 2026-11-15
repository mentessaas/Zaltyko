import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";

import {
  athletes,
  locations,
  organizationMembers,
  people,
  sessions,
  staffProfiles,
  type OrganizationMember,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  canManageTemplates,
  localDateInTimeZone,
  MAX_ROSTER_ATHLETES,
  SKILL_ROLES,
  type SkillMemberRole,
} from "@/modules/skill-levels/domain/skill-levels";

import { assertSkillLevelsAvailable } from "./storage";

/**
 * Autorización de niveles y progresión. Uso interno: el resto del código entra
 * por la fachada skill-level-service.ts.
 *
 * Toda la autorización ocurre en servidor y dentro de la transacción:
 * - la función existe (bandera encendida y tablas instaladas);
 * - assertOperationalAccess: miembro activo de la academia, rol permitido,
 *   sede dentro de su alcance y, en escrituras, plan fuera de solo lectura;
 * - la sede es de la academia y está activa;
 * - la gimnasta es de la academia y está vinculada a la sede pedida. Para el
 *   entrenador el vínculo es el de Pasar lista: inscripción o grupo ABIERTO en
 *   esa sede. La dirección también ve gimnastas con historial en la sede.
 * - las plantillas son de toda la academia: las ve todo el equipo con acceso y
 *   solo las edita dirección, administración y coordinación.
 * La app conecta como postgres con BYPASSRLS: RLS es solo defensa en
 * profundidad frente a clientes directos.
 */

export type ActorInput = { actor: OperationalActor };

export type Access = {
  member: OrganizationMember;
  role: SkillMemberRole;
  location: { id: string; timezone: string | null };
};

export type AthleteAccess = Access & {
  athlete: { id: string; name: string; isActive: boolean };
};

const OPEN_ENROLLMENT_STATUSES = ["pending", "trial", "active", "paused"] as const;
const OPEN_GROUP_MEMBERSHIP_STATUSES = ["pending", "active", "paused"] as const;

export function notFound(message = "No encontrado"): OperationalError {
  return new OperationalError("NOT_FOUND", message, 404);
}

export function idempotencyConflict(): OperationalError {
  return new OperationalError(
    "IDEMPOTENCY_CONFLICT",
    "Este cambio ya se guardó; recarga la página.",
    409
  );
}

export async function authorizeMember(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; actor: OperationalActor; intent?: "write" }
): Promise<Access> {
  await assertSkillLevelsAvailable(tx);
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: SKILL_ROLES,
    intent: input.intent,
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
  return { member, role: member.role as SkillMemberRole, location };
}

/**
 * Bloquea las filas de las gimnastas (en orden de id, para no cruzar bloqueos)
 * antes de escribir su progreso o su paso de nivel. FOR NO KEY UPDATE choca
 * con otra escritura sobre la misma gimnasta, pero no con las claves foráneas
 * que otras operaciones comprueban sobre ella.
 */
export async function lockAthleteRows(
  tx: TransactionClient,
  organizationId: string,
  athleteIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(athleteIds)].sort();
  if (ids.length === 0) return;
  // unbounded-read-ok: acotada por los ids recibidos (como mucho 60 gimnastas).
  await tx
    .select({ id: athletes.id })
    .from(athletes)
    .where(and(eq(athletes.organizationId, organizationId), inArray(athletes.id, ids)))
    .orderBy(asc(athletes.id))
    .for("no key update");
}

/** Solo dirección, administración y coordinación gestionan plantillas. */
export function assertCanManageTemplates(access: Access): void {
  if (!canManageTemplates(access.role)) {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la dirección, la administración y la coordinación pueden editar las plantillas de niveles.",
      403
    );
  }
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
  if (!athlete) throw notFound("Gimnasta no encontrada");
  const isCoach = access.role === "coach";
  // Una gimnasta archivada no existe para el entrenador; la dirección conserva
  // la lectura del historial, pero nadie puede escribir.
  if (!athlete.isActive && isCoach) throw notFound("Gimnasta no encontrada");
  if (!athlete.isActive && input.intent === "write") {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "La gimnasta está archivada: su progreso es de solo lectura.",
      409
    );
  }
  const linked = await isAthleteLinkedToLocation(tx, {
    organizationId: input.organizationId,
    athleteId: input.athleteId,
    locationId: access.location.id,
    openOnly: isCoach,
  });
  if (!linked) throw notFound("La gimnasta no es de esta sede");
  return {
    ...access,
    athlete: {
      id: athlete.id,
      name: `${athlete.givenName} ${athlete.familyName}`.trim(),
      isActive: athlete.isActive,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Listas de gimnastas: grupo y sesión                                       */
/* ------------------------------------------------------------------------ */

export type RosterAthlete = { id: string; name: string };
export type Roster = { label: string; athletes: RosterAthlete[]; truncated: boolean };

function toRoster(label: string, rows: Array<{ athlete_id: string; given_name: string; family_name: string }>): Roster {
  const athletesList = rows.slice(0, MAX_ROSTER_ATHLETES).map((row) => ({
    id: row.athlete_id,
    name: `${row.given_name} ${row.family_name}`.trim(),
  }));
  return { label, athletes: athletesList, truncated: rows.length > MAX_ROSTER_ATHLETES };
}

/**
 * Gimnastas con pertenencia abierta a un grupo de la sede pedida. Un grupo de
 * otra sede, o de otra academia, responde como inexistente. Sin archivadas.
 */
export async function loadGroupRoster(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; groupId: string }
): Promise<Roster> {
  const groupResult = await tx.execute(sql`
    select name from zaltyko.groups
    where organization_id = ${input.organizationId}::uuid
      and location_id = ${access.location.id}::uuid
      and id = ${input.groupId}::uuid
    limit 1
  `);
  const group = groupResult.rows[0] as { name?: string } | undefined;
  if (!group?.name) throw notFound("Grupo no encontrado");
  const result = await tx.execute(sql`
    select athlete.id as athlete_id, person.given_name, person.family_name
    from zaltyko.group_memberships as membership
    join zaltyko.athletes as athlete
      on athlete.organization_id = membership.organization_id and athlete.id = membership.athlete_id
    join zaltyko.people as person
      on person.organization_id = athlete.organization_id and person.id = athlete.person_id
    where membership.organization_id = ${input.organizationId}::uuid
      and membership.group_id = ${input.groupId}::uuid
      and membership.status in (${inList(OPEN_GROUP_MEMBERSHIP_STATUSES)})
      and athlete.is_active
    order by person.given_name, person.family_name, athlete.id
    limit ${MAX_ROSTER_ATHLETES + 1}
  `);
  return toRoster(
    group.name,
    result.rows as Array<{ athlete_id: string; given_name: string; family_name: string }>
  );
}

/**
 * Gimnastas que participan en una sesión de la sede pedida: inscritas en su
 * clase o en un grupo vinculado a la clase, vigentes en la fecha de la sesión.
 * Es el mismo criterio de participación que usa Pasar lista. Sin archivadas.
 */
export async function loadSessionRoster(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; sessionId: string }
): Promise<Roster> {
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
  const day = localDateInTimeZone(new Date(session.startsAt), access.location.timezone);
  const nameResult = await tx.execute(sql`
    select name from zaltyko.class_templates
    where organization_id = ${input.organizationId}::uuid and id = ${session.classTemplateId}::uuid
    limit 1
  `);
  const className = (nameResult.rows[0] as { name?: string } | undefined)?.name ?? "Clase";
  const result = await tx.execute(sql`
    select distinct athlete.id as athlete_id, person.given_name, person.family_name
    from zaltyko.athletes as athlete
    join zaltyko.people as person
      on person.organization_id = athlete.organization_id and person.id = athlete.person_id
    where athlete.organization_id = ${input.organizationId}::uuid
      and athlete.is_active
      and (
        exists (
          select 1 from zaltyko.enrollments as enrollment
          where enrollment.organization_id = athlete.organization_id
            and enrollment.athlete_id = athlete.id
            and enrollment.location_id = ${access.location.id}::uuid
            and enrollment.class_template_id = ${session.classTemplateId}::uuid
            and enrollment.status in (${inList(OPEN_ENROLLMENT_STATUSES)})
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
            and class_group.class_template_id = ${session.classTemplateId}::uuid
            and membership.athlete_id = athlete.id
            and membership.status in (${inList(OPEN_GROUP_MEMBERSHIP_STATUSES)})
            and membership.starts_on <= ${day}::date
            and (membership.ends_on is null or membership.ends_on >= ${day}::date)
        )
      )
    order by person.given_name, person.family_name, athlete.id
    limit ${MAX_ROSTER_ATHLETES + 1}
  `);
  return toRoster(
    className,
    result.rows as Array<{ athlete_id: string; given_name: string; family_name: string }>
  );
}

/* ------------------------------------------------------------------------ */
/* Nombres del equipo                                                        */
/* ------------------------------------------------------------------------ */

/** Nombres visibles por rol cuando el miembro no tiene ficha de equipo. */
const roleFallbackNames: Record<string, string> = {
  owner: "Dirección de la academia",
  admin: "Administración",
  manager: "Coordinador/a",
  coach: "Entrenador/a",
};

export async function memberNames(
  tx: TransactionClient,
  organizationId: string,
  memberIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(memberIds)];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  // unbounded-read-ok: acotada por los ids recibidos (autores de como mucho unos cientos de marcas).
  const rows = await tx
    .select({
      memberId: organizationMembers.id,
      role: organizationMembers.role,
      givenName: people.givenName,
      familyName: people.familyName,
    })
    .from(organizationMembers)
    .leftJoin(
      staffProfiles,
      and(
        eq(staffProfiles.organizationId, organizationMembers.organizationId),
        eq(staffProfiles.memberId, organizationMembers.id)
      )
    )
    .leftJoin(people, and(eq(people.organizationId, staffProfiles.organizationId), eq(people.id, staffProfiles.personId)))
    .where(and(eq(organizationMembers.organizationId, organizationId), inArray(organizationMembers.id, unique)));
  for (const row of rows) {
    const name = row.givenName ? `${row.givenName} ${row.familyName ?? ""}`.trim() : null;
    if (name || !names.has(row.memberId)) {
      names.set(row.memberId, name ?? roleFallbackNames[row.role] ?? "Equipo");
    }
  }
  return names;
}
