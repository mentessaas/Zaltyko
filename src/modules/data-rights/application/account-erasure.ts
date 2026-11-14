import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";

/**
 * Supresión de una cuenta (RGPD art. 17) sin perder los registros que cada
 * academia debe conservar. Ver docs/privacy/borrado-de-cuentas-y-fichas.md.
 *
 * La pertenencia (`zaltyko.organization_members`) no se borra: este paso la
 * revoca en todas las academias, en la misma transacción que comprueba los
 * bloqueos. Después, el llamador borra la cuenta en Supabase Auth y las claves
 * foráneas del candidato `20261114120000_account_erasure_candidate.sql` vacían
 * `user_id` y el resto de referencias a la cuenta (o borran lo que solo era
 * suyo). Sin el candidato instalado, la supresión falla cerrada (503): el borrado
 * en Auth arrastraría las pertenencias y chocaría con su autoría.
 */

export type AccountErasureErrorCode =
  | "ACCOUNT_ERASURE_NOT_AVAILABLE"
  | "ACCOUNT_ERASURE_LAST_OWNER"
  | "ACCOUNT_ERASURE_RETAINED_BILLING_EVIDENCE"
  | "ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES"
  | "ACCOUNT_ERASURE_AUTH_FAILED";

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

export interface AccountErasurePreparation {
  /** Pertenencias revocadas ahora (las ya revocadas no cuentan). */
  revokedMemberships: number;
  /** Academias en las que la cuenta tenía pertenencia, en cualquier estado. */
  organizations: number;
  /** Reclamaciones pendientes del directorio retiradas. */
  withdrawnDirectoryClaims: number;
}

type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? []);
const first = (result: unknown): Row => rows(result)[0] ?? {};

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

/**
 * Prepara la supresión de `userId` en una transacción del llamador. No borra la
 * cuenta: eso lo hace Supabase Auth después del commit. Si algo bloquea, lanza
 * `AccountErasureError` sin haber escrito nada.
 */
export async function prepareAccountErasure(
  tx: TransactionClient,
  input: { userId: string; actorUserId: string | null }
): Promise<AccountErasurePreparation> {
  const canonical = first(
    await tx.execute(sql`select to_regclass('zaltyko.organization_members') is not null as present`)
  ).present === true;
  let revokedMemberships = 0;
  let organizations = 0;

  if (canonical) {
    if (!(await isAccountErasureSchemaInstalled(tx))) {
      throw new AccountErasureError(
        "ACCOUNT_ERASURE_NOT_AVAILABLE",
        "La supresión de cuentas aún no está disponible: falta aplicar la migración de borrado de cuentas.",
        503
      );
    }

    // Bloquea las pertenencias de la cuenta y las de dueña de esas academias,
    // en orden estable, para que dos supresiones simultáneas no dejen una
    // academia sin dueña.
    const memberships = rows(await tx.execute(sql`
      select id::text, organization_id::text, role::text, status::text
      from zaltyko.organization_members
      where user_id = ${input.userId}::uuid
      order by organization_id, id
      for update
    `));
    organizations = new Set(memberships.map((row) => String(row.organization_id))).size;

    const evidence = first(await tx.execute(sql`
      select exists (
        select 1 from zaltyko.organization_saas_webhook_reconciliation_decisions
        where actor_user_id = ${input.userId}::uuid
      ) as present
    `));
    if (evidence.present === true) {
      throw new AccountErasureError(
        "ACCOUNT_ERASURE_RETAINED_BILLING_EVIDENCE",
        "Esta cuenta firmó decisiones de conciliación de cobros de Zaltyko, que se conservan como evidencia fiscal. No se puede suprimir.",
        409
      );
    }

    const ownedOrganizations = memberships
      .filter((row) => row.role === "owner" && row.status === "active")
      .map((row) => String(row.organization_id));
    if (ownedOrganizations.length > 0) {
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
    revokedMemberships = revoked.length;
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
  }

  // Directorio público: una reclamación pendiente de una cuenta suprimida se
  // retira; sus pruebas siguen la purga de 30 días de src/lib/directory/maintenance.ts.
  let withdrawnDirectoryClaims = 0;
  const directory = first(
    await tx.execute(sql`select to_regclass('public.directory_claims') is not null as present`)
  ).present === true;
  if (directory) {
    withdrawnDirectoryClaims = rows(await tx.execute(sql`
      update public.directory_claims
      set status = 'withdrawn', decided_at = now(), decision = coalesce(decision, 'Cuenta suprimida')
      where user_id = ${input.userId}::uuid and status in ('pending', 'disputed')
      returning id
    `)).length;
  }

  return { revokedMemberships, organizations, withdrawnDirectoryClaims };
}

export interface AccountErasureDependencies {
  /** Transacción de base de datos (withTransaction en producción). */
  transaction: <T>(callback: (tx: TransactionClient) => Promise<T>) => Promise<T>;
  /** Academias legacy (`public.academies`) cuya dueña es este perfil. */
  countLegacyOwnedAcademies: (profileId: string) => Promise<number>;
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
  // public.academies.owner_id borra en cascada la academia legacy entera (con
  // sus cobros y facturas) al borrar el perfil: nunca como efecto lateral.
  const ownedAcademies = await deps.countLegacyOwnedAcademies(input.profileId);
  if (ownedAcademies > 0) {
    throw new AccountErasureError(
      "ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES",
      "Este perfil es dueño de academias. Transfiérelas o ciérralas antes de suprimir la cuenta: borrarlo eliminaría sus datos, cobros y facturas.",
      409,
      { academies: ownedAcademies }
    );
  }

  let preparation: AccountErasurePreparation = { revokedMemberships: 0, organizations: 0, withdrawnDirectoryClaims: 0 };
  if (input.userId) {
    const userId = input.userId;
    preparation = await deps.transaction((tx) =>
      prepareAccountErasure(tx, { userId, actorUserId: input.actorUserId })
    );
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
  await deps.deleteLegacyProfile(input.profileId);
  return preparation;
}
