/**
 * Authorization and the academy state the import checks every row against.
 * Only reads; the caller decides whether it runs under the organization lock.
 */
import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import type { NormalizedImportRow } from "../../domain/athlete-import-rows";
import type { Actor, ExistingAthlete, ExistingContact, GroupRow, ImportContext } from "./model";

const IMPORT_ROLES = ["owner", "admin"] as const;

/**
 * Same rule as the manual intake: an active owner or admin with access to
 * every site. `lock` keeps the membership row shared until commit.
 *
 * @internal Uso exclusivo de athlete-import/*; la API pública está en
 * athlete-import-service.ts.
 */
export async function authorizeImport(
  tx: TransactionClient,
  input: { organizationId: string; userId: string; actor: Actor },
  lock: boolean
): Promise<void> {
  if (input.actor.userId !== input.userId) {
    throw new OperationalError("FORBIDDEN", "La identidad de la sesión no coincide con el miembro activo", 403);
  }
  const result = await tx.execute(sql`
    select role::text as role, location_scope_mode::text as location_scope_mode
    from zaltyko.organization_members
    where organization_id = ${input.organizationId}::uuid
      and id = ${input.actor.memberId}::uuid
      and user_id = ${input.userId}::uuid
      and status = 'active'
    ${lock ? sql`for share` : sql``}
  `);
  const row = result.rows[0] as { role?: unknown; location_scope_mode?: unknown } | undefined;
  if (!row || !IMPORT_ROLES.includes(row.role as (typeof IMPORT_ROLES)[number])) {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la propiedad o la administración de la academia pueden importar gimnastas.",
      403
    );
  }
  if (row.location_scope_mode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Importar gimnastas requiere acceso a todas las sedes de la academia.",
      403
    );
  }
}

/**
 * Civil date of the academy: the time zone of its first active site (by
 * creation), or UTC when it has none.
 *
 * @internal Uso exclusivo de athlete-import/*; la API pública está en
 * athlete-import-service.ts.
 */
export async function loadAcademyToday(tx: TransactionClient, organizationId: string): Promise<string> {
  const result = await tx.execute(sql`
    select coalesce((
      select (current_timestamp at time zone location.timezone)::date::text
      from zaltyko.locations as location
      where location.organization_id = ${organizationId}::uuid
        and location.is_active = true
      order by location.created_at, location.id
      limit 1
    ), current_date::text) as today
  `);
  const today = (result.rows[0] as { today?: unknown } | undefined)?.today;
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(today)) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo comprobar la fecha de la academia", 503);
  }
  return today;
}

function count(value: unknown, what: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", `No se pudo comprobar ${what}`, 503);
  }
  return number;
}

/**
 * Groups, athletes, tutors with the file's contacts and plan usage, all of
 * this organization only.
 *
 * @internal Uso exclusivo de athlete-import/*; la API pública está en
 * athlete-import-service.ts.
 */
export async function loadImportContext(
  tx: TransactionClient,
  organizationId: string,
  today: string,
  rows: readonly NormalizedImportRow[]
): Promise<ImportContext> {
  const groupResult = await tx.execute(sql`
    select academy_group.id::text as group_id,
           academy_group.name,
           academy_group.location_id::text as location_id,
           academy_group.capacity,
           (current_timestamp at time zone location.timezone)::date::text as local_date,
           (
             select count(*)::int
             from zaltyko.group_memberships as membership
             where membership.organization_id = academy_group.organization_id
               and membership.group_id = academy_group.id
               and membership.status in ('pending', 'active', 'paused')
           ) as occupancy
    from zaltyko.groups as academy_group
    join zaltyko.locations as location
      on location.organization_id = academy_group.organization_id
     and location.id = academy_group.location_id
    where academy_group.organization_id = ${organizationId}::uuid
      and academy_group.status = 'active'
      and location.is_active = true
    order by academy_group.id
  `);
  const groups = groupResult.rows.map((raw): GroupRow => {
    const row = raw as Record<string, unknown>;
    return {
      groupId: String(row.group_id),
      name: String(row.name),
      locationId: String(row.location_id),
      capacity: row.capacity === null ? null : count(row.capacity, "la capacidad de un grupo"),
      occupancy: count(row.occupancy, "la ocupación de un grupo"),
      localDate: String(row.local_date),
    };
  });

  // Every athlete of the academy, archived included: a row without a date of
  // birth is compared by name against all of them.
  const athleteResult = await tx.execute(sql`
    select person.given_name, person.family_name,
           person.date_of_birth::text as date_of_birth, athlete.is_active
    from zaltyko.athletes as athlete
    join zaltyko.people as person
      on person.organization_id = athlete.organization_id
     and person.id = athlete.person_id
    where athlete.organization_id = ${organizationId}::uuid
  `);
  const athletes = athleteResult.rows.map((raw): ExistingAthlete => {
    const row = raw as Record<string, unknown>;
    return {
      givenName: String(row.given_name),
      familyName: String(row.family_name),
      dateOfBirth: row.date_of_birth === null ? null : String(row.date_of_birth),
      isActive: row.is_active === true,
    };
  });

  const emails = [...new Set(rows.flatMap((row) => (row.guardian?.email ? [row.guardian.email] : [])))];
  const phones = [...new Set(rows.flatMap((row) => (row.guardian?.phone ? [row.guardian.phone] : [])))];
  let contacts: ExistingContact[] = [];
  if (emails.length + phones.length > 0) {
    const contactResult = await tx.execute(sql`
      select contact.guardian_id::text as guardian_id,
             contact.kind::text as kind,
             contact.normalized_value,
             person.given_name,
             person.family_name,
             coalesce((
               select jsonb_agg(distinct family_guardian.family_id::text)
               from zaltyko.family_guardians as family_guardian
               join zaltyko.families as family
                 on family.organization_id = family_guardian.organization_id
                and family.id = family_guardian.family_id
               where family_guardian.organization_id = contact.organization_id
                 and family_guardian.guardian_id = contact.guardian_id
                 and family_guardian.is_active = true
                 and family.is_active = true
             ), '[]'::jsonb) as family_ids
      from zaltyko.guardian_contacts as contact
      join zaltyko.guardians as guardian
        on guardian.organization_id = contact.organization_id
       and guardian.id = contact.guardian_id
      join zaltyko.people as person
        on person.organization_id = guardian.organization_id
       and person.id = guardian.person_id
      where contact.organization_id = ${organizationId}::uuid
        and guardian.is_active = true
        and (
          (contact.kind = 'email' and contact.normalized_value in (
            select value from jsonb_array_elements_text(${JSON.stringify(emails)}::jsonb)
          ))
          or (contact.kind = 'phone' and contact.normalized_value in (
            select value from jsonb_array_elements_text(${JSON.stringify(phones)}::jsonb)
          ))
        )
    `);
    contacts = contactResult.rows.map((raw): ExistingContact => {
      const row = raw as Record<string, unknown>;
      return {
        guardianId: String(row.guardian_id),
        kind: row.kind === "phone" ? "phone" : "email",
        value: String(row.normalized_value),
        givenName: String(row.given_name),
        familyName: String(row.family_name),
        familyIds: Array.isArray(row.family_ids) ? row.family_ids.map(String) : [],
      };
    });
  }

  const usage = await getOrganizationUsage(tx, organizationId);
  const athleteUsage = usage.resources.find((resource) => resource.resource === "athletes");
  if (!athleteUsage) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo comprobar el límite de gimnastas", 503);
  }
  return {
    today,
    groups,
    athletes,
    contacts,
    usage: { current: athleteUsage.current, limit: athleteUsage.limit, readOnly: usage.readOnly },
  };
}
