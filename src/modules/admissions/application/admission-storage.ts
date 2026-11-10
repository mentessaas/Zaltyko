import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * `zaltyko.admission_requests` es un candidato pendiente de autorización
 * (docs/deployment/candidates/20261110120000_admission_requests_candidate.sql).
 * Hasta que se aplique, todo el embudo responde «no disponible» en vez de
 * fallar a mitad de una escritura. Solo lee el catálogo: nunca crea, repara ni
 * concede nada.
 */
export const ADMISSION_REQUEST_COLUMNS = [
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

export async function isAdmissionStorageAvailable(client: DatabaseClient): Promise<boolean> {
  const result = await client.execute(sql`
    select case when to_regclass('zaltyko.admission_requests') is not null then
      (select array_agg(column_name::text order by column_name::text collate "C")
         from information_schema.columns
        where table_schema = 'zaltyko' and table_name = 'admission_requests')
        = ${sql.raw(`array[${ADMISSION_REQUEST_COLUMNS.map((column) => `'${column}'`).join(",")}]::text[]`)}
      and (select c.relrowsecurity and c.relforcerowsecurity
             from pg_class c where c.oid = to_regclass('zaltyko.admission_requests'))
      and not coalesce((
        select bool_or(has_table_privilege(r.oid, 'zaltyko.admission_requests', 'SELECT,INSERT,UPDATE,DELETE'))
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
