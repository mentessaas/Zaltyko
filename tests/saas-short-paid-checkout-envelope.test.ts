import { describe, expect, it } from "vitest";

import {
  assertShortPaidCheckoutCreationAllowed,
  assertShortPaidQaEnvironment,
  resolveShortPaidCheckoutEnvelope,
  shortPaidStripeIdempotencyKey,
  SHORT_PAID_QA_ORGANIZATIONS,
  SHORT_PAID_QA_RUN,
  type ShortPaidCheckoutIdentity,
} from "@/modules/saas-billing/application/short-paid-checkout-envelope";

const createdAt = new Date("2026-10-21T19:00:00.123Z");
const databaseUrl = "postgresql://qa.aeeootdmuiqkfeernskw:synthetic@aws-0-eu.pooler.supabase.com:6543/postgres";
const environment: NodeJS.ProcessEnv = {
  VERCEL_ENV: "preview",
  SAAS_QA_SHORT_PAID_ENABLED: "true",
  SAAS_QA_SHORT_PAID_RUN: SHORT_PAID_QA_RUN,
  SAAS_QA_SHORT_PAID_EXPIRES_AT: "2026-10-22T18:30:00Z",
  NEXT_PUBLIC_SUPABASE_URL: "https://aeeootdmuiqkfeernskw.supabase.co",
  DATABASE_URL: databaseUrl,
};
const identity: ShortPaidCheckoutIdentity = {
  organizationId: SHORT_PAID_QA_ORGANIZATIONS[0], planCode: "starter", billingInterval: "month",
  priceReference: "price_synthetic", config: { environment: "test", providerAccountReference: "acct_1STR6eDXXopppUpe" },
  appUrl: "https://zaltyko-sandbox-preview.vercel.app", databaseUrl,
};
function envelope() {
  return resolveShortPaidCheckoutEnvelope({ identity, createdAt, env: environment })!;
}
function operation() {
  const qa = envelope();
  return {
    id: "f0000000-0000-4000-8000-000000000001", organizationId: identity.organizationId,
    planCode: "starter", billingInterval: "month", environment: "test",
    providerAccountReference: identity.config.providerAccountReference, createdAt,
    requestHash: qa.requestHash,
    stripeIdempotencyKey: shortPaidStripeIdempotencyKey("f0000000-0000-4000-8000-000000000001", qa.requestHash),
  };
}

describe("server-only short paid QA envelope (no provider or DB)", () => {
  it.each(SHORT_PAID_QA_ORGANIZATIONS)("binds only reserved fixture %s to a fixed paid period", (organizationId) => {
    const qa = resolveShortPaidCheckoutEnvelope({ identity: { ...identity, organizationId }, createdAt, env: environment })!;
    expect(qa.requestHash).toMatch(/^5341415351415633[a-f0-9]{48}$/);
    expect(qa.requestHash).toHaveLength(64); // existing PostgreSQL CHECK, no schema widening
    expect(qa.billingCycleAnchor).toBe(Math.floor(createdAt.getTime() / 1000) + 86400);
    expect(qa.expiresAt).toBe(Math.floor(createdAt.getTime() / 1000) + 3600);
    expect(qa.creationCutoff).toBe(createdAt.getTime() + 25 * 60000);
  });

  it("replays exact durable identity and fixed times rather than recomputing from current time", () => {
    const row = operation();
    expect(resolveShortPaidCheckoutEnvelope({ identity, operation: row, env: environment })).toEqual(envelope());
    expect(shortPaidStripeIdempotencyKey(row.id, row.requestHash)).toBe(row.stripeIdempotencyKey);
  });

  it.each([
    ["SAAS_QA_SHORT_PAID_ENABLED", undefined],
    ["SAAS_QA_SHORT_PAID_ENABLED", "false"],
    ["SAAS_QA_SHORT_PAID_RUN", "another-run"],
    ["SAAS_QA_SHORT_PAID_EXPIRES_AT", undefined],
    ["SAAS_QA_SHORT_PAID_EXPIRES_AT", "invalid"],
    ["SAAS_QA_SHORT_PAID_EXPIRES_AT", "2026-10-23T18:30:00Z"],
    ["SAAS_QA_SHORT_PAID_EXPIRES_AT", "2026-10-21T18:30:00Z"],
    ["VERCEL_ENV", "production"],
    ["VERCEL_ENV", "development"],
    ["VERCEL_TARGET_ENV", "production"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://another.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://aeeootdmuiqkfeernskw.supabase.co/other"],
    ["DATABASE_URL_POOL", "postgresql://synthetic:synthetic@db.another.supabase.co/postgres"],
    ["DATABASE_URL_DIRECT", "postgresql://synthetic:synthetic@localhost/postgres"],
  ] as const)("fails closed on %s=%s even for a persisted QA operation", (name, value) => {
    expect(() => resolveShortPaidCheckoutEnvelope({
      identity, operation: operation(), env: { ...environment, [name]: value },
    })).toThrow(/ensayo/);
  });

  it.each([
    { planCode: "growth" as const },
    { billingInterval: "year" as const },
    { config: { environment: "live" as const, providerAccountReference: "acct_1STR6eDXXopppUpe" } },
    { config: { environment: "test" as const, providerAccountReference: "acct_another" } },
    { appUrl: "https://zaltyko.com" },
    { appUrl: "https://zaltyko-sandbox-preview.vercel.app/other" },
    { databaseUrl: "postgresql://synthetic:synthetic@db.another.supabase.co/postgres" },
    { databaseUrl: "postgresql://wrong:synthetic@aws-0-eu.pooler.supabase.com/postgres" },
  ])("rejects unsupported fixture target/plan %j", (patch) => {
    expect(() => assertShortPaidQaEnvironment({ ...identity, ...patch }, environment)).toThrow(/ensayo/);
  });

  it.each([
    { createdAt: new Date(createdAt.getTime() + 1) },
    { requestHash: "a".repeat(64) },
    { stripeIdempotencyKey: "zaltyko-saas-checkout-old" },
    { planCode: "growth" },
    { organizationId: SHORT_PAID_QA_ORGANIZATIONS[1] },
    { environment: "live" },
    { providerAccountReference: "acct_another" },
  ])("rejects any altered durable binding %j", (patch) => {
    expect(() => resolveShortPaidCheckoutEnvelope({ identity, operation: { ...operation(), ...patch }, env: environment })).toThrow(/ensayo/);
  });

  it("does not accept an altered Price or configuration expiry on replay", () => {
    expect(() => resolveShortPaidCheckoutEnvelope({ identity: { ...identity, priceReference: "price_changed" }, operation: operation(), env: environment })).toThrow(/ensayo/);
    expect(() => resolveShortPaidCheckoutEnvelope({ identity, operation: operation(), env: { ...environment, SAAS_QA_SHORT_PAID_EXPIRES_AT: "2026-10-22T17:30:00Z" } })).toThrow(/ensayo/);
  });

  it.each(["2026-10-21T18:29:59Z", "2026-10-22T18:30:00Z", "invalid"])("refuses operation creation outside the fixed window: %s", (time) => {
    expect(() => resolveShortPaidCheckoutEnvelope({ identity, createdAt: new Date(time), env: environment })).toThrow(/ensayo/);
  });

  it("allows creation only before the real 25-minute cutoff; no test clock comes from a request", () => {
    expect(() => assertShortPaidCheckoutCreationAllowed(envelope(), new Date(createdAt.getTime() + 25 * 60000 - 1))).not.toThrow();
    for (const at of [createdAt.getTime() - 1, createdAt.getTime() + 25 * 60000, createdAt.getTime() + 23 * 3600000, NaN]) {
      expect(() => assertShortPaidCheckoutCreationAllowed(envelope(), new Date(at))).toThrow(/revisión/);
    }
  });

  it("caps creation by configuration expiry too, while permitting read-only validation later", () => {
    const env = { ...environment, SAAS_QA_SHORT_PAID_EXPIRES_AT: "2026-10-21T19:10:00Z" };
    const qa = resolveShortPaidCheckoutEnvelope({ identity, createdAt, env })!;
    expect(() => assertShortPaidCheckoutCreationAllowed(qa, new Date("2026-10-21T19:10:00Z"))).toThrow(/revisión/);
    expect(resolveShortPaidCheckoutEnvelope({ identity, createdAt, env })).toEqual(qa);
  });

  it("leaves normal organizations normal even if QA env is absent, malformed, or points elsewhere", () => {
    const normal = { ...identity, organizationId: "10000000-0000-4000-8000-000000000001" };
    expect(assertShortPaidQaEnvironment(normal, {})).toBeNull();
    expect(resolveShortPaidCheckoutEnvelope({ identity: normal, createdAt, env: { VERCEL_ENV: "production" } })).toBeNull();
    // A marker can never be transplanted to an unrelated organization.
    expect(() => resolveShortPaidCheckoutEnvelope({ identity: normal, operation: operation(), env: {} })).toThrow(/ensayo/);
  });
});
