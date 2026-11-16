import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";

/**
 * Conectar Stripe (cobro automático de cuotas, Fase 1) necesita dos columnas
 * de un candidato (docs/deployment/candidates/20261116120000_connect_onboarding_candidate.sql,
 * aplicado en staging el 16-11-2026; producción necesita otra autorización de
 * Elvis) en zaltyko.organization_payment_provider_accounts. Mientras no existan tal
 * como las define el candidato, la función responde «no disponible» en vez de
 * fallar a mitad de una lectura o escritura.
 * Solo lee el catálogo: nunca crea, repara ni concede nada.
 */
export const CONNECT_ONBOARDING_UNAVAILABLE_REASON = "connect_onboarding_unavailable";

const CONNECT_ONBOARDING_COLUMNS = ["requirements_state", "sepa_debit_payments_capability_status"] as const;

const columnList = sql.join(
  CONNECT_ONBOARDING_COLUMNS.map((column) => sql`${column}`),
  sql`, `
);

export async function isConnectOnboardingStorageAvailable(
  executor: Pick<DatabaseClient, "execute"> = db
): Promise<boolean> {
  const result = await executor.execute(sql`
    select count(*) = ${CONNECT_ONBOARDING_COLUMNS.length} as available
      from information_schema.columns
     where table_schema = 'zaltyko'
       and table_name = 'organization_payment_provider_accounts'
       and column_name in (${columnList})
       and data_type = 'text'
       and is_nullable = 'NO'
  `);
  return (result.rows[0] as { available?: boolean } | undefined)?.available === true;
}
