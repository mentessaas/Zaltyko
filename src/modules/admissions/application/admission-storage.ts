import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * `zaltyko.admission_links` y `zaltyko.admission_requests` son un candidato
 * pendiente de autorización
 * (docs/deployment/candidates/20261110120000_admission_requests_candidate.sql).
 * Hasta que se aplique, todo el embudo responde «no disponible» en vez de
 * fallar a mitad de una escritura. Solo lee el catálogo: nunca crea, repara ni
 * concede nada.
 */
export const ADMISSION_LINK_COLUMNS = [
  "created_at",
  "created_by_member_id",
  "enabled",
  "id",
  "location_id",
  "organization_id",
  "revoked_at",
  "token",
] as const;

export const ADMISSION_REQUEST_COLUMNS = [
  "anonymized_at",
  "athlete_birth_year",
  "athlete_given_name",
  "contact_email",
  "contact_name",
  "contact_phone",
  "converted_athlete_id",
  "created_at",
  "handled_at",
  "handled_by_member_id",
  "id",
  "link_id",
  "location_id",
  "message",
  "organization_id",
  "privacy_consent_at",
  "privacy_consent_version",
  "revision",
  "status",
  "submission_id",
  "updated_at",
  "waitlist_entry_id",
] as const;

function columnsMatch(table: string, columns: readonly string[]) {
  return sql`(select array_agg(column_name::text order by column_name::text collate "C")
      from information_schema.columns
     where table_schema = 'zaltyko' and table_name = ${table})
    = ${sql.raw(`array[${columns.map((column) => `'${column}'`).join(",")}]::text[]`)}`;
}

export async function isAdmissionStorageAvailable(client: DatabaseClient): Promise<boolean> {
  const result = await client.execute(sql`
    select case
      when to_regclass('zaltyko.admission_links') is not null
       and to_regclass('zaltyko.admission_requests') is not null then
        ${columnsMatch("admission_links", ADMISSION_LINK_COLUMNS)}
        and ${columnsMatch("admission_requests", ADMISSION_REQUEST_COLUMNS)}
        and (select count(*) = 2 from pg_class c
              where c.oid in (to_regclass('zaltyko.admission_links'), to_regclass('zaltyko.admission_requests'))
                and c.relrowsecurity and c.relforcerowsecurity)
        and not coalesce((
          select bool_or(
            has_table_privilege(r.oid, 'zaltyko.admission_links', 'SELECT,INSERT,UPDATE,DELETE')
            or has_table_privilege(r.oid, 'zaltyko.admission_requests', 'SELECT,INSERT,UPDATE,DELETE'))
            from pg_roles r where r.rolname in ('anon', 'authenticated')
        ), false)
      else false end as available
  `);
  return (result.rows[0] as { available?: unknown } | undefined)?.available === true;
}

export function admissionStorageUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "Las solicitudes de prueba todavía no están activadas.",
    503
  );
}

export async function assertAdmissionStorageAvailable(client: DatabaseClient): Promise<void> {
  if (!(await isAdmissionStorageAvailable(client))) throw admissionStorageUnavailable();
}
