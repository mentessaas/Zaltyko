import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";

/**
 * Pago automático de cuotas (cobro automático, Fase 2) necesita una tabla y
 * una columna de un candidato
 * (docs/deployment/candidates/20261116180000_family_payment_methods_candidate.sql,
 * sin aplicar en ningún entorno; requiere autorización de Elvis):
 * zaltyko.family_payment_setup_attempts y
 * zaltyko.family_payment_authorizations.payment_method_kind. Mientras no
 * existan tal como las define el candidato, la función responde «no
 * disponible» en vez de fallar a mitad de una lectura o escritura.
 * Solo lee el catálogo: nunca crea, repara ni concede nada.
 */

/** Columnas de la tabla nueva, todas obligatorias para considerarla instalada. */
const SETUP_ATTEMPT_COLUMNS = [
  "id",
  "organization_id",
  "family_id",
  "family_payer_id",
  "guardian_id",
  "payment_provider_account_id",
  "payment_method_kind",
  "provider_customer_reference",
  "provider_setup_reference",
  "consent_version",
  "consent_text_sha256",
  "consented_at",
  "client_ip_prefix",
  "user_agent_excerpt",
  "status",
  "authorization_id",
  "created_at",
  "updated_at",
] as const;

const setupAttemptColumnList = sql.join(
  SETUP_ATTEMPT_COLUMNS.map((column) => sql`${column}`),
  sql`, `
);

export async function isFamilyPaymentMethodsStorageAvailable(
  executor: Pick<DatabaseClient, "execute"> = db
): Promise<boolean> {
  const result = await executor.execute(sql`
    select (
      select count(*)
        from information_schema.columns
       where table_schema = 'zaltyko'
         and table_name = 'family_payment_setup_attempts'
         and column_name in (${setupAttemptColumnList})
    ) = ${SETUP_ATTEMPT_COLUMNS.length}
    and exists (
      select 1
        from information_schema.columns
       where table_schema = 'zaltyko'
         and table_name = 'family_payment_authorizations'
         and column_name = 'payment_method_kind'
         and data_type = 'text'
    ) as available
  `);
  return (result.rows[0] as { available?: boolean } | undefined)?.available === true;
}
