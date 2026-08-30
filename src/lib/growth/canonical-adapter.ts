import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { growthEvents } from "@/db/schema";
import {
  buildCanonicalGrowthEvent,
  CANONICAL_EVENT_NAMES,
  CANONICAL_SCHEMA_VERSION,
  type CanonicalBuildResult,
  type CanonicalEnvironment,
  type CanonicalGrowthEventInput,
  type CanonicalGrowthEventRow,
  type CanonicalSource,
  type EvidenceScope,
} from "./canonical";

const CANONICAL_ENVIRONMENTS: readonly CanonicalEnvironment[] = [
  "local",
  "sandbox",
  "preview",
  "production_authorized",
];
const EVIDENCE_SCOPES: readonly EvidenceScope[] = ["L", "T", "P", "X", "H"];
const CANONICAL_SOURCES: readonly CanonicalSource[] = [
  "first_party",
  "product",
  "support",
  "reconciliation",
];

type StoredGrowthEvent = typeof growthEvents.$inferSelect;

export type CanonicalGrowthEventWriteResult = {
  status: "inserted" | "duplicate";
  row: CanonicalGrowthEventRow;
};

function isOneOf<T extends string>(
  value: string | null,
  values: readonly T[]
): value is T {
  return value !== null && values.includes(value as T);
}

function toCanonicalRow(row: StoredGrowthEvent): CanonicalGrowthEventRow {
  const environment = row.environment;
  const evidenceScope = row.evidenceScope;
  if (
    row.schemaVersion !== CANONICAL_SCHEMA_VERSION ||
    !isOneOf(environment, CANONICAL_ENVIRONMENTS) ||
    !isOneOf(evidenceScope, EVIDENCE_SCOPES) ||
    !isOneOf(row.source, CANONICAL_SOURCES) ||
    !isOneOf(row.eventName, CANONICAL_EVENT_NAMES) ||
    !row.idempotencyKey ||
    !row.eventId
  ) {
    throw new Error(
      "CANONICAL_EVENT_CONFLICT: la clave ya pertenece a una fila histórica no canónica"
    );
  }

  return {
    eventId: row.eventId,
    eventName: row.eventName,
    schemaVersion: row.schemaVersion,
    environment,
    evidenceScope,
    source: row.source,
    aliasSource: row.aliasSource ?? null,
    idempotencyKey: row.idempotencyKey,
    transactionId: row.transactionId ?? null,
    userId: row.userId ?? null,
    academyId: row.academyId ?? null,
    tenantId: row.tenantId ?? null,
    planCode: row.planCode ?? null,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    properties: row.properties ?? {},
  };
}

function valuesFromCanonical(built: CanonicalBuildResult) {
  const { row } = built;
  return {
    // `id` remains the internal storage PK; A3 identity is `event_id`.
    eventId: row.eventId,
    eventName: row.eventName,
    schemaVersion: row.schemaVersion,
    environment: row.environment,
    evidenceScope: row.evidenceScope,
    aliasSource: row.aliasSource,
    transactionId: row.transactionId,
    userId: row.userId,
    academyId: row.academyId,
    tenantId: row.tenantId,
    planCode: row.planCode,
    source: row.source,
    properties: row.properties,
    idempotencyKey: row.idempotencyKey,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

/**
 * Adapta un sobre puro A3 a `growth_events` y persiste de forma idempotente.
 *
 * La inserción no actualiza una fila existente: un retry con la misma clave
 * única lee y devuelve el primer evento. La validación canónica ocurre antes
 * de tocar la DB; este módulo es el único que cruza la frontera server-only.
 */
export async function persistCanonicalGrowthEvent(
  input: CanonicalGrowthEventInput
): Promise<CanonicalGrowthEventWriteResult> {
  const built = buildCanonicalGrowthEvent(input);
  const [inserted] = await db
    .insert(growthEvents)
    .values(valuesFromCanonical(built))
    .onConflictDoNothing({ target: growthEvents.idempotencyKey })
    .returning();

  if (inserted) {
    return { status: "inserted", row: toCanonicalRow(inserted) };
  }

  const [existing] = await db
    .select()
    .from(growthEvents)
    .where(eq(growthEvents.idempotencyKey, built.idempotencyKey))
    .limit(1);

  if (!existing) {
    throw new Error(`CANONICAL_EVENT_RETRY_NOT_FOUND: ${built.idempotencyKey}`);
  }

  return { status: "duplicate", row: toCanonicalRow(existing) };
}

// Naming used by the migration plan; the longer name remains available to
// callers that already imported the adapter during rehydration.
export const recordCanonicalGrowthEvent = persistCanonicalGrowthEvent;
