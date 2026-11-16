/**
 * Conectar Stripe (cobro automático, Fase 1): acceso a la fila de
 * zaltyko.organization_payment_provider_accounts que proyecta la cuenta
 * conectada de la academia.
 *
 * Dos columnas (`sepa_debit_payments_capability_status`, `requirements_state`)
 * vienen de un candidato aún sin aplicar en staging ni producción. Por eso
 * todo va en SQL con listas de columnas explícitas y solo debe llamarse
 * después de que isConnectOnboardingStorageAvailable() haya respondido `true`.
 * Sin llamadas a Stripe ni decisiones de negocio: eso vive en el servicio.
 */
import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import type {
  ConnectAccountProjection,
  RequirementsState,
} from "@/modules/payments-connect/domain/account-projection";

type Executor = Pick<DatabaseClient, "execute">;

export interface StoredConnectAccount {
  id: string;
  organizationId: string;
  environment: "test" | "live";
  providerAccountReference: string;
  status: "pending" | "onboarding" | "restricted" | "active" | "disabled";
  cardPaymentsCapabilityStatus: string;
  sepaDebitPaymentsCapabilityStatus: string;
  requirementsState: RequirementsState;
  revision: number;
  lastSyncedAt: Date | null;
}

const accountColumns = sql`
  id::text as "id",
  organization_id::text as "organizationId",
  environment::text as "environment",
  provider_account_reference as "providerAccountReference",
  status::text as "status",
  card_payments_capability_status as "cardPaymentsCapabilityStatus",
  sepa_debit_payments_capability_status as "sepaDebitPaymentsCapabilityStatus",
  requirements_state as "requirementsState",
  revision as "revision",
  last_synced_at as "lastSyncedAt"
`;

function toStoredAccount(row: Record<string, unknown> | undefined): StoredConnectAccount | null {
  if (!row) return null;
  const lastSyncedAt = row.lastSyncedAt;
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    environment: String(row.environment) as StoredConnectAccount["environment"],
    providerAccountReference: String(row.providerAccountReference),
    status: String(row.status) as StoredConnectAccount["status"],
    cardPaymentsCapabilityStatus: String(row.cardPaymentsCapabilityStatus),
    sepaDebitPaymentsCapabilityStatus: String(row.sepaDebitPaymentsCapabilityStatus),
    requirementsState: String(row.requirementsState) as RequirementsState,
    revision: Number(row.revision),
    lastSyncedAt:
      lastSyncedAt instanceof Date
        ? lastSyncedAt
        : typeof lastSyncedAt === "string"
          ? new Date(lastSyncedAt)
          : null,
  };
}

/** Proyección guardada en la fila, comparable con la recién leída de Stripe. */
export function storedProjection(account: StoredConnectAccount): ConnectAccountProjection {
  return {
    // `pending` no lo produce nunca la proyección; se compara tal cual para
    // que cualquier sincronización la sustituya por un estado real.
    status: account.status as ConnectAccountProjection["status"],
    cardPaymentsCapabilityStatus: account.cardPaymentsCapabilityStatus,
    sepaDebitPaymentsCapabilityStatus: account.sepaDebitPaymentsCapabilityStatus,
    requirementsState: account.requirementsState,
  };
}

/** País de la academia (zaltyko.organizations.country_code). */
export async function loadOrganizationCountryCode(
  executor: Executor,
  organizationId: string
): Promise<string> {
  const result = await executor.execute(sql`
    select country_code as "countryCode"
      from zaltyko.organizations
     where id = ${organizationId}::uuid
     limit 1
  `);
  const row = result.rows[0] as { countryCode?: unknown } | undefined;
  return typeof row?.countryCode === "string" ? row.countryCode : "";
}

export async function findConnectAccountForOrganization(
  executor: Executor,
  organizationId: string,
  environment: "test" | "live"
): Promise<StoredConnectAccount | null> {
  const result = await executor.execute(sql`
    select ${accountColumns}
      from zaltyko.organization_payment_provider_accounts
     where organization_id = ${organizationId}::uuid
       and processor = 'stripe'
       and environment = ${environment}::zaltyko.stripe_environment
     limit 1
  `);
  return toStoredAccount(result.rows[0] as Record<string, unknown> | undefined);
}

export async function findConnectAccountByReference(
  executor: Executor,
  environment: "test" | "live",
  providerAccountReference: string
): Promise<StoredConnectAccount | null> {
  const result = await executor.execute(sql`
    select ${accountColumns}
      from zaltyko.organization_payment_provider_accounts
     where processor = 'stripe'
       and environment = ${environment}::zaltyko.stripe_environment
       and provider_account_reference = ${providerAccountReference}
     limit 1
  `);
  return toStoredAccount(result.rows[0] as Record<string, unknown> | undefined);
}

/** Bloquea la fila hasta el final de la transacción y la devuelve. */
export async function lockConnectAccount(
  tx: Executor,
  accountRowId: string
): Promise<StoredConnectAccount | null> {
  const result = await tx.execute(sql`
    select ${accountColumns}
      from zaltyko.organization_payment_provider_accounts
     where id = ${accountRowId}::uuid
     for update
  `);
  return toStoredAccount(result.rows[0] as Record<string, unknown> | undefined);
}

/**
 * Inserta la fila de la academia si aún no existe para ese entorno. Devuelve
 * `null` si otra petición la creó antes (no lanza ni sobrescribe).
 *
 * `last_synced_at` nace en `null`: la proyección de la creación es la de una
 * cuenta vacía, así que el primer refresco al volver de Stripe (aunque sea en
 * menos de 60 s) siempre vuelve a leer la cuenta.
 */
export async function insertConnectAccountIfAbsent(
  tx: Executor,
  input: {
    organizationId: string;
    environment: "test" | "live";
    providerAccountReference: string;
    projection: ConnectAccountProjection;
  }
): Promise<StoredConnectAccount | null> {
  const result = await tx.execute(sql`
    insert into zaltyko.organization_payment_provider_accounts (
      organization_id,
      processor,
      environment,
      provider_account_reference,
      status,
      card_payments_capability_status,
      sepa_debit_payments_capability_status,
      requirements_state,
      last_synced_at
    ) values (
      ${input.organizationId}::uuid,
      'stripe',
      ${input.environment}::zaltyko.stripe_environment,
      ${input.providerAccountReference},
      'onboarding'::zaltyko.organization_payment_account_status,
      ${input.projection.cardPaymentsCapabilityStatus},
      ${input.projection.sepaDebitPaymentsCapabilityStatus},
      ${input.projection.requirementsState},
      null
    )
    on conflict (organization_id, processor, environment) do nothing
    returning ${accountColumns}
  `);
  return toStoredAccount(result.rows[0] as Record<string, unknown> | undefined);
}

/** Referencia del evento si la hay; si no, se conserva la guardada. */
function eventReferenceOrCurrent(providerEventReference: string | null) {
  return providerEventReference
    ? sql`${providerEventReference}`
    : sql`last_provider_event_reference`;
}

/**
 * Aplica una proyección distinta: sube `revision` y marca la sincronización.
 * `syncedAt` es el momento en que se leyó Stripe (no `now()` de la base): así
 * una lectura más vieja que llegue después puede reconocerse y descartarse.
 */
export async function updateConnectAccountProjection(
  tx: Executor,
  input: {
    accountRowId: string;
    projection: ConnectAccountProjection;
    providerEventReference: string | null;
    syncedAt: Date;
  }
): Promise<StoredConnectAccount> {
  const result = await tx.execute(sql`
    update zaltyko.organization_payment_provider_accounts
       set status = ${input.projection.status}::zaltyko.organization_payment_account_status,
           card_payments_capability_status = ${input.projection.cardPaymentsCapabilityStatus},
           sepa_debit_payments_capability_status = ${input.projection.sepaDebitPaymentsCapabilityStatus},
           requirements_state = ${input.projection.requirementsState},
           revision = revision + 1,
           last_synced_at = ${input.syncedAt.toISOString()}::timestamptz,
           last_provider_event_reference = ${eventReferenceOrCurrent(input.providerEventReference)},
           updated_at = now()
     where id = ${input.accountRowId}::uuid
    returning ${accountColumns}
  `);
  const updated = toStoredAccount(result.rows[0] as Record<string, unknown> | undefined);
  if (!updated) throw new Error("Connect account row disappeared during projection");
  return updated;
}

/**
 * Sin cambios en la proyección: solo se anota cuándo se leyó Stripe y, si
 * viene de un evento, qué evento lo comprobó.
 */
export async function touchConnectAccountSyncedAt(
  tx: Executor,
  input: {
    accountRowId: string;
    providerEventReference: string | null;
    syncedAt: Date;
  }
): Promise<StoredConnectAccount> {
  const result = await tx.execute(sql`
    update zaltyko.organization_payment_provider_accounts
       set last_synced_at = ${input.syncedAt.toISOString()}::timestamptz,
           last_provider_event_reference = ${eventReferenceOrCurrent(input.providerEventReference)}
     where id = ${input.accountRowId}::uuid
    returning ${accountColumns}
  `);
  const updated = toStoredAccount(result.rows[0] as Record<string, unknown> | undefined);
  if (!updated) throw new Error("Connect account row disappeared during sync");
  return updated;
}
