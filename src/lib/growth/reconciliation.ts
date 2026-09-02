import {
  CANONICAL_EVENT_ALIASES,
  CANONICAL_EVENT_NAMES,
  REQUIRED_EVENT_PROPERTIES,
  type CanonicalEnvironment,
  type CanonicalEventName,
  type EvidenceScope,
  type GrowthProperty,
} from "./canonical";

export type GrowthEventReconciliationRow = {
  eventId: string;
  eventName: string;
  idempotencyKey: string | null;
  transactionId?: string | null;
  environment: CanonicalEnvironment;
  evidenceScope: EvidenceScope;
  occurredAt: Date;
  createdAt: Date;
  properties: Record<string, GrowthProperty>;
};

export type SubscriptionReconciliationFact = {
  transactionId: string;
  subscriptionId: string;
  /** Optional when subscriptionId is the internal DB UUID. */
  stripeSubscriptionId?: string | null;
  status: string;
  environment: "test" | "sandbox" | "live";
  planCode?: string | null;
  currency?: string | null;
};

export type GrowthReconciliationReport = {
  totalRows: number;
  canonicalRows: number;
  aliasRows: number;
  duplicateIdempotencyKeys: string[];
  outOfContractRows: Array<{
    eventId: string;
    eventName: string;
    reason: string;
  }>;
  latencyMs: { min: number | null; max: number | null; average: number | null };
  subscriptionChecks: Array<{
    eventId: string;
    transactionId: string | null;
    reconciled: boolean;
    reason: string;
  }>;
  discrepancies: string[];
  evidenceScopes: Record<EvidenceScope, number>;
  reproducible: boolean;
};

function canonicalName(eventName: string): CanonicalEventName | null {
  if ((CANONICAL_EVENT_NAMES as readonly string[]).includes(eventName)) {
    return eventName as CanonicalEventName;
  }
  return (
    CANONICAL_EVENT_ALIASES[
      eventName as keyof typeof CANONICAL_EVENT_ALIASES
    ] ?? null
  );
}

function summarizeLatencies(rows: GrowthEventReconciliationRow[]) {
  if (rows.length === 0) return { min: null, max: null, average: null };
  const values = rows.map(
    (row) => row.createdAt.getTime() - row.occurredAt.getTime()
  );
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function duplicateIdempotencyKeys(
  rows: GrowthEventReconciliationRow[]
): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.idempotencyKey) {
      counts.set(row.idempotencyKey, (counts.get(row.idempotencyKey) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

function rowPropertyError(
  eventName: CanonicalEventName,
  properties: Record<string, GrowthProperty>
): string | null {
  for (const key of REQUIRED_EVENT_PROPERTIES[eventName] ?? []) {
    if (
      properties[key] === undefined ||
      properties[key] === null ||
      properties[key] === ""
    ) {
      return `propiedad requerida ausente: ${key}`;
    }
  }
  return null;
}

function factStripeId(fact: SubscriptionReconciliationFact): string {
  return fact.stripeSubscriptionId ?? fact.subscriptionId;
}

type SubscriptionCheck =
  GrowthReconciliationReport["subscriptionChecks"][number];

function reconcileSubscription(
  row: GrowthEventReconciliationRow,
  dbSubscriptions: SubscriptionReconciliationFact[],
  stripeSubscriptions: SubscriptionReconciliationFact[],
  discrepancies: string[]
): SubscriptionCheck {
  const transactionId = row.transactionId ?? null;
  const db = transactionId
    ? dbSubscriptions.find((fact) => fact.transactionId === transactionId)
    : undefined;
  const stripe = transactionId
    ? stripeSubscriptions.find((fact) => fact.transactionId === transactionId)
    : undefined;

  if (!db || !stripe) {
    return {
      eventId: row.eventId,
      transactionId,
      reconciled: false,
      reason: "faltan hechos DB/Stripe",
    };
  }

  const reasons: string[] = [];
  const dbActive = ["active", "trialing"].includes(db.status);
  const stripeActive = ["active", "trialing"].includes(stripe.status);
  if (!dbActive || !stripeActive) reasons.push("estado");
  if (db.environment === "live" || stripe.environment === "live") {
    reasons.push("ambiente");
  }
  if (factStripeId(db) !== stripe.subscriptionId) reasons.push("ID");

  if (db.planCode !== stripe.planCode) {
    reasons.push("planCode");
    discrepancies.push(
      `${row.eventName} ${row.eventId}: discrepancia DB/Stripe planCode`
    );
  }
  if (
    (db.currency ?? null)?.toLowerCase() !==
    (stripe.currency ?? null)?.toLowerCase()
  ) {
    reasons.push("currency");
    discrepancies.push(
      `${row.eventName} ${row.eventId}: discrepancia DB/Stripe currency`
    );
  }

  if (reasons.length > 0) {
    return {
      eventId: row.eventId,
      transactionId,
      reconciled: false,
      reason: `DB/Stripe discrepante: ${reasons.join(",")}`,
    };
  }
  return {
    eventId: row.eventId,
    transactionId,
    reconciled: true,
    reason: "reconciliado",
  };
}

/**
 * Reconciliación pura sobre filas y hechos sintéticos de DB/Stripe test.
 * Nunca abre conexiones ni convierte una intención (`checkout_started`) en
 * ingreso. Los duplicados se reportan, pero no se cuentan como una segunda
 * suscripción reconciliada.
 */
export function reconcileSyntheticGrowthData(input: {
  rows: GrowthEventReconciliationRow[];
  dbSubscriptions?: SubscriptionReconciliationFact[];
  stripeSubscriptions?: SubscriptionReconciliationFact[];
}): GrowthReconciliationReport {
  const dbSubscriptions = input.dbSubscriptions ?? [];
  const stripeSubscriptions = input.stripeSubscriptions ?? [];
  const duplicateKeys = duplicateIdempotencyKeys(input.rows);
  const outOfContractRows: GrowthReconciliationReport["outOfContractRows"] = [];
  const subscriptionChecks: GrowthReconciliationReport["subscriptionChecks"] =
    [];
  const discrepancies: string[] = [];
  const evidenceScopes: Record<EvidenceScope, number> = {
    L: 0,
    T: 0,
    P: 0,
    X: 0,
    H: 0,
  };
  let canonicalRows = 0;
  let aliasRows = 0;
  const seenSubscriptions = new Set<string>();

  for (const row of input.rows) {
    evidenceScopes[row.evidenceScope] += 1;
    const normalizedName = canonicalName(row.eventName);
    if (!normalizedName) {
      outOfContractRows.push({
        eventId: row.eventId,
        eventName: row.eventName,
        reason: "evento fuera de catálogo",
      });
      continue;
    }
    if (normalizedName === row.eventName) canonicalRows += 1;
    else aliasRows += 1;

    const propertyError = rowPropertyError(normalizedName, row.properties);
    if (propertyError) {
      outOfContractRows.push({
        eventId: row.eventId,
        eventName: row.eventName,
        reason: propertyError,
      });
    }

    if (normalizedName !== "subscription_created" || propertyError) continue;
    const key = row.idempotencyKey ?? `event:${row.eventId}`;
    if (seenSubscriptions.has(key)) continue;
    seenSubscriptions.add(key);
    subscriptionChecks.push(
      reconcileSubscription(
        row,
        dbSubscriptions,
        stripeSubscriptions,
        discrepancies
      )
    );
  }

  const latencyMs = summarizeLatencies(input.rows);
  const hasNegativeLatency = input.rows.some(
    (row) => row.createdAt.getTime() < row.occurredAt.getTime()
  );
  const reproducible =
    duplicateKeys.length === 0 &&
    outOfContractRows.length === 0 &&
    !hasNegativeLatency &&
    discrepancies.length === 0 &&
    subscriptionChecks.every((check) => check.reconciled);

  return {
    totalRows: input.rows.length,
    canonicalRows,
    aliasRows,
    duplicateIdempotencyKeys: duplicateKeys,
    outOfContractRows,
    latencyMs,
    subscriptionChecks,
    discrepancies,
    evidenceScopes,
    reproducible,
  };
}

export function isReconciledSubscription(
  result: GrowthReconciliationReport,
  transactionId: string
): boolean {
  return result.subscriptionChecks.some(
    (check) => check.transactionId === transactionId && check.reconciled
  );
}

export type ReconciledEventName = CanonicalEventName;
