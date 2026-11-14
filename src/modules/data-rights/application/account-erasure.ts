import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";

/**
 * Supresión de una cuenta (RGPD art. 17) sin perder los registros que cada
 * academia debe conservar. Ver docs/privacy/borrado-de-cuentas-y-fichas.md.
 *
 * La pertenencia (`zaltyko.organization_members`) no se borra: este paso la
 * revoca en todas las academias, en la misma transacción que comprueba los
 * bloqueos. Después, el llamador borra la cuenta en Supabase Auth y el perfil
 * legacy; las claves foráneas del candidato
 * `20261114120000_account_erasure_candidate.sql` vacían las referencias a la
 * cuenta y al perfil (o borran lo que solo era suyo). Sin el candidato
 * instalado, la supresión falla cerrada (503).
 */

export type AccountErasureErrorCode =
  | "ACCOUNT_ERASURE_NOT_AVAILABLE"
  | "ACCOUNT_ERASURE_LAST_OWNER"
  | "ACCOUNT_ERASURE_RETAINED_BILLING_EVIDENCE"
  | "ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES"
  | "ACCOUNT_ERASURE_BLOCKED_REFERENCE"
  | "ACCOUNT_ERASURE_CONCURRENT"
  | "ACCOUNT_ERASURE_AUTH_FAILED"
  | "ACCOUNT_ERASURE_PROFILE_BLOCKED";

export class AccountErasureError extends Error {
  constructor(
    public readonly code: AccountErasureErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, number>,
    /** Error original (por ejemplo, de Supabase Auth); solo para el registro. */
    public readonly underlying?: unknown
  ) {
    super(message);
    this.name = "AccountErasureError";
  }
}

/** Acción de auditoría que queda en cada academia afectada. */
export const ACCOUNT_ERASURE_AUDIT_ACTION = "member.account_erased";

/** Email y nombre que sustituyen a los de una invitación aceptada por la cuenta suprimida. */
export const ERASED_INVITEE_GIVEN_NAME = "Cuenta";
export const ERASED_INVITEE_FAMILY_NAME = "suprimida";
export const erasedInvitationEmail = (invitationId: string) => `cuenta-suprimida+${invitationId}@zaltyko.invalid`;

/** Bloqueo justificado: evidencia fiscal de Zaltyko (RESTRICT en la candidata). */
const RECONCILIATION_EVIDENCE = "zaltyko.organization_saas_webhook_reconciliation_decisions.actor_user_id";
/** Bloqueo justificado: la academia legacy no se borra con su dueña (RESTRICT en la candidata). */
const LEGACY_ACADEMY_OWNER = "public.academies.owner_id";

export interface AccountErasurePreparation {
  /** Pertenencias revocadas ahora (las ya revocadas no cuentan). */
  revokedMemberships: number;
  /** Academias en las que la cuenta tenía pertenencia, en cualquier estado. */
  organizations: number;
  /** Invitaciones aceptadas por la cuenta cuyo email y nombre se sustituyeron. */
  pseudonymizedInvitations: number;
  /** Reclamaciones pendientes del directorio retiradas. */
  withdrawnDirectoryClaims: number;
  /** Suscripciones de correo del directorio dadas de baja (por cuenta o por su email). */
  withdrawnDirectorySubscriptions: number;
}

const EMPTY_PREPARATION: AccountErasurePreparation = {
  revokedMemberships: 0,
  organizations: 0,
  pseudonymizedInvitations: 0,
  withdrawnDirectoryClaims: 0,
  withdrawnDirectorySubscriptions: 0,
};

type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? []);
const first = (result: unknown): Row => rows(result)[0] ?? {};

/** Código SQLSTATE de un error de pg, directo o envuelto por Drizzle. */
export function postgresErrorCode(error: unknown): string | undefined {
  const direct = (error as { code?: unknown } | null)?.code;
  if (typeof direct === "string" && /^[0-9A-Z]{5}$/.test(direct)) return direct;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === "string" ? cause : undefined;
}

/** El candidato está instalado si la pertenencia ya no se borra en cascada. */
export async function isAccountErasureSchemaInstalled(tx: TransactionClient): Promise<boolean> {
  const result = await tx.execute(sql`
    select
      exists (
        select 1 from pg_constraint
        where conrelid = to_regclass('zaltyko.organization_members')
          and conname = 'organization_members_user_id_fkey' and confdeltype = 'n'
      )
      and exists (
        select 1 from pg_constraint
        where conrelid = to_regclass('zaltyko.organization_members')
          and conname = 'organization_members_erased_account_revoked_ck'
      ) as installed
  `);
  return first(result).installed === true;
}

interface BlockingReference {
  /** `esquema.tabla.columna` */
  reference: string;
  /** Filas que apuntan a la cuenta o al perfil. */
  rows: number;
}

/**
 * Filas que impedirían borrar la cuenta o el perfil: cualquier clave NO
 * ACTION/RESTRICT hacia `auth.users` o `public.profiles`, en cualquier esquema
 * salvo `auth`, que apunte a esta persona. Se lee del catálogo, así que una
 * clave nueva que nadie revisó también bloquea aquí, antes de revocar nada, y
 * no después en Auth.
 */
async function findBlockingReferences(
  tx: TransactionClient,
  input: { userId: string; profileId: string | null }
): Promise<BlockingReference[]> {
  const keys = rows(await tx.execute(sql`
    select n.nspname::text as schema_name, c.relname::text as table_name, a.attname::text as column_name,
      case when k.confrelid = 'auth.users'::regclass or fa.attname = 'user_id' then 'user' else 'profile' end as points_to
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_attribute fa on fa.attrelid = k.confrelid and fa.attnum = k.confkey[1]
    where k.contype = 'f' and k.confdeltype in ('a', 'r') and cardinality(k.conkey) = 1
      and (k.confrelid = 'auth.users'::regclass or k.confrelid = to_regclass('public.profiles'))
      and n.nspname <> 'auth'
    order by 1, 2, 3
  `));
  const blocking: BlockingReference[] = [];
  for (const key of keys) {
    const value = key.points_to === "user" ? input.userId : input.profileId;
    if (!value) continue;
    const count = first(await tx.execute(sql`
      select count(*)::int as total
      from ${sql.identifier(String(key.schema_name))}.${sql.identifier(String(key.table_name))}
      where ${sql.identifier(String(key.column_name))} = ${value}::uuid
    `));
    const total = Number(count.total ?? 0);
    if (total > 0) {
      blocking.push({ reference: `${key.schema_name}.${key.table_name}.${key.column_name}`, rows: total });
    }
  }
  return blocking;
}

/**
 * Prepara la supresión en una transacción del llamador. No borra la cuenta ni
 * el perfil: eso ocurre después del commit. Si algo bloquea, lanza
 * `AccountErasureError` sin haber escrito nada.
 */
export async function prepareAccountErasure(
  tx: TransactionClient,
  input: { userId: string; profileId: string | null; actorUserId: string | null }
): Promise<AccountErasurePreparation> {
  // Con otra supresión o una escritura larga en curso, mejor fallar pronto
  // (55P03, reintentable) que esperar con filas bloqueadas.
  await tx.execute(sql`set local lock_timeout = '5s'`);
  if (!(await isAccountErasureSchemaInstalled(tx))) {
    throw new AccountErasureError(
      "ACCOUNT_ERASURE_NOT_AVAILABLE",
      "La supresión de cuentas aún no está disponible: falta aplicar la migración de borrado de cuentas.",
      503
    );
  }

  // Bloquea, en este orden: el perfil legacy (nadie puede hacerle dueño de una
  // academia mientras tanto), las pertenencias de la cuenta y las de dueña de
  // esas academias (dos supresiones a la vez no dejan una academia sin dueña).
  if (input.profileId) {
    await tx.execute(sql`
      select id from public.profiles where id = ${input.profileId}::uuid for update
    `);
  }
  const memberships = rows(await tx.execute(sql`
    select id::text, organization_id::text, role::text, status::text
    from zaltyko.organization_members
    where user_id = ${input.userId}::uuid
    order by organization_id, id
    for update
  `));
  const organizations = new Set(memberships.map((row) => String(row.organization_id))).size;

  const blocking = await findBlockingReferences(tx, input);
  const evidence = blocking.find((item) => item.reference === RECONCILIATION_EVIDENCE);
  if (evidence) {
    throw new AccountErasureError(
      "ACCOUNT_ERASURE_RETAINED_BILLING_EVIDENCE",
      "Esta cuenta firmó decisiones de conciliación de cobros de Zaltyko, que se conservan como evidencia fiscal. No se puede suprimir.",
      409
    );
  }
  const legacyAcademies = blocking.find((item) => item.reference === LEGACY_ACADEMY_OWNER);
  if (legacyAcademies) {
    throw new AccountErasureError(
      "ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES",
      "Este perfil es dueño de academias. Transfiérelas o ciérralas antes de suprimir la cuenta: borrarlo eliminaría sus datos, cobros y facturas.",
      409,
      { academies: legacyAcademies.rows }
    );
  }
  if (blocking.length > 0) {
    throw new AccountErasureError(
      "ACCOUNT_ERASURE_BLOCKED_REFERENCE",
      `Hay registros que impiden borrar la cuenta (${blocking.map((item) => item.reference).join(", ")}). Revísalos antes de suprimirla.`,
      409,
      { references: blocking.length }
    );
  }

  const ownsActive = memberships.some((row) => row.role === "owner" && row.status === "active");
  if (ownsActive) {
    const owners = rows(await tx.execute(sql`
      select organization_id::text, user_id::text
      from zaltyko.organization_members
      where organization_id in (
          select organization_id from zaltyko.organization_members
          where user_id = ${input.userId}::uuid and role = 'owner' and status = 'active'
        )
        and role = 'owner' and status = 'active'
      order by organization_id, id
      for update
    `));
    const ownedOrganizations = memberships
      .filter((row) => row.role === "owner" && row.status === "active")
      .map((row) => String(row.organization_id));
    const orphaned = ownedOrganizations.filter(
      (organizationId) =>
        !owners.some(
          (owner) =>
            owner.organization_id === organizationId && owner.user_id !== null && owner.user_id !== input.userId
        )
    );
    if (orphaned.length > 0) {
      throw new AccountErasureError(
        "ACCOUNT_ERASURE_LAST_OWNER",
        "Esta cuenta es la única dueña activa de una academia. Transfiere la titularidad o cierra la academia antes de suprimirla.",
        409,
        { organizations: orphaned.length }
      );
    }
  }

  const revoked = rows(await tx.execute(sql`
    update zaltyko.organization_members
    set status = 'revoked', updated_at = now()
    where user_id = ${input.userId}::uuid and status <> 'revoked'
    returning id::text, organization_id::text, status::text
  `));
  const previous = new Map(memberships.map((row) => [String(row.id), String(row.status)]));
  for (const row of revoked) {
    // Queda constancia en la academia: qué pertenencia se retiró y por qué,
    // sin datos de la persona.
    await tx.execute(sql`
      insert into zaltyko.audit_log (organization_id, actor_user_id, action, target_type, target_id, before, after, metadata)
      values (
        ${String(row.organization_id)}::uuid,
        ${input.actorUserId}::uuid,
        ${ACCOUNT_ERASURE_AUDIT_ACTION},
        'organization_member',
        ${String(row.id)}::uuid,
        jsonb_build_object('status', ${previous.get(String(row.id)) ?? null}::text),
        jsonb_build_object('status', 'revoked'),
        jsonb_build_object('reason', 'account_erasure')
      )
    `);
  }

  // La invitación aceptada se conserva como evidencia de acceso de la academia
  // (con accepted_member_id), pero sin el email ni el nombre de la persona.
  const pseudonymizedInvitations = rows(await tx.execute(sql`
    update zaltyko.organization_member_invitations
    set normalized_email = 'cuenta-suprimida+' || id::text || '@zaltyko.invalid',
        invitee_given_name = case when invitee_given_name is null then null else ${ERASED_INVITEE_GIVEN_NAME} end,
        invitee_family_name = case when invitee_family_name is null then null else ${ERASED_INVITEE_FAMILY_NAME} end,
        updated_at = now()
    where accepted_by_user_id = ${input.userId}::uuid and status = 'accepted'
    returning id
  `)).length;

  // Directorio público: una reclamación pendiente de una cuenta suprimida se
  // retira; sus pruebas siguen la purga de 30 días de src/lib/directory/maintenance.ts.
  const withdrawnDirectoryClaims = rows(await tx.execute(sql`
    update public.directory_claims
    set status = 'withdrawn', decided_at = now(), decision = coalesce(decision, 'Cuenta suprimida')
    where user_id = ${input.userId}::uuid and status in ('pending', 'disputed')
    returning id
  `)).length;

  // Deja de recibir correos del directorio: sus suscripciones, por cuenta o por
  // el email de la cuenta, quedan dadas de baja (la fila se conserva como
  // prueba de la baja).
  const withdrawnDirectorySubscriptions = rows(await tx.execute(sql`
    update public.directory_subscriptions
    set withdrawn_at = now()
    where withdrawn_at is null
      and (
        user_id = ${input.userId}::uuid
        or lower(email) = (select lower(email) from auth.users where id = ${input.userId}::uuid)
      )
    returning id
  `)).length;

  return {
    revokedMemberships: revoked.length,
    organizations,
    pseudonymizedInvitations,
    withdrawnDirectoryClaims,
    withdrawnDirectorySubscriptions,
  };
}

export interface AccountErasureDependencies {
  /** Transacción de base de datos (withTransaction en producción). */
  transaction: <T>(callback: (tx: TransactionClient) => Promise<T>) => Promise<T>;
  /** Borra la cuenta en Supabase Auth; una cuenta que ya no existe no es error. */
  deleteAuthAccount: (userId: string) => Promise<void>;
  /** Borra el perfil legacy (`public.profiles`). */
  deleteLegacyProfile: (profileId: string) => Promise<void>;
}

/**
 * Orden de la supresión: comprobar y revocar (una transacción), borrar la
 * cuenta en Auth y, por último, el perfil legacy. Si Auth falla, la persona ya
 * no tiene acceso a ninguna academia y el error se devuelve para reintentar;
 * reintentar es seguro (las pertenencias ya revocadas no se tocan y una cuenta
 * ya borrada no es error).
 */
export async function eraseUserAccount(
  deps: AccountErasureDependencies,
  input: { profileId: string; userId: string | null; actorUserId: string }
): Promise<AccountErasurePreparation> {
  let preparation = EMPTY_PREPARATION;
  if (input.userId) {
    const userId = input.userId;
    try {
      preparation = await deps.transaction((tx) =>
        prepareAccountErasure(tx, { userId, profileId: input.profileId, actorUserId: input.actorUserId })
      );
    } catch (error) {
      const code = postgresErrorCode(error);
      // 40P01: dos supresiones (por ejemplo, de co-dueñas) se bloquearon entre
      // sí; 55P03: otra sesión retiene las filas. No se escribió nada.
      if (!(error instanceof AccountErasureError) && (code === "40P01" || code === "55P03")) {
        throw new AccountErasureError(
          "ACCOUNT_ERASURE_CONCURRENT",
          "Hay otra operación en curso sobre esta cuenta o sus academias. No se ha cambiado nada; vuelve a intentarlo en unos segundos.",
          409,
          undefined,
          error
        );
      }
      throw error;
    }
    try {
      await deps.deleteAuthAccount(userId);
    } catch (failure) {
      throw new AccountErasureError(
        "ACCOUNT_ERASURE_AUTH_FAILED",
        "Se retiró el acceso a todas las academias, pero no se pudo borrar la cuenta. Vuelve a intentarlo.",
        502,
        undefined,
        failure
      );
    }
  }
  try {
    await deps.deleteLegacyProfile(input.profileId);
  } catch (error) {
    // 23503: alguien enlazó el perfil (por ejemplo, como dueño de una academia)
    // después de la comprobación. La cuenta ya no existe; el perfil se queda.
    if (postgresErrorCode(error) === "23503") {
      throw new AccountErasureError(
        "ACCOUNT_ERASURE_PROFILE_BLOCKED",
        "No se pudo borrar el perfil: sigue vinculado a registros que lo impiden (por ejemplo, una academia). Si tenía cuenta, ya está suprimida. Resuélvelo y vuelve a intentarlo.",
        409,
        undefined,
        error
      );
    }
    throw error;
  }
  return preparation;
}
