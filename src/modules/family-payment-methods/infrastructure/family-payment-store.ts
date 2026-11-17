/**
 * Pago automático de cuotas (cobro automático, Fase 2): acceso a la base.
 *
 * Toca zaltyko.family_payment_setup_attempts (tabla del candidato
 * 20261116180000_family_payment_methods_candidate.sql) y la columna nueva
 * family_payment_authorizations.payment_method_kind. Por eso todo va en SQL
 * con listas de columnas explícitas y solo debe llamarse después de que
 * isFamilyPaymentMethodsStorageAvailable() haya respondido `true`.
 *
 * Sin llamadas a Stripe ni decisiones de negocio: eso vive en el servicio.
 * Solo referencias opacas (cus_, seti_, pm_, mandate_) y la evidencia
 * recortada del consentimiento.
 */
import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import type { PaymentMethodKind } from "@/modules/family-payment-methods/domain/consent";
import { OPERATING_ORGANIZATION_STATUSES } from "@/modules/organizations/domain/organization-status";

type Executor = Pick<DatabaseClient, "execute">;

export interface FamilyPayer {
  guardianId: string;
  familyPayerId: string;
}

export type SetupAttemptStatus = "open" | "completed" | "abandoned";

export interface StoredSetupAttempt {
  id: string;
  organizationId: string;
  familyId: string;
  familyPayerId: string;
  guardianId: string;
  paymentProviderAccountId: string;
  paymentMethodKind: PaymentMethodKind;
  providerCustomerReference: string;
  providerSetupReference: string;
  consentVersion: string;
  consentTextSha256: string;
  consentedAt: Date;
  status: SetupAttemptStatus;
  authorizationId: string | null;
}

export interface StoredAuthorization {
  id: string;
  organizationId: string;
  familyId: string;
  familyPayerId: string;
  paymentProviderAccountId: string;
  paymentMethodReference: string;
  paymentMethodKind: PaymentMethodKind;
  consentedAt: Date;
}

export interface OwnerAuthorizationRow {
  authorizationId: string;
  familyId: string;
  givenName: string;
  familyName: string;
  method: PaymentMethodKind;
  since: Date;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

const attemptColumns = sql`
  id::text as "id",
  organization_id::text as "organizationId",
  family_id::text as "familyId",
  family_payer_id::text as "familyPayerId",
  guardian_id::text as "guardianId",
  payment_provider_account_id::text as "paymentProviderAccountId",
  payment_method_kind as "paymentMethodKind",
  provider_customer_reference as "providerCustomerReference",
  provider_setup_reference as "providerSetupReference",
  consent_version as "consentVersion",
  consent_text_sha256 as "consentTextSha256",
  consented_at as "consentedAt",
  status as "status",
  authorization_id::text as "authorizationId"
`;

function toStoredAttempt(row: Record<string, unknown> | undefined): StoredSetupAttempt | null {
  if (!row) return null;
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    familyId: String(row.familyId),
    familyPayerId: String(row.familyPayerId),
    guardianId: String(row.guardianId),
    paymentProviderAccountId: String(row.paymentProviderAccountId),
    paymentMethodKind: String(row.paymentMethodKind) as PaymentMethodKind,
    providerCustomerReference: String(row.providerCustomerReference),
    providerSetupReference: String(row.providerSetupReference),
    consentVersion: String(row.consentVersion),
    consentTextSha256: String(row.consentTextSha256),
    consentedAt: toDate(row.consentedAt),
    status: String(row.status) as SetupAttemptStatus,
    authorizationId: typeof row.authorizationId === "string" ? row.authorizationId : null,
  };
}

const authorizationColumns = sql`
  id::text as "id",
  organization_id::text as "organizationId",
  family_id::text as "familyId",
  family_payer_id::text as "familyPayerId",
  payment_provider_account_id::text as "paymentProviderAccountId",
  payment_method_reference as "paymentMethodReference",
  payment_method_kind as "paymentMethodKind",
  consented_at as "consentedAt"
`;

function toStoredAuthorization(row: Record<string, unknown> | undefined): StoredAuthorization | null {
  if (!row) return null;
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    familyId: String(row.familyId),
    familyPayerId: String(row.familyPayerId),
    paymentProviderAccountId: String(row.paymentProviderAccountId),
    paymentMethodReference: String(row.paymentMethodReference),
    paymentMethodKind: String(row.paymentMethodKind) as PaymentMethodKind,
    consentedAt: toDate(row.consentedAt),
  };
}

/** Academia operativa (en prueba o activa), como parámetros: nunca texto libre. */
const operatingOrganizationStatuses = sql.join(
  OPERATING_ORGANIZATION_STATUSES.map((status) => sql`${status}`),
  sql`, `
);

/**
 * La persona de la sesión es la pagadora vigente de esa familia: tutor activo
 * enlazado a la cuenta, enlace activo con la familia, familia activa y fila de
 * family_payers abierta hoy en el calendario de la academia. Misma cadena que
 * resolveFamilyPortalAccess (feeFamilyIds). `null` no distingue entre «no
 * existe» y «no eres la pagadora».
 */
export async function resolveFamilyPayer(
  executor: Executor,
  input: { userId: string; organizationId: string; familyId: string; now: Date }
): Promise<FamilyPayer | null> {
  const nowText = input.now.toISOString();
  const result = await executor.execute(sql`
    select g.id::text as "guardianId",
           fp.id::text as "familyPayerId"
      from zaltyko.guardians g
      join zaltyko.organizations o
        on o.id = g.organization_id
      join zaltyko.family_guardians fg
        on fg.organization_id = g.organization_id
       and fg.guardian_id = g.id
       and fg.family_id = ${input.familyId}::uuid
       and fg.is_active
      join zaltyko.families f
        on f.organization_id = fg.organization_id
       and f.id = fg.family_id
       and f.is_active
      join zaltyko.family_payers fp
        on fp.organization_id = g.organization_id
       and fp.family_id = f.id
       and fp.guardian_id = g.id
       and fp.starts_on <= (${nowText}::timestamptz at time zone o.default_timezone)::date
       and (fp.ends_on is null or fp.ends_on >= (${nowText}::timestamptz at time zone o.default_timezone)::date)
     where g.organization_id = ${input.organizationId}::uuid
       and g.auth_user_id = ${input.userId}::uuid
       and g.is_active
       and o.status::text in (${operatingOrganizationStatuses})
     order by fp.starts_on desc, fp.id
     limit 1
  `);
  const row = result.rows[0] as { guardianId?: unknown; familyPayerId?: unknown } | undefined;
  if (!row || typeof row.guardianId !== "string" || typeof row.familyPayerId !== "string") {
    return null;
  }
  return { guardianId: row.guardianId, familyPayerId: row.familyPayerId };
}

/** Nombre de la academia tal como está en la base (texto del consentimiento). */
export async function loadOrganizationName(
  executor: Executor,
  organizationId: string
): Promise<string | null> {
  const result = await executor.execute(sql`
    select name as "name" from zaltyko.organizations where id = ${organizationId}::uuid limit 1
  `);
  const row = result.rows[0] as { name?: unknown } | undefined;
  return typeof row?.name === "string" ? row.name : null;
}

/** Cliente (cus_) del último intento de esa persona pagadora en esa cuenta conectada. */
export async function findLatestCustomerReference(
  executor: Executor,
  input: { organizationId: string; accountRowId: string; familyPayerId: string }
): Promise<string | null> {
  const result = await executor.execute(sql`
    select provider_customer_reference as "reference"
      from zaltyko.family_payment_setup_attempts
     where organization_id = ${input.organizationId}::uuid
       and payment_provider_account_id = ${input.accountRowId}::uuid
       and family_payer_id = ${input.familyPayerId}::uuid
     order by created_at desc, id
     limit 1
  `);
  const row = result.rows[0] as { reference?: unknown } | undefined;
  return typeof row?.reference === "string" ? row.reference : null;
}

export async function insertSetupAttempt(
  tx: Executor,
  input: {
    id: string;
    organizationId: string;
    familyId: string;
    familyPayerId: string;
    guardianId: string;
    accountRowId: string;
    kind: PaymentMethodKind;
    customerReference: string;
    setupReference: string;
    consentVersion: string;
    consentTextSha256: string;
    consentedAt: Date;
    clientIpPrefix: string | null;
    userAgentExcerpt: string | null;
  }
): Promise<StoredSetupAttempt> {
  const result = await tx.execute(sql`
    insert into zaltyko.family_payment_setup_attempts (
      id,
      organization_id,
      family_id,
      family_payer_id,
      guardian_id,
      payment_provider_account_id,
      payment_method_kind,
      provider_customer_reference,
      provider_setup_reference,
      consent_version,
      consent_text_sha256,
      consented_at,
      client_ip_prefix,
      user_agent_excerpt,
      status,
      created_at,
      updated_at
    ) values (
      ${input.id}::uuid,
      ${input.organizationId}::uuid,
      ${input.familyId}::uuid,
      ${input.familyPayerId}::uuid,
      ${input.guardianId}::uuid,
      ${input.accountRowId}::uuid,
      ${input.kind},
      ${input.customerReference},
      ${input.setupReference},
      ${input.consentVersion},
      ${input.consentTextSha256},
      ${input.consentedAt.toISOString()}::timestamptz,
      ${input.clientIpPrefix},
      ${input.userAgentExcerpt},
      'open',
      ${input.consentedAt.toISOString()}::timestamptz,
      ${input.consentedAt.toISOString()}::timestamptz
    )
    returning ${attemptColumns}
  `);
  const inserted = toStoredAttempt(result.rows[0] as Record<string, unknown> | undefined);
  if (!inserted) throw new Error("Family payment setup attempt was not inserted");
  return inserted;
}

/**
 * Intento por su preparación (seti_), solo si es de esa persona pagadora y
 * esa familia: un seti_ ajeno nunca coincide.
 */
export async function findSetupAttemptForPayer(
  executor: Executor,
  input: { organizationId: string; familyId: string; familyPayerId: string; setupReference: string }
): Promise<StoredSetupAttempt | null> {
  const result = await executor.execute(sql`
    select ${attemptColumns}
      from zaltyko.family_payment_setup_attempts
     where organization_id = ${input.organizationId}::uuid
       and provider_setup_reference = ${input.setupReference}
       and family_id = ${input.familyId}::uuid
       and family_payer_id = ${input.familyPayerId}::uuid
     order by created_at desc, id
     limit 1
  `);
  return toStoredAttempt(result.rows[0] as Record<string, unknown> | undefined);
}

/** Bloquea el intento hasta el final de la transacción y lo devuelve. */
export async function lockSetupAttempt(
  tx: Executor,
  input: { organizationId: string; attemptId: string }
): Promise<StoredSetupAttempt | null> {
  const result = await tx.execute(sql`
    select ${attemptColumns}
      from zaltyko.family_payment_setup_attempts
     where organization_id = ${input.organizationId}::uuid
       and id = ${input.attemptId}::uuid
     for update
  `);
  return toStoredAttempt(result.rows[0] as Record<string, unknown> | undefined);
}

/** Solo un intento todavía abierto pasa a `abandoned`. Devuelve si cambió. */
export async function markSetupAttemptAbandoned(
  executor: Executor,
  input: { organizationId: string; attemptId: string; now: Date }
): Promise<boolean> {
  const result = await executor.execute(sql`
    update zaltyko.family_payment_setup_attempts
       set status = 'abandoned',
           updated_at = ${input.now.toISOString()}::timestamptz
     where organization_id = ${input.organizationId}::uuid
       and id = ${input.attemptId}::uuid
       and status = 'open'
    returning id::text as "id"
  `);
  return result.rows.length > 0;
}

export async function markSetupAttemptCompleted(
  tx: Executor,
  input: { organizationId: string; attemptId: string; authorizationId: string; now: Date }
): Promise<void> {
  const result = await tx.execute(sql`
    update zaltyko.family_payment_setup_attempts
       set status = 'completed',
           authorization_id = ${input.authorizationId}::uuid,
           updated_at = ${input.now.toISOString()}::timestamptz
     where organization_id = ${input.organizationId}::uuid
       and id = ${input.attemptId}::uuid
       and status = 'open'
    returning id::text as "id"
  `);
  if (result.rows.length !== 1) {
    throw new Error("Family payment setup attempt was not open when completing");
  }
}

/** Autorización activa de esa persona pagadora en esa cuenta conectada (sin bloquear). */
export async function findActiveAuthorization(
  executor: Executor,
  input: { organizationId: string; accountRowId: string; familyPayerId: string }
): Promise<StoredAuthorization | null> {
  const result = await executor.execute(sql`
    select ${authorizationColumns}
      from zaltyko.family_payment_authorizations
     where organization_id = ${input.organizationId}::uuid
       and payment_provider_account_id = ${input.accountRowId}::uuid
       and family_payer_id = ${input.familyPayerId}::uuid
       and status = 'active'::zaltyko.payment_authorization_status
     limit 1
  `);
  return toStoredAuthorization(result.rows[0] as Record<string, unknown> | undefined);
}

/** Igual que findActiveAuthorization, pero bloquea la fila hasta el final de la transacción. */
export async function lockActiveAuthorization(
  tx: Executor,
  input: { organizationId: string; accountRowId: string; familyPayerId: string }
): Promise<StoredAuthorization | null> {
  const result = await tx.execute(sql`
    select ${authorizationColumns}
      from zaltyko.family_payment_authorizations
     where organization_id = ${input.organizationId}::uuid
       and payment_provider_account_id = ${input.accountRowId}::uuid
       and family_payer_id = ${input.familyPayerId}::uuid
       and status = 'active'::zaltyko.payment_authorization_status
     limit 1
     for update
  `);
  return toStoredAuthorization(result.rows[0] as Record<string, unknown> | undefined);
}

/** Autorización activa por id dentro de la academia y la cuenta, bloqueada. */
export async function lockActiveAuthorizationById(
  tx: Executor,
  input: { organizationId: string; accountRowId: string; authorizationId: string }
): Promise<StoredAuthorization | null> {
  const result = await tx.execute(sql`
    select ${authorizationColumns}
      from zaltyko.family_payment_authorizations
     where organization_id = ${input.organizationId}::uuid
       and payment_provider_account_id = ${input.accountRowId}::uuid
       and id = ${input.authorizationId}::uuid
       and status = 'active'::zaltyko.payment_authorization_status
     for update
  `);
  return toStoredAuthorization(result.rows[0] as Record<string, unknown> | undefined);
}

export async function insertActiveAuthorization(
  tx: Executor,
  input: {
    organizationId: string;
    familyId: string;
    familyPayerId: string;
    accountRowId: string;
    setupReference: string;
    paymentMethodReference: string;
    mandateReference: string | null;
    kind: PaymentMethodKind;
    consentVersion: string;
    consentEvidenceReference: string;
    consentEvidenceSha256: string;
    consentedAt: Date;
    consentedByGuardianId: string;
    now: Date;
  }
): Promise<StoredAuthorization> {
  const result = await tx.execute(sql`
    insert into zaltyko.family_payment_authorizations (
      organization_id,
      family_id,
      family_payer_id,
      payment_provider_account_id,
      status,
      provider_setup_reference,
      payment_method_reference,
      mandate_reference,
      payment_method_kind,
      consent_version,
      consent_evidence_reference,
      consent_evidence_sha256,
      consented_at,
      consented_by_guardian_id,
      created_at,
      updated_at
    ) values (
      ${input.organizationId}::uuid,
      ${input.familyId}::uuid,
      ${input.familyPayerId}::uuid,
      ${input.accountRowId}::uuid,
      'active'::zaltyko.payment_authorization_status,
      ${input.setupReference},
      ${input.paymentMethodReference},
      ${input.mandateReference},
      ${input.kind},
      ${input.consentVersion},
      ${input.consentEvidenceReference},
      ${input.consentEvidenceSha256},
      ${input.consentedAt.toISOString()}::timestamptz,
      ${input.consentedByGuardianId}::uuid,
      ${input.now.toISOString()}::timestamptz,
      ${input.now.toISOString()}::timestamptz
    )
    returning ${authorizationColumns}
  `);
  const inserted = toStoredAuthorization(result.rows[0] as Record<string, unknown> | undefined);
  if (!inserted) throw new Error("Family payment authorization was not inserted");
  return inserted;
}

/** Marca `revoked` una autorización activa ya bloqueada. */
export async function revokeAuthorization(
  tx: Executor,
  input: { organizationId: string; authorizationId: string; now: Date }
): Promise<void> {
  const result = await tx.execute(sql`
    update zaltyko.family_payment_authorizations
       set status = 'revoked'::zaltyko.payment_authorization_status,
           revoked_at = ${input.now.toISOString()}::timestamptz,
           updated_at = ${input.now.toISOString()}::timestamptz
     where organization_id = ${input.organizationId}::uuid
       and id = ${input.authorizationId}::uuid
       and status = 'active'::zaltyko.payment_authorization_status
    returning id::text as "id"
  `);
  if (result.rows.length !== 1) {
    throw new Error("Family payment authorization was not active when revoking");
  }
}

/**
 * Autorizaciones activas de la academia en esa cuenta conectada, con el
 * nombre de la persona pagadora (para el panel de la academia).
 */
export async function listActiveAuthorizationsForOrganization(
  executor: Executor,
  input: { organizationId: string; accountRowId: string; limit: number }
): Promise<OwnerAuthorizationRow[]> {
  const result = await executor.execute(sql`
    select a.id::text as "authorizationId",
           a.family_id::text as "familyId",
           p.given_name as "givenName",
           p.family_name as "familyName",
           a.payment_method_kind as "method",
           a.consented_at as "since"
      from zaltyko.family_payment_authorizations a
      join zaltyko.family_payers fp
        on fp.organization_id = a.organization_id
       and fp.family_id = a.family_id
       and fp.id = a.family_payer_id
      join zaltyko.guardians g
        on g.organization_id = fp.organization_id
       and g.id = fp.guardian_id
      join zaltyko.people p
        on p.organization_id = g.organization_id
       and p.id = g.person_id
     where a.organization_id = ${input.organizationId}::uuid
       and a.payment_provider_account_id = ${input.accountRowId}::uuid
       and a.status = 'active'::zaltyko.payment_authorization_status
     order by a.consented_at desc, a.id
     limit ${input.limit}
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    authorizationId: String(row.authorizationId),
    familyId: String(row.familyId),
    givenName: String(row.givenName ?? ""),
    familyName: String(row.familyName ?? ""),
    method: String(row.method) as PaymentMethodKind,
    since: toDate(row.since),
  }));
}
