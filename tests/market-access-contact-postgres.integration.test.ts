import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";

const effects = vi.hoisted(() => ({ mail: vi.fn(), event: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ withRateLimit: (handler: (request: NextRequest) => Promise<Response>) => handler }));
vi.mock("@/lib/directory/contracts", () => ({ flag: () => false }));
vi.mock("@/lib/growth/events", () => ({ recordGrowthEvent: effects.event }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: effects.mail }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// Use the real transaction implementation, with an isolated fixture search_path.
// No production table, schema, provider, or connection configuration is changed.
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const { sql: statement } = await import("drizzle-orm");
  return { ...actual, db: {
    execute: (...args: Parameters<typeof actual.db.execute>) => actual.db.execute(...args),
    transaction: (action: (tx: unknown) => Promise<unknown>) => actual.db.transaction(async (tx) => {
      await tx.execute(statement.raw("set local search_path = ci_contact_contract, pg_catalog"));
      return action(tx);
    }),
  } };
});

import { db } from "@/db";
import { POST } from "@/app/api/contact/route";

function assertDisposableTarget() {
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const target = new URL(connection ?? "");
  if (process.env.ZALTYKO_PG_INTEGRATION !== "1" || process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_OS !== "Linux" || process.env.NODE_ENV !== "test" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.username !== "supabase_admin" || !target.password || !target.port ||
    target.pathname !== "/postgres" || target.search !== "?sslmode=disable" ||
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some((value) => value !== connection)) {
    throw new Error("Disposable GitHub Linux loopback PostgreSQL is required");
  }
  for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY", "E2E_TARGET_SUPABASE_PROJECT_REF", "STRIPE_SAAS_TEST_SECRET_KEY", "STRIPE_SAAS_LIVE_SECRET_KEY", "VERCEL_TOKEN"]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

function payload() {
  return {
    name: "Responsable sintético", email: `ci-contact-${randomUUID()}@example.invalid`,
    reason: "market_access", visitorId: randomUUID(), submissionId: randomUUID(),
    message: "Queremos gestionar clases y asistencia.",
    source: "ci_market_access",
    marketAccess: { countryName: "Argentina", role: "owner", disciplines: ["rhythmic"] },
  };
}
function request(body: unknown) {
  return new NextRequest("https://synthetic.invalid/api/contact", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1")("contact requests on disposable PostgreSQL", () => {
  beforeAll(async () => {
    assertDisposableTarget();
    // Minimal equivalents of the legacy contact columns, in a test-only schema.
    // The extra CHECK is a deliberate second-write fault for the rollback case.
    await db.execute(sql.raw(`
      create schema ci_contact_contract;
      create table ci_contact_contract.leads (
        id uuid primary key default gen_random_uuid(), tenant_id uuid, academy_id uuid,
        email text not null unique, name text, source text default 'landing_page',
        plan text, metadata text, created_at timestamp not null default now()
      );
      create table ci_contact_contract.lead_interactions (
        id uuid primary key default gen_random_uuid(),
        lead_id uuid not null references ci_contact_contract.leads(id),
        submission_id uuid not null unique, name text not null, email text not null,
        academy text, reason text not null, plan text, source text not null,
        message text not null, visitor_id uuid,
        created_at timestamptz not null default now(),
        constraint ci_contact_reject_second_write check (source <> 'ci_force_rollback')
      );
      alter table ci_contact_contract.leads enable row level security;
      alter table ci_contact_contract.lead_interactions enable row level security;
      revoke all on all tables in schema ci_contact_contract from anon, authenticated;
    `));
  });
  beforeEach(() => {
    effects.mail.mockReset().mockResolvedValue(undefined);
    effects.event.mockReset().mockResolvedValue(undefined);
  });

  it("serializes concurrent equal UUIDs, including case differences, into one immutable request", async () => {
    const body = payload();
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      POST(request({ ...body, submissionId: index % 2 ? body.submissionId.toUpperCase() : body.submissionId }))));
    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201));
    const receipts = await Promise.all(responses.map(async (response) => (await response.json()).data));
    expect(new Set(receipts.map((receipt) => receipt.interactionId)).size).toBe(1);
    expect(new Set(receipts.map((receipt) => receipt.leadId)).size).toBe(1);
    expect(receipts.filter((receipt) => !receipt.idempotent)).toHaveLength(1);
    const stored = await db.execute(sql`select
      (select count(*)::int from ci_contact_contract.leads where email=${body.email}) as leads,
      (select count(*)::int from ci_contact_contract.lead_interactions where submission_id=${body.submissionId}::uuid) as interactions`);
    expect(stored.rows).toEqual([{ leads: 1, interactions: 1 }]);
    expect(effects.event).toHaveBeenCalledTimes(1);
    expect(effects.mail).toHaveBeenCalledTimes(1);
  });

  it("rejects a concurrent different payload without creating the losing contact", async () => {
    const first = payload();
    const second = { ...first, email: `ci-contact-${randomUUID()}@example.invalid`, marketAccess: { ...first.marketAccess, countryName: "Chile" } };
    const responses = await Promise.all([POST(request(first)), POST(request(second))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const counts = await db.execute(sql`select
      (select count(*)::int from ci_contact_contract.leads where email in (${first.email},${second.email})) as leads,
      (select count(*)::int from ci_contact_contract.lead_interactions where submission_id=${first.submissionId}::uuid) as interactions`);
    expect(counts.rows).toEqual([{ leads: 1, interactions: 1 }]);
    expect(effects.event).toHaveBeenCalledTimes(1);
    expect(effects.mail).toHaveBeenCalledTimes(1);
  });

  it("rolls back the new lead when the interaction write fails", async () => {
    const body = { ...payload(), source: "ci_force_rollback" };
    expect((await POST(request(body))).status).toBe(500);
    const counts = await db.execute(sql`select
      (select count(*)::int from ci_contact_contract.leads where email=${body.email}) as leads,
      (select count(*)::int from ci_contact_contract.lead_interactions where submission_id=${body.submissionId}::uuid) as interactions`);
    expect(counts.rows).toEqual([{ leads: 0, interactions: 0 }]);
    expect(effects.event).not.toHaveBeenCalled();
    expect(effects.mail).not.toHaveBeenCalled();
  });
});
