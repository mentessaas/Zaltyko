import { createHash } from "node:crypto";

import { OperationalError } from "@/modules/shared/domain/operational-error";
import type { SaasBillingInterval, SaasStripeConfig, SelfServePlanCode } from "./saas-billing-config";

// Deliberately fixed, server-owned identities. This is not a public pricing option.
export const SHORT_PAID_QA_ORGANIZATIONS = [
  "8d096bf6-4947-4815-b5bc-5741e0e1661f",
  "e6c33c2a-2ae1-404f-b95e-b4ab63ed7b47",
] as const;
export const SHORT_PAID_QA_RUN = "short-paid-expiry-20261021-v3";
export const SHORT_PAID_QA_WINDOW_START = Date.parse("2026-10-21T18:30:00Z");
export const SHORT_PAID_QA_WINDOW_END = Date.parse("2026-10-22T18:30:00Z");
const SANDBOX_REF = "aeeootdmuiqkfeernskw";
const STRIPE_TEST_ACCOUNT = "acct_1STR6eDXXopppUpe";
const PREVIEW_ORIGIN = "https://zaltyko-sandbox-preview.vercel.app";
// The DB requires 64 lowercase hex characters: retain 192 hash bits after this
// 64-bit discriminator. A second, unambiguous discriminator lives in Stripe's key.
const HASH_PREFIX = "5341415351415633";
const KEY_PREFIX = "zaltyko-saas-qa-short-v3-";
const CREATE_WINDOW_MS = 25 * 60 * 1000;

export interface ShortPaidCheckoutIdentity {
  organizationId: string;
  planCode: SelfServePlanCode;
  billingInterval: SaasBillingInterval;
  priceReference: string;
  config: Pick<SaasStripeConfig, "environment" | "providerAccountReference">;
  appUrl: string;
  databaseUrl: string;
}

export interface ShortPaidCheckoutOperation {
  id: string;
  organizationId: string;
  planCode: string;
  billingInterval: string;
  environment: string;
  providerAccountReference: string;
  createdAt: Date;
  requestHash: string;
  stripeIdempotencyKey: string;
}

export interface ShortPaidCheckoutEnvelope {
  requestHash: string;
  createdAt: Date;
  billingCycleAnchor: number;
  expiresAt: number;
  creationCutoff: number;
  configurationExpiresAt: number;
}

export function isShortPaidQaOrganization(organizationId: string): boolean {
  return SHORT_PAID_QA_ORGANIZATIONS.some((id) => id === organizationId);
}

function unavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El ensayo de periodo pagado corto no está disponible para esta operación.",
    503,
    { code: "QA_SHORT_PAID_UNAVAILABLE" }
  );
}

function exactOrigin(value: string | undefined, origin: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.origin === origin && url.pathname === "/" &&
      !url.search && !url.hash && !url.username && !url.password;
  } catch {
    return false;
  }
}

function databaseIsSandbox(value: string): boolean {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && (
      url.hostname === `db.${SANDBOX_REF}.supabase.co` ||
      (url.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(url.username).endsWith(`.${SANDBOX_REF}`))
    );
  } catch {
    return false;
  }
}

/** Call before any DB/provider action for the reserved fixtures. */
export function assertShortPaidQaEnvironment(
  input: ShortPaidCheckoutIdentity,
  env: NodeJS.ProcessEnv = process.env
): number | null {
  if (!isShortPaidQaOrganization(input.organizationId)) return null;
  const until = env.SAAS_QA_SHORT_PAID_EXPIRES_AT
    ? Date.parse(env.SAAS_QA_SHORT_PAID_EXPIRES_AT) : NaN;
  const databaseTargets = [env.DATABASE_URL, env.DATABASE_URL_POOL, env.DATABASE_URL_DIRECT]
    .filter((value): value is string => Boolean(value));
  if (
    typeof window !== "undefined" ||
    env.SAAS_QA_SHORT_PAID_ENABLED !== "true" ||
    env.SAAS_QA_SHORT_PAID_RUN !== SHORT_PAID_QA_RUN ||
    env.VERCEL_ENV !== "preview" || env.VERCEL_TARGET_ENV === "production" ||
    input.config.environment !== "test" ||
    input.config.providerAccountReference !== STRIPE_TEST_ACCOUNT ||
    input.planCode !== "starter" || input.billingInterval !== "month" ||
    !exactOrigin(input.appUrl, PREVIEW_ORIGIN) ||
    !exactOrigin(env.NEXT_PUBLIC_SUPABASE_URL, `https://${SANDBOX_REF}.supabase.co`) ||
    !databaseIsSandbox(input.databaseUrl) ||
    databaseTargets.some((value) => !databaseIsSandbox(value)) ||
    !Number.isFinite(until) || until <= SHORT_PAID_QA_WINDOW_START ||
    until > SHORT_PAID_QA_WINDOW_END
  ) throw unavailable();
  return until;
}

export function shortPaidStripeIdempotencyKey(operationId: string, requestHash: string): string {
  return `${KEY_PREFIX}${operationId}-${requestHash}`;
}

/**
 * The durable markers detect an existing QA operation even when configuration
 * disappears. Never reinterpret one as a normal full-month purchase.
 */
export function resolveShortPaidCheckoutEnvelope(input: {
  identity: ShortPaidCheckoutIdentity;
  operation?: ShortPaidCheckoutOperation;
  createdAt?: Date;
  env?: NodeJS.ProcessEnv;
}): ShortPaidCheckoutEnvelope | null {
  const { identity, operation, env = process.env } = input;
  const hashMarked = operation?.requestHash?.startsWith(HASH_PREFIX) ?? false;
  const keyMarked = operation?.stripeIdempotencyKey?.startsWith(KEY_PREFIX) ?? false;
  if (!isShortPaidQaOrganization(identity.organizationId)) {
    if (hashMarked || keyMarked) throw unavailable();
    return null;
  }
  const until = assertShortPaidQaEnvironment(identity, env);
  const createdAt = operation?.createdAt ?? input.createdAt;
  if (!createdAt || !Number.isFinite(createdAt.getTime()) || until === null ||
    createdAt.getTime() < SHORT_PAID_QA_WINDOW_START || createdAt.getTime() >= until ||
    (operation && (!hashMarked || !keyMarked ||
      operation.organizationId !== identity.organizationId ||
      operation.planCode !== identity.planCode ||
      operation.billingInterval !== identity.billingInterval ||
      operation.environment !== identity.config.environment ||
      operation.providerAccountReference !== identity.config.providerAccountReference))) {
    throw unavailable();
  }
  const createdSecond = Math.floor(createdAt.getTime() / 1000);
  const billingCycleAnchor = createdSecond + 86400;
  const expiresAt = createdSecond + 3600;
  const digest = createHash("sha256").update(JSON.stringify({
    organizationId: identity.organizationId,
    planCode: identity.planCode,
    billingInterval: identity.billingInterval,
    environment: identity.config.environment,
    providerAccountReference: identity.config.providerAccountReference,
    priceReference: identity.priceReference,
    requestVersion: 3,
    qaRun: SHORT_PAID_QA_RUN,
    createdAt: createdAt.toISOString(),
    configurationExpiresAt: until,
    billingCycleAnchor,
    expiresAt,
    prorationBehavior: "create_prorations",
  })).digest("hex");
  const requestHash = `${HASH_PREFIX}${digest.slice(0, 48)}`;
  if (operation && (operation.requestHash !== requestHash ||
    operation.stripeIdempotencyKey !== shortPaidStripeIdempotencyKey(operation.id, requestHash))) {
    throw unavailable();
  }
  return {
    requestHash, createdAt, billingCycleAnchor, expiresAt,
    creationCutoff: createdAt.getTime() + CREATE_WINDOW_MS,
    configurationExpiresAt: until,
  };
}

/** Recheck immediately before each external mutation, never using input.at. */
export function assertShortPaidCheckoutCreationAllowed(
  envelope: ShortPaidCheckoutEnvelope | null,
  at: Date = new Date()
): void {
  if (!envelope) return;
  const now = at.getTime();
  if (!Number.isFinite(now) || now < envelope.createdAt.getTime() ||
    now >= envelope.creationCutoff || now >= envelope.configurationExpiresAt ||
    envelope.expiresAt * 1000 - now < 30 * 60 * 1000) {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION", "La sesión QA requiere revisión; no se creará otro cobro.", 409,
      { code: "CHECKOUT_RECOVERY_REQUIRED" }
    );
  }
}
