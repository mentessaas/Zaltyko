/**
 * Cobro automático de cuotas (Fase 3): acceso a
 * zaltyko.organization_collection_settings (día de cobro de cada academia).
 *
 * La tabla viene del candidato
 * docs/deployment/candidates/20261117120000_family_collection_candidate.sql
 * (sin aplicar). Todo va en SQL con columnas explícitas y solo debe llamarse
 * después de que isFamilyCollectionStorageAvailable() haya respondido `true`.
 * Sin decisiones de negocio: eso vive en el servicio.
 */
import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";

type Executor = Pick<DatabaseClient, "execute">;

export interface StoredCollectionSettings {
  organizationId: string;
  /** null = el día de vencimiento de cada cuota; 1..31 = ese día del mes. */
  collectionDayOfMonth: number | null;
  version: number;
  updatedAt: Date;
}

function toStoredSettings(row: Record<string, unknown> | undefined): StoredCollectionSettings | null {
  if (!row) return null;
  const day = row.collectionDayOfMonth;
  const updatedAt = row.updatedAt;
  return {
    organizationId: String(row.organizationId),
    collectionDayOfMonth: day === null || day === undefined ? null : Number(day),
    version: Number(row.version),
    updatedAt: updatedAt instanceof Date ? updatedAt : new Date(String(updatedAt)),
  };
}

const settingsColumns = sql`
  organization_id::text as "organizationId",
  collection_day_of_month as "collectionDayOfMonth",
  version as "version",
  updated_at as "updatedAt"
`;

/** Ajuste guardado de la academia, o `null` si nunca lo cambió (día de vencimiento). */
export async function findCollectionSettings(
  executor: Executor,
  organizationId: string
): Promise<StoredCollectionSettings | null> {
  const result = await executor.execute(sql`
    select ${settingsColumns}
      from zaltyko.organization_collection_settings
     where organization_id = ${organizationId}::uuid
     limit 1
  `);
  return toStoredSettings(result.rows[0] as Record<string, unknown> | undefined);
}

/** Igual que findCollectionSettings, pero bloquea la fila hasta el final de la transacción. */
export async function lockCollectionSettings(
  tx: Executor,
  organizationId: string
): Promise<StoredCollectionSettings | null> {
  const result = await tx.execute(sql`
    select ${settingsColumns}
      from zaltyko.organization_collection_settings
     where organization_id = ${organizationId}::uuid
     for update
  `);
  return toStoredSettings(result.rows[0] as Record<string, unknown> | undefined);
}

/**
 * Primera vez que la academia guarda el ajuste (versión 1). Devuelve `null`
 * si otra petición lo creó antes: quien llama responde conflicto de versión.
 */
export async function insertCollectionSettings(
  tx: Executor,
  input: {
    organizationId: string;
    collectionDayOfMonth: number | null;
    memberId: string;
    now: Date;
  }
): Promise<StoredCollectionSettings | null> {
  const result = await tx.execute(sql`
    insert into zaltyko.organization_collection_settings (
      organization_id,
      collection_day_of_month,
      version,
      updated_by_member_id,
      updated_at
    ) values (
      ${input.organizationId}::uuid,
      ${input.collectionDayOfMonth},
      1,
      ${input.memberId}::uuid,
      ${input.now.toISOString()}::timestamptz
    )
    on conflict (organization_id) do nothing
    returning ${settingsColumns}
  `);
  return toStoredSettings(result.rows[0] as Record<string, unknown> | undefined);
}

/** Cambia el ajuste ya bloqueado si sigue en `expectedVersion`; si no, `null`. */
export async function updateCollectionSettings(
  tx: Executor,
  input: {
    organizationId: string;
    collectionDayOfMonth: number | null;
    expectedVersion: number;
    memberId: string;
    now: Date;
  }
): Promise<StoredCollectionSettings | null> {
  const result = await tx.execute(sql`
    update zaltyko.organization_collection_settings
       set collection_day_of_month = ${input.collectionDayOfMonth},
           version = version + 1,
           updated_by_member_id = ${input.memberId}::uuid,
           updated_at = ${input.now.toISOString()}::timestamptz
     where organization_id = ${input.organizationId}::uuid
       and version = ${input.expectedVersion}
    returning ${settingsColumns}
  `);
  return toStoredSettings(result.rows[0] as Record<string, unknown> | undefined);
}
