import { sql, type SQL } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import {
  coachDisplayName,
  normalizeStaffProfileIds,
  sortCoaches,
  type CoachRef,
  type SubstitutionReason,
} from "@/modules/coach-assignment/domain/coach-assignment";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

/**
 * Lecturas compartidas por las operaciones de titulares y sustituciones.
 * Todas filtran por organization_id: el servidor conecta con BYPASSRLS y el
 * aislamiento entre academias depende de estas cláusulas.
 */

type PersonRow = {
  staff_profile_id: string;
  given_name: string;
  family_name: string;
  preferred_name: string | null;
};

function toCoach(row: PersonRow): CoachRef {
  return {
    staffProfileId: String(row.staff_profile_id),
    name: coachDisplayName({
      givenName: row.given_name,
      familyName: row.family_name,
      preferredName: row.preferred_name,
    }),
  };
}

async function rows<Row>(client: DatabaseClient, statement: SQL): Promise<Row[]> {
  const result = await client.execute(statement);
  return result.rows as unknown as Row[];
}

/** Nombres de fichas de equipo de la academia, en el orden visible. */
export async function coachesByIds(
  client: DatabaseClient,
  organizationId: string,
  staffProfileIds: readonly string[]
): Promise<CoachRef[]> {
  const ids = normalizeStaffProfileIds(staffProfileIds);
  if (ids.length === 0) return [];
  const found = await rows<PersonRow>(
    client,
    sql`
      select staff.id::text as staff_profile_id, person.given_name, person.family_name, person.preferred_name
      from zaltyko.staff_profiles staff
      join zaltyko.people person
        on person.organization_id = staff.organization_id
       and person.id = staff.person_id
      where staff.organization_id = ${organizationId}::uuid
        and staff.id = any(${sqlUuidArray(ids)})
    `
  );
  return sortCoaches(found.map(toCoach));
}

/**
 * Quién se puede asignar en una sede: fichas activas vinculadas a un miembro
 * activo con rol entrenador y acceso a esa sede (todas las sedes o la sede
 * entre las suyas). Con `onlyIds` comprueba una lista concreta.
 */
export async function eligibleCoaches(
  client: DatabaseClient,
  input: { organizationId: string; locationId: string; onlyIds?: readonly string[] }
): Promise<CoachRef[]> {
  const only = input.onlyIds ? normalizeStaffProfileIds(input.onlyIds) : null;
  if (only && only.length === 0) return [];
  const found = await rows<PersonRow>(
    client,
    sql`
      select staff.id::text as staff_profile_id, person.given_name, person.family_name, person.preferred_name
      from zaltyko.staff_profiles staff
      join zaltyko.people person
        on person.organization_id = staff.organization_id
       and person.id = staff.person_id
      join zaltyko.organization_members member
        on member.organization_id = staff.organization_id
       and member.id = staff.member_id
      where staff.organization_id = ${input.organizationId}::uuid
        and staff.is_active
        and member.status = 'active'
        and member.role = 'coach'
        and (
          member.location_scope_mode = 'all'
          or exists (
            select 1
            from zaltyko.member_location_scopes scope
            where scope.organization_id = member.organization_id
              and scope.member_id = member.id
              and scope.location_id = ${input.locationId}::uuid
          )
        )
        ${only ? sql`and staff.id = any(${sqlUuidArray(only)})` : sql``}
      order by person.family_name, person.given_name, staff.id
      limit 200
    `
  );
  return sortCoaches(found.map(toCoach));
}

export async function classTitularIds(
  client: DatabaseClient,
  organizationId: string,
  classTemplateId: string
): Promise<string[]> {
  const found = await rows<{ staff_profile_id: string }>(
    client,
    sql`
      select staff_profile_id::text
      from zaltyko.class_template_staff
      where organization_id = ${organizationId}::uuid
        and class_template_id = ${classTemplateId}::uuid
      order by staff_profile_id
    `
  );
  return normalizeStaffProfileIds(found.map((row) => row.staff_profile_id));
}

export async function sessionCoachIds(
  client: DatabaseClient,
  organizationId: string,
  sessionId: string
): Promise<string[]> {
  const found = await rows<{ staff_profile_id: string }>(
    client,
    sql`
      select staff_profile_id::text
      from zaltyko.session_staff
      where organization_id = ${organizationId}::uuid
        and session_id = ${sessionId}::uuid
        and assignment_role = 'coach'
      order by staff_profile_id
    `
  );
  return normalizeStaffProfileIds(found.map((row) => row.staff_profile_id));
}

export type OverrideRow = {
  reason: SubstitutionReason | null;
  changedAt: string;
  changedByMemberId: string;
};

export async function sessionOverride(
  client: DatabaseClient,
  organizationId: string,
  sessionId: string
): Promise<OverrideRow | null> {
  const [row] = await rows<{ reason: string | null; changed_at: Date | string; changed_by_member_id: string }>(
    client,
    sql`
      select reason, changed_at, changed_by_member_id::text
      from zaltyko.session_staff_overrides
      where organization_id = ${organizationId}::uuid
        and session_id = ${sessionId}::uuid
    `
  );
  if (!row) return null;
  return {
    reason: (row.reason as SubstitutionReason | null) ?? null,
    changedAt: new Date(row.changed_at).toISOString(),
    changedByMemberId: String(row.changed_by_member_id),
  };
}

const roleFallbackNames: Record<string, string> = {
  owner: "Dirección de la academia",
  admin: "Administración",
  manager: "Coordinador/a",
  coach: "Entrenador/a",
};

/** Nombre de quien hizo un cambio: su ficha de equipo o, si no tiene, su rol. */
export async function memberDisplayName(
  client: DatabaseClient,
  organizationId: string,
  memberId: string
): Promise<string> {
  const [row] = await rows<{ role: string; given_name: string | null; family_name: string | null; preferred_name: string | null }>(
    client,
    sql`
      select member.role::text as role, person.given_name, person.family_name, person.preferred_name
      from zaltyko.organization_members member
      left join zaltyko.staff_profiles staff
        on staff.organization_id = member.organization_id
       and staff.member_id = member.id
      left join zaltyko.people person
        on person.organization_id = staff.organization_id
       and person.id = staff.person_id
      where member.organization_id = ${organizationId}::uuid
        and member.id = ${memberId}::uuid
      order by person.given_name nulls last
      limit 1
    `
  );
  if (!row) return "Equipo";
  if (row.given_name && row.family_name) {
    return coachDisplayName({ givenName: row.given_name, familyName: row.family_name, preferredName: row.preferred_name });
  }
  return roleFallbackNames[row.role] ?? "Equipo";
}

/** Fichas de equipo vinculadas a un miembro (normalmente una). */
export async function staffProfileIdsOfMember(
  client: DatabaseClient,
  organizationId: string,
  memberId: string
): Promise<string[]> {
  const found = await rows<{ id: string }>(
    client,
    sql`
      select id::text
      from zaltyko.staff_profiles
      where organization_id = ${organizationId}::uuid
        and member_id = ${memberId}::uuid
    `
  );
  return normalizeStaffProfileIds(found.map((row) => row.id));
}
