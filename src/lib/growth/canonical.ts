import { createHash, randomUUID } from "node:crypto";

export const CANONICAL_SCHEMA_VERSION = 1 as const;

export const CANONICAL_EVENT_NAMES = [
  "page_view",
  "view_pricing",
  "sign_up_started",
  "sign_up_completed",
  "academy_created",
  "onboarding_completed",
  "feature_used",
  "trial_started",
  "checkout_started",
  "subscription_created",
  "subscription_failed",
  "support_request",
  "retention_milestone",
] as const;

export type CanonicalEventName = (typeof CANONICAL_EVENT_NAMES)[number];
export type CanonicalEnvironment =
  | "local"
  | "sandbox"
  | "preview"
  | "production_authorized";
export type CanonicalSource =
  | "first_party"
  | "product"
  | "support"
  | "reconciliation";
export type EvidenceScope = "L" | "T" | "P" | "X" | "H";
export type GrowthProperty = string | number | boolean | null;

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

export const CANONICAL_EVENT_ALIASES = {
  pricing_viewed: "view_pricing",
  academy_activated: "onboarding_completed",
  checkout_completed: "subscription_created",
  paid: "subscription_created",
  trial_converted: "subscription_created",
} as const;

export const EVENT_PROPERTY_ALLOWLIST: Record<
  CanonicalEventName,
  readonly string[]
> = {
  page_view: ["path_group", "platform", "navigation_id"],
  view_pricing: ["plan_code", "platform", "surface"],
  sign_up_started: [
    "platform",
    "source",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "referrer_host",
  ],
  sign_up_completed: ["platform", "plan_code", "source"],
  academy_created: ["academy_scope", "plan_code", "source"],
  onboarding_completed: ["completion_version", "academy_scope", "platform"],
  feature_used: [
    "feature_key",
    "outcome",
    "platform",
    "role",
    "business_action_id",
  ],
  trial_started: ["plan_code", "trial_days", "source"],
  checkout_started: [
    "plan_code",
    "currency",
    "platform",
    "checkout_attempt_id",
  ],
  subscription_created: [
    "plan_code",
    "currency",
    "evidence_source",
    "subscription_lifecycle_version",
  ],
  subscription_failed: [
    "plan_code",
    "failure_class",
    "retryable",
    "billing_attempt_version",
  ],
  support_request: [
    "channel",
    "category",
    "priority",
    "outcome",
    "support_request_version",
  ],
  retention_milestone: ["milestone", "cohort_version", "feature_key"],
};

export const REQUIRED_EVENT_PROPERTIES: Partial<
  Record<CanonicalEventName, readonly string[]>
> = {
  page_view: ["path_group", "platform", "navigation_id"],
  view_pricing: ["platform", "surface"],
  sign_up_started: ["platform", "source"],
  sign_up_completed: ["platform", "source"],
  academy_created: ["academy_scope", "source"],
  onboarding_completed: ["completion_version", "academy_scope"],
  feature_used: ["feature_key", "outcome", "business_action_id"],
  trial_started: ["plan_code", "trial_days"],
  checkout_started: ["plan_code", "currency", "checkout_attempt_id"],
  subscription_created: [
    "plan_code",
    "currency",
    "evidence_source",
    "subscription_lifecycle_version",
  ],
  subscription_failed: [
    "failure_class",
    "retryable",
    "billing_attempt_version",
  ],
  support_request: [
    "channel",
    "category",
    "priority",
    "support_request_version",
  ],
  retention_milestone: ["milestone", "cohort_version"],
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_BUSINESS_KEY_PATTERN = /^[a-z0-9:_./-]{1,160}$/i;
const OPAQUE_TRANSACTION_ID_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FORBIDDEN_PROPERTY_PATTERN =
  /email|e_mail|name|phone|message|password|token|secret|birth|minor|family|parent|child|address|card/i;

const SAFE_ENUMS: Record<string, readonly string[]> = {
  platform: ["web", "mobile", "server"],
  currency: ["eur", "usd", "mxn", "ars", "clp", "cop"],
  milestone: ["d1", "d7", "d30"],
  outcome: ["success", "failed", "confirmed", "pending"],
  evidence_source: [
    "db+stripe_test",
    "db+stripe_preview",
    "db+stripe_production_authorized",
  ],
  academy_scope: ["single", "owner", "academy", "tenant"],
  retryable: ["true", "false"],
};

export type ConsentSnapshot = {
  state: "granted" | "revoked" | "not_required";
  revokedAt: Date | null;
  policyVersion: string;
};

export type ReconciliationEvidence = {
  providerEnvironment: "test" | "sandbox" | "live";
  db: {
    subscriptionId: string;
    stripeSubscriptionId: string | null;
    status: string;
    planCode?: string | null;
    currency?: string | null;
  };
  stripe: {
    subscriptionId: string;
    status: string;
    planCode?: string | null;
    currency?: string | null;
    livemode: boolean;
  };
};

export type OnboardingTasks = {
  create_first_group?: boolean;
  add_5_athletes?: boolean;
  invite_first_coach?: boolean;
};

export type CanonicalGrowthEventInput = {
  eventName: string;
  eventId?: string;
  businessKey: string;
  userId?: string | null;
  academyId?: string | null;
  tenantId?: string | null;
  source: CanonicalSource;
  environment: CanonicalEnvironment;
  evidenceScope: EvidenceScope;
  consent: ConsentSnapshot | null;
  currentPolicyVersion?: string;
  transactionId?: string | null;
  idempotencyKey?: string | null;
  occurredAt?: Date;
  properties?: Record<string, GrowthProperty>;
  onboardingTasks?: OnboardingTasks;
  reconciliation?: ReconciliationEvidence;
};

export type CanonicalGrowthEventRow = {
  eventId: string;
  eventName: CanonicalEventName;
  schemaVersion: typeof CANONICAL_SCHEMA_VERSION;
  environment: CanonicalEnvironment;
  evidenceScope: EvidenceScope;
  source: CanonicalSource;
  aliasSource: string | null;
  idempotencyKey: string;
  transactionId: string | null;
  userId: string | null;
  academyId: string | null;
  tenantId: string | null;
  planCode: string | null;
  occurredAt: Date;
  createdAt: Date;
  properties: Record<string, GrowthProperty>;
};

export type CanonicalBuildResult = {
  ok: true;
  canonicalEventName: CanonicalEventName;
  aliasSource: string | null;
  idempotencyKey: string;
  row: CanonicalGrowthEventRow;
};

export class CanonicalGrowthEventError extends Error {
  readonly code = "invalid_event" as const;

  constructor(message: string) {
    super(message);
    this.name = "CanonicalGrowthEventError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isCanonicalEventName(
  value: string
): value is CanonicalEventName {
  return (CANONICAL_EVENT_NAMES as readonly string[]).includes(value);
}

export function canonicalizeEventName(
  eventName: string
): CanonicalEventName | null {
  if (isCanonicalEventName(eventName)) return eventName;
  return (
    CANONICAL_EVENT_ALIASES[
      eventName as keyof typeof CANONICAL_EVENT_ALIASES
    ] ?? null
  );
}

export function opaqueTransactionId(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assertUuid(value: string | null | undefined, label: string): void {
  if (value !== undefined && value !== null && !UUID_PATTERN.test(value)) {
    throw new CanonicalGrowthEventError(`${label} debe ser UUID`);
  }
}

function assertConsent(
  consent: ConsentSnapshot | null,
  currentPolicyVersion: string | undefined
): void {
  if (
    !consent ||
    !currentPolicyVersion ||
    consent.state !== "granted" ||
    consent.revokedAt !== null ||
    consent.policyVersion !== currentPolicyVersion
  ) {
    throw new CanonicalGrowthEventError(
      "El evento exige consentimiento owner granted y policy vigente"
    );
  }
}

function assertPropertyValue(key: string, value: GrowthProperty): void {
  if (typeof value === "string" && value.length > 180) {
    throw new CanonicalGrowthEventError(`propiedad ${key} supera el límite`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new CanonicalGrowthEventError(`propiedad ${key} no es finita`);
  }
  if (
    key === "trial_days" &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 90)
  ) {
    throw new CanonicalGrowthEventError("trial_days fuera de catálogo");
  }
  const allowedValues = SAFE_ENUMS[key];
  const enumValue =
    typeof value === "boolean"
      ? String(value)
      : typeof value === "string"
        ? value
        : null;
  if (
    allowedValues &&
    enumValue !== null &&
    !allowedValues.includes(enumValue.toLowerCase())
  ) {
    throw new CanonicalGrowthEventError(`propiedad ${key} fuera de catálogo`);
  }
}

function assertProperties(
  eventName: CanonicalEventName,
  properties: Record<string, GrowthProperty>
): void {
  const allowlist = EVENT_PROPERTY_ALLOWLIST[eventName];
  for (const [key, value] of Object.entries(properties)) {
    if (!SAFE_KEY_PATTERN.test(key)) {
      throw new CanonicalGrowthEventError(
        `propiedad ${key} tiene una clave inválida`
      );
    }
    if (FORBIDDEN_PROPERTY_PATTERN.test(key)) {
      throw new CanonicalGrowthEventError(`propiedad ${key} parece PII`);
    }
    if (!allowlist.includes(key)) {
      throw new CanonicalGrowthEventError(
        `propiedad ${key} no está allowlisted para ${eventName}`
      );
    }
    assertPropertyValue(key, value);
  }
  for (const required of REQUIRED_EVENT_PROPERTIES[eventName] ?? []) {
    if (
      properties[required] === undefined ||
      properties[required] === null ||
      properties[required] === ""
    ) {
      throw new CanonicalGrowthEventError(
        `propiedad requerida ausente: ${required}`
      );
    }
  }
}

function assertOnboardingComplete(
  input: CanonicalGrowthEventInput,
  eventName: string
): void {
  const tasks = input.onboardingTasks;
  if (
    tasks?.create_first_group !== true ||
    tasks.add_5_athletes !== true ||
    tasks.invite_first_coach !== true
  ) {
    throw new CanonicalGrowthEventError(
      `${eventName} exige las tres tareas de onboarding completas`
    );
  }
}

function assertFailedReconciliation(
  reconciliation: ReconciliationEvidence | undefined,
  environment: CanonicalEnvironment
): asserts reconciliation is ReconciliationEvidence {
  if (!reconciliation) {
    throw new CanonicalGrowthEventError(
      "El evento de fallo exige reconciliación DB + Stripe"
    );
  }
  if (
    reconciliation.providerEnvironment === "live" ||
    environment === "production_authorized"
  ) {
    throw new CanonicalGrowthEventError(
      "A3 sólo permite Stripe test/sandbox; Stripe live queda fuera de alcance"
    );
  }
  const failedStatuses = [
    "past_due",
    "unpaid",
    "incomplete",
    "incomplete_expired",
  ];
  if (
    !failedStatuses.includes(String(reconciliation.db.status)) ||
    !failedStatuses.includes(reconciliation.stripe.status) ||
    reconciliation.db.stripeSubscriptionId !==
      reconciliation.stripe.subscriptionId ||
    reconciliation.stripe.livemode
  ) {
    throw new CanonicalGrowthEventError(
      "DB y Stripe no confirman el mismo fallo de suscripción"
    );
  }
}

/**
 * Guard canónico para `subscription_created`.
 *
 * La identidad de DB es interna; la comparación contra Stripe usa la
 * referencia `db.stripeSubscriptionId`. Plan y moneda son hechos de
 * reconciliación y cualquier discrepancia invalida el evento.
 */
export function assertReconciliation(
  reconciliation: ReconciliationEvidence | undefined,
  environment: CanonicalEnvironment
): asserts reconciliation is ReconciliationEvidence {
  if (!reconciliation) {
    throw new CanonicalGrowthEventError(
      "El evento de suscripción exige reconciliación DB + Stripe"
    );
  }
  if (
    reconciliation.providerEnvironment === "live" ||
    environment === "production_authorized"
  ) {
    throw new CanonicalGrowthEventError(
      "A3 sólo permite Stripe test/sandbox; Stripe live queda fuera de alcance"
    );
  }

  const { db, stripe } = reconciliation;
  const dbActive = ["active", "trialing"].includes(String(db.status));
  const stripeActive = ["active", "trialing"].includes(stripe.status);
  if (
    !dbActive ||
    !stripeActive ||
    db.stripeSubscriptionId !== stripe.subscriptionId ||
    stripe.livemode
  ) {
    throw new CanonicalGrowthEventError(
      "DB y Stripe no confirman la misma suscripción activa"
    );
  }
  if (db.planCode !== stripe.planCode) {
    throw new CanonicalGrowthEventError(
      "DB y Stripe tienen planCode discrepante"
    );
  }
  if (
    (db.currency ?? null)?.toLowerCase() !==
    (stripe.currency ?? null)?.toLowerCase()
  ) {
    throw new CanonicalGrowthEventError(
      "DB y Stripe tienen currency discrepante"
    );
  }
}

function assertReconciledProperties(
  properties: Record<string, GrowthProperty>,
  reconciliation: ReconciliationEvidence
): void {
  const propertyPlan = properties.plan_code;
  const propertyCurrency = properties.currency;
  if (
    typeof propertyPlan !== "string" ||
    propertyPlan !== reconciliation.stripe.planCode
  ) {
    throw new CanonicalGrowthEventError(
      "La propiedad plan_code no coincide con Stripe"
    );
  }
  if (
    typeof propertyCurrency !== "string" ||
    propertyCurrency.toLowerCase() !==
      reconciliation.stripe.currency?.toLowerCase()
  ) {
    throw new CanonicalGrowthEventError(
      "La propiedad currency no coincide con Stripe"
    );
  }
}

export function buildCanonicalGrowthEvent(
  input: CanonicalGrowthEventInput,
  now = new Date()
): CanonicalBuildResult {
  const canonicalName = canonicalizeEventName(input.eventName);
  if (!canonicalName) {
    throw new CanonicalGrowthEventError(
      `evento fuera de catálogo: ${input.eventName}`
    );
  }
  if (!CANONICAL_SOURCES.includes(input.source)) {
    throw new CanonicalGrowthEventError("source fuera de catálogo");
  }
  if (!CANONICAL_ENVIRONMENTS.includes(input.environment)) {
    throw new CanonicalGrowthEventError("environment fuera de catálogo");
  }
  if (!EVIDENCE_SCOPES.includes(input.evidenceScope)) {
    throw new CanonicalGrowthEventError("evidenceScope fuera de catálogo");
  }
  if (
    !SAFE_BUSINESS_KEY_PATTERN.test(input.businessKey) ||
    input.businessKey.includes("@")
  ) {
    throw new CanonicalGrowthEventError("businessKey inválida o PII-like");
  }
  assertConsent(input.consent, input.currentPolicyVersion);
  assertUuid(input.eventId, "eventId");
  assertUuid(input.userId, "userId");
  assertUuid(input.academyId, "academyId");
  assertUuid(input.tenantId, "tenantId");
  if (
    input.academyId !== undefined &&
    input.academyId !== null &&
    !input.tenantId
  ) {
    throw new CanonicalGrowthEventError(
      "academyId exige tenantId para conservar el scope de academia"
    );
  }
  if (
    input.transactionId !== undefined &&
    input.transactionId !== null &&
    !OPAQUE_TRANSACTION_ID_PATTERN.test(input.transactionId)
  ) {
    throw new CanonicalGrowthEventError(
      "transactionId debe ser una referencia SHA-256 opaca"
    );
  }
  if (input.occurredAt && Number.isNaN(input.occurredAt.getTime())) {
    throw new CanonicalGrowthEventError("occurredAt inválida");
  }

  const properties = { ...(input.properties ?? {}) };
  assertProperties(canonicalName, properties);

  if (canonicalName === "onboarding_completed") {
    assertOnboardingComplete(input, input.eventName);
  }
  if (canonicalName === "subscription_created") {
    if (input.source !== "reconciliation") {
      throw new CanonicalGrowthEventError(
        "subscription_created sólo acepta source=reconciliation"
      );
    }
    assertReconciliation(input.reconciliation, input.environment);
    assertReconciledProperties(properties, input.reconciliation);
  }
  if (canonicalName === "subscription_failed") {
    assertFailedReconciliation(input.reconciliation, input.environment);
  }

  const idempotencyKey =
    input.idempotencyKey ?? `v1:${canonicalName}:${input.businessKey}`;
  if (
    !SAFE_BUSINESS_KEY_PATTERN.test(idempotencyKey) ||
    idempotencyKey.includes("@")
  ) {
    throw new CanonicalGrowthEventError("idempotencyKey inválida o PII-like");
  }

  const eventId = input.eventId ?? randomUUID();
  return {
    ok: true,
    canonicalEventName: canonicalName,
    aliasSource: canonicalName === input.eventName ? null : input.eventName,
    idempotencyKey,
    row: {
      eventId,
      eventName: canonicalName,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      environment: input.environment,
      evidenceScope: input.evidenceScope,
      source: input.source,
      aliasSource: canonicalName === input.eventName ? null : input.eventName,
      idempotencyKey,
      transactionId: input.transactionId ?? null,
      userId: input.userId ?? null,
      academyId: input.academyId ?? null,
      tenantId: input.tenantId ?? null,
      planCode:
        typeof properties.plan_code === "string" ? properties.plan_code : null,
      occurredAt: input.occurredAt ?? now,
      createdAt: now,
      properties,
    },
  };
}

export function resolveGrowthEnvironment(
  env: Record<string, string | undefined> = process.env
): CanonicalEnvironment {
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.GROWTH_ENVIRONMENT === "sandbox") return "sandbox";
  if (env.NODE_ENV === "production") return "production_authorized";
  return "local";
}
