import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  assertFamilyAccessFlag,
  assertFamilyAccessStorage,
  familyAccessUnavailable,
} from "@/modules/family-access/application/family-access-storage";
import { sha256Hex } from "@/modules/family-access/domain/family-access-hash";

export type Tx = TransactionClient;

export async function rows<Row>(tx: Tx, statement: SQL): Promise<Row[]> {
  const result = await tx.execute(statement);
  return result.rows as unknown as Row[];
}

export const iso = (value: Date | string) => new Date(value).toISOString();

/**
 * Transacción de la función: bandera antes de abrir conexión y candidato
 * exacto dentro. Un fallo inesperado responde «no disponible», nunca el
 * detalle de la base de datos.
 */
export async function familyAccessTransaction<T>(
  work: (tx: Tx) => Promise<T>,
  options: { allowWhenFlagOff?: boolean } = {}
): Promise<T> {
  // Solo quitar acceso (retirar la cuenta vinculada) funciona con la bandera
  // apagada; sigue exigiendo el candidato instalado.
  if (!options.allowWhenFlagOff) assertFamilyAccessFlag();
  try {
    return await db.transaction(async (tx) => {
      await assertFamilyAccessStorage(tx);
      return work(tx);
    });
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw familyAccessUnavailable();
  }
}

const privilegedRoles = ["owner", "admin", "manager"] as const;

/**
 * Dirección, administración o coordinación activas con acceso a la sede.
 * Con `allSites`, además, acceso a todas las sedes: una familia no pertenece a
 * una sola sede, igual que el contacto compartido de un tutor.
 */
export async function assertFamilyManager(
  tx: Tx,
  input: { organizationId: string; locationId: string; actor: OperationalActor; allSites: boolean; write?: boolean }
) {
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: privilegedRoles,
    ...(input.write ? { intent: "write" as const } : {}),
  });
  if (input.allSites && member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Para gestionar el acceso de las familias necesitas acceso a todas las sedes de la academia.",
      403
    );
  }
  return member;
}

/** Sedes activas que puede ver este miembro (todas, o las de su alcance). */
export async function memberLocationIds(tx: Tx, input: { organizationId: string; memberId: string; scopeMode: string }): Promise<string[]> {
  const result = input.scopeMode === "all"
    ? await rows<{ id: string }>(tx, sql`select id::text from zaltyko.locations
        where organization_id=${input.organizationId}::uuid and is_active order by id`)
    : await rows<{ id: string }>(tx, sql`select l.id::text from zaltyko.member_location_scopes s
        join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id and l.is_active
        where s.organization_id=${input.organizationId}::uuid and s.member_id=${input.memberId}::uuid order by l.id`);
  return result.map((row) => row.id);
}

export type CommandAudit = { requestHash: string; result: Record<string, unknown> };

/** Clave de auditoría de un comando: la clave del cliente nunca se guarda en claro. */
export function auditKey(prefix: string, userId: string, clientKey: string): string {
  return `${prefix}_${sha256Hex(`${userId}:${clientKey}`)}`;
}

/**
 * Repetición idempotente: el mismo actor con la misma clave recibe el
 * resultado guardado; con otros parámetros, 409.
 */
export async function priorCommand(tx: Tx, input: { organizationId: string; key: string; requestHash: string }): Promise<Record<string, unknown> | null> {
  const prior = await rows<{ metadata: CommandAudit | null }>(tx, sql`select metadata from zaltyko.audit_log
    where organization_id=${input.organizationId}::uuid and idempotency_key=${input.key} limit 1`);
  const row = prior[0];
  if (!row) return null;
  if (row.metadata?.requestHash !== input.requestHash) {
    throw new OperationalError("IDEMPOTENCY_CONFLICT", "La clave de idempotencia ya fue usada con otros parámetros", 409);
  }
  return row.metadata.result ?? {};
}

export function fingerprint(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}

export async function assertOrganizationOperational(tx: Tx, organizationId: string): Promise<{ id: string; name: string; timezone: string }> {
  const result = await rows<{ id: string; name: string; status: string; timezone: string }>(tx, sql`select id::text,name,status::text,default_timezone as timezone
    from zaltyko.organizations where id=${organizationId}::uuid`);
  const row = result[0];
  if (!row) throw new OperationalError("NOT_FOUND", "Organización no disponible", 404);
  if (!["trial", "active"].includes(row.status)) {
    throw new OperationalError("INVALID_STATE_TRANSITION", "La academia no admite cambios ahora mismo.", 409);
  }
  return { id: row.id, name: row.name, timezone: row.timezone };
}
