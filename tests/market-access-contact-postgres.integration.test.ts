import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";

// Authorization is covered with the real wrapper in the inbox route unit suite.
// This disposable-PostgreSQL suite exercises the actual query and cursor SQL.
vi.mock("@/lib/authz", () => ({
  withSuperAdmin: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { userId: "synthetic-super-admin" }),
}));

const effects = vi.hoisted(() => ({ mail: vi.fn(), event: vi.fn(), actor: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ withRateLimit: (handler: (request: NextRequest) => Promise<Response>) => handler }));
vi.mock("@/lib/directory/contracts", () => ({ flag: () => false }));
vi.mock("@/lib/growth/events", () => ({ recordGrowthEvent: effects.event }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: effects.mail }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: effects.actor } }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// Use the real transaction implementation, with an isolated fixture search_path.
// No production table, schema, provider, or connection configuration is changed.
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const { sql: statement } = await import("drizzle-orm");
  return { ...actual, db: {
    execute: (...args: Parameters<typeof actual.db.execute>) => actual.db.execute(...args),
    select: (projection: Parameters<typeof actual.db.select>[0]) => ({
      from: (table: any) => ({
        where: (condition: any) => ({
          orderBy: (...ordering: any[]) => ({
            limit: (limit: number) => actual.db.transaction(async (tx) => {
              await tx.execute(statement.raw("set local search_path = ci_contact_contract, pg_catalog"));
              return tx.select(projection).from(table).where(condition).orderBy(...ordering).limit(limit);
            }),
          }),
        }),
      }),
    }),
    transaction: (action: (tx: unknown) => Promise<unknown>) => actual.db.transaction(async (tx) => {
      await tx.execute(statement.raw("set local search_path = ci_contact_contract, pg_catalog"));
      return action(tx);
    }),
  } };
});

import { db } from "@/db";
import { POST } from "@/app/api/contact/route";
import { GET as readInbox } from "@/app/api/super-admin/contact-requests/route";
import { deliveryContactEmailRequestSha256, type DeliveryContactEmailCommand } from "@/lib/email/delivery-contact-email";

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
  for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY", "E2E_TARGET_SUPABASE_PROJECT_REF", "STRIPE_SAAS_TEST_SECRET_KEY", "STRIPE_SAAS_LIVE_SECRET_KEY", "VERCEL_TOKEN", "BREVO_API_KEY", "DELIVERY_CONTACT_EMAIL_API_KEY"]) {
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

// Only synthetic runtime context is mocked here, after beforeAll proves the real
// connection is the disposable GitHub/Linux loopback target. Auth/fetch stay mocks;
// no dedicated credential is ever loaded and no provider connection is permitted.
function contactPermit(suffix = "") {
  const body = { name: "Adulto QA sintético", email: `ci-qa-${randomUUID()}@example.invalid`,
    reason: "support", source: "public_contact", honeypot: "", message: "Aviso sintético cerrado marcador PG 7f3b.",
    visitorId: randomUUID(), submissionId: randomUUID() };
  const command: DeliveryContactEmailCommand = { ...body, academy: null, plan: null, directoryEntryId: null, marketAccess: null };
  const userId = "10000000-0000-4000-8000-000000000003";
  const run = `synthetic-${randomUUID()}${suffix}`;
  const env = {
    ZALTYKO_DELIVERY_PREVIEW: "true", ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED: "true", ZALTYKO_TEAM_ACCESS_ENABLED: "false",
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/mvp-main-bridge-20261025",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40), NODE_ENV: "production", DELIVERY_CONTACT_EMAIL_API_KEY: "synthetic-exclusive-key",
    DELIVERY_CONTACT_EMAIL_QA_EMAIL: body.email, DELIVERY_CONTACT_EMAIL_QA_AUTH_USER_ID: userId,
    DELIVERY_CONTACT_EMAIL_RUN_ID: run, DELIVERY_CONTACT_EMAIL_REQUEST_SHA256: deliveryContactEmailRequestSha256(command),
    DELIVERY_CONTACT_EMAIL_APPROVED_COMMIT_SHA: "a".repeat(40), DELIVERY_CONTACT_EMAIL_EXPIRES_AT: new Date(Date.now() + 900_000).toISOString(),
  };
  for (const key of ["CI", "GITHUB_ACTIONS", "BREVO_API_KEY", "TWILIO_AUTH_TOKEN", "MAILGUN_API_KEY", "SENTRY_DSN", "SENTRY_AUTH_TOKEN", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_SAAS_LIVE_SECRET_KEY", "CRON_SECRET"]) vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  effects.actor.mockResolvedValue({ data: { user: { id: userId, email: body.email, email_confirmed_at: "2026-11-06T10:00:00Z" } }, error: null });
  effects.fetch.mockResolvedValue(new Response(JSON.stringify({ messageId: "synthetic-pg-accepted" }), { status: 201 }));
  vi.stubGlobal("fetch", effects.fetch);
  return { body, key: `email:delivery-contact-qa:${run}` };
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
      create table ci_contact_contract.email_logs (
        id uuid primary key default gen_random_uuid(), tenant_id uuid, academy_id uuid, user_id uuid,
        to_email text not null, subject text not null, template text, status text not null default 'pending',
        error_message text, sent_at timestamptz, created_at timestamptz not null default now(),
        metadata jsonb, idempotency_key text,
        constraint ci_email_reservation_fault check (idempotency_key not like '%-reservation-fault'),
        constraint ci_email_finalize_fault check (not (idempotency_key like '%-finalize-fault' and status='sent'))
      );
      create unique index email_logs_idempotency_unique on ci_contact_contract.email_logs (idempotency_key);
      alter table ci_contact_contract.leads enable row level security;
      alter table ci_contact_contract.lead_interactions enable row level security;
      alter table ci_contact_contract.email_logs enable row level security;
      revoke all on all tables in schema ci_contact_contract from anon, authenticated;
    `));
  });
  beforeEach(() => {
    vi.stubEnv("ZALTYKO_DELIVERY_PREVIEW", undefined);
    effects.mail.mockReset().mockResolvedValue(undefined);
    effects.event.mockReset().mockResolvedValue(undefined);
    effects.actor.mockReset(); effects.fetch.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("reserves one persistent contact-email attempt across different UUIDs, concurrency and replay", async () => {
    const { body, key } = contactPermit();
    const responses = await Promise.all(Array.from({ length: 8 }, () => POST(request({ ...body, submissionId: randomUUID(), visitorId: randomUUID() }))));
    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201));
    const receipts = await Promise.all(responses.map(async (response) => (await response.json()).data));
    expect(new Set(receipts.map((receipt) => receipt.interactionId)).size).toBe(8);
    const stored = await db.execute(sql`select
      (select count(*)::int from ci_contact_contract.leads where email=${body.email}) as leads,
      (select count(*)::int from ci_contact_contract.lead_interactions where email=${body.email}) as interactions,
      (select count(*)::int from ci_contact_contract.email_logs where idempotency_key=${key}) as attempts,
      (select count(*)::int from ci_contact_contract.email_logs where idempotency_key=${key} and status='sent') as accepted`);
    expect(stored.rows).toEqual([{ leads: 1, interactions: 8, attempts: 1, accepted: 1 }]);
    expect(effects.fetch).toHaveBeenCalledTimes(1); expect(effects.mail).not.toHaveBeenCalled();
    expect(effects.actor).toHaveBeenCalledTimes(8); expect(effects.event).toHaveBeenCalledTimes(8);
    const first = await POST(request(body));
    expect(first.status).toBe(201);
    const replay = await POST(request(body));
    expect(replay.status).toBe(201); expect((await replay.json()).data.idempotent).toBe(true);
    expect(effects.fetch).toHaveBeenCalledTimes(1); expect(effects.actor).toHaveBeenCalledTimes(9);
    const logs = await db.execute(sql`select to_email, template, status, metadata from ci_contact_contract.email_logs where idempotency_key=${key}`);
    expect(logs.rows).toEqual([{ to_email: "hola@zaltyko.com", template: "delivery-contact-qa", status: "sent",
      metadata: { deliveryContactQa: true, result: "api_accepted", messageId: "synthetic-pg-accepted" } }]);
  });

  it("preserves contact persistence when the reservation insert rolls back", async () => {
    const { body, key } = contactPermit("-reservation-fault");
    expect((await POST(request(body))).status).toBe(201);
    const stored = await db.execute(sql`select
      (select count(*)::int from ci_contact_contract.lead_interactions where submission_id=${body.submissionId}::uuid) as interactions,
      (select count(*)::int from ci_contact_contract.email_logs where idempotency_key=${key}) as attempts`);
    expect(stored.rows).toEqual([{ interactions: 1, attempts: 0 }]);
    expect(effects.fetch).not.toHaveBeenCalled(); expect(effects.mail).not.toHaveBeenCalled();
    expect((await POST(request(body))).status).toBe(201);
    expect(effects.actor).toHaveBeenCalledTimes(1); expect(effects.fetch).not.toHaveBeenCalled();
  });

  it.each(["failed", "pending"])("never retries a consumed %s permit, including a new submission UUID", async (status) => {
    const { body, key } = contactPermit(status === "pending" ? "-finalize-fault" : "");
    if (status === "failed") effects.fetch.mockResolvedValue(new Response(null, { status: 400 }));
    expect((await POST(request(body))).status).toBe(201);
    expect((await POST(request({ ...body, submissionId: randomUUID(), visitorId: randomUUID() }))).status).toBe(201);
    const logs = await db.execute(sql`select status, count(*)::int as count from ci_contact_contract.email_logs where idempotency_key=${key} group by status`);
    expect(logs.rows).toEqual([{ status, count: 1 }]);
    expect(effects.fetch).toHaveBeenCalledTimes(1); expect(effects.mail).not.toHaveBeenCalled();
    const interactions = await db.execute(sql`select count(*)::int as count from ci_contact_contract.lead_interactions where email=${body.email}`);
    expect(interactions.rows).toEqual([{ count: 2 }]);
  });

  it("fails closed before fetch when the real unique index is unavailable", async () => {
    const { body, key } = contactPermit();
    await db.execute(sql.raw("drop index ci_contact_contract.email_logs_idempotency_unique"));
    try {
      expect((await POST(request(body))).status).toBe(201);
      const logs = await db.execute(sql`select count(*)::int as count from ci_contact_contract.email_logs where idempotency_key=${key}`);
      expect(logs.rows).toEqual([{ count: 0 }]); expect(effects.fetch).not.toHaveBeenCalled(); expect(effects.mail).not.toHaveBeenCalled();
    } finally {
      await db.execute(sql.raw("create unique index email_logs_idempotency_unique on ci_contact_contract.email_logs (idempotency_key)"));
    }
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

  it("reads every persisted inbox request once across microseconds and equal-timestamp UUID ties", async () => {
    const email = `ci-inbox-${randomUUID()}@example.invalid`;
    const inserted = await db.execute(sql`
      insert into ci_contact_contract.leads (email, name) values (${email}, 'Synthetic inbox owner') returning id
    `);
    const leadId = String(inserted.rows[0]!.id);
    const ids = Array.from({ length: 3 }, () => randomUUID()).sort().reverse();
    const timestamps = ["2026-11-05T13:00:00.123457Z", "2026-11-05T13:00:00.123456Z", "2026-11-05T13:00:00.123456Z"];
    for (let index = 0; index < ids.length; index += 1) {
      await db.execute(sql`
        insert into ci_contact_contract.lead_interactions
          (id, lead_id, submission_id, name, email, reason, source, message, created_at)
        values (${ids[index]}::uuid, ${leadId}::uuid, ${randomUUID()}::uuid,
          'Synthetic inbox owner', ${email}, 'billing', 'ci_inbox_cursor',
          'Synthetic request: plain text only', ${timestamps[index]}::timestamptz)
      `);
    }
    const before = await db.execute(sql`select count(*)::int as count from ci_contact_contract.lead_interactions`);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 3; page += 1) {
      const query = new URLSearchParams({ limit: "1", reason: "billing" });
      if (cursor) query.set("cursor", cursor);
      const response = await readInbox(new Request(`https://synthetic.invalid/api/super-admin/contact-requests?${query}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const result = (await response.json()).data;
      expect(result.items).toHaveLength(1);
      expect(result.items[0].email).toBe(email);
      seen.push(result.items[0].id);
      cursor = result.nextCursor;
      if (page < 2) {
        expect(cursor).not.toBeNull();
        const decoded = JSON.parse(Buffer.from(cursor!, "base64url").toString("utf8"));
        expect(decoded.createdAt).toBe(timestamps[page]);
      }
    }
    expect(cursor).toBeNull();
    expect(seen).toEqual(ids);
    expect(new Set(seen).size).toBe(3);
    const after = await db.execute(sql`select count(*)::int as count from ci_contact_contract.lead_interactions`);
    expect(after.rows).toEqual(before.rows);
    expect(effects.mail).not.toHaveBeenCalled();
    expect(effects.event).not.toHaveBeenCalled();
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
