import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { eraseExpiredContactLeads } from "@/lib/growth/lead-retention";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";

function assertDisposableTarget() {
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  let target: URL;
  try {
    target = new URL(connection ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    !disposablePgEnabled ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.username !== "supabase_admin" ||
    !target.password ||
    !target.port ||
    target.pathname !== "/postgres" ||
    target.search !== "?sslmode=disable" ||
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(
      (value) => value !== connection
    )
  ) {
    throw new Error("Disposable GitHub Linux loopback Postgres is required");
  }
  for (const name of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const ids = {
  staleLead: randomUUID(),
  recentLead: randomUUID(),
  ownedLead: randomUUID(),
  outcomeConvertedLead: randomUUID(),
  academyConvertedLead: randomUUID(),
  recentOutcomeLead: randomUUID(),
  staleSubmission: randomUUID(),
  staleInterview: randomUUID(),
  staleLeadTrial: randomUUID(),
  staleTrialOutcome: randomUUID(),
  recentLeadTrial: randomUUID(),
  recentTrialOutcome: randomUUID(),
  convertedLeadTrial: randomUUID(),
  convertedTrialOutcome: randomUUID(),
  staleAcademyTrial: randomUUID(),
  convertedAcademyTrial: randomUUID(),
};

const leadIds = [
  ids.staleLead,
  ids.recentLead,
  ids.ownedLead,
  ids.outcomeConvertedLead,
  ids.academyConvertedLead,
  ids.recentOutcomeLead,
];
const emailFor = (id: string) => `lead-retention-${id}@example.invalid`;
let academyId: string | null = null;
let seeded = false;
// The disposable database has no academies of its own; the test creates one.
const fixtureOwner = { userId: randomUUID(), profileId: randomUUID() };

async function insertLead(
  id: string,
  ownership: { tenantId: string | null; academyId: string | null } = {
    tenantId: null,
    academyId: null,
  }
) {
  await db.execute(sql`
    insert into public.leads (id, email, name, metadata, created_at, tenant_id, academy_id)
    values (
      ${id}::uuid,
      ${emailFor(id)},
      'Lead retention fixture',
      '{"message":"synthetic contact data"}',
      now() - interval '7 months',
      ${ownership.tenantId}::uuid,
      ${ownership.academyId}::uuid
    )
  `);
}

async function cleanupFixtures() {
  if (!seeded) return;
  await db.execute(sql`
    delete from public.lead_trial_outcomes
    where id = any(${sqlUuidArray([
      ids.staleTrialOutcome,
      ids.recentTrialOutcome,
      ids.convertedTrialOutcome,
    ])})
  `);
  await db.execute(sql`
    delete from public.lead_trials
    where id = any(${sqlUuidArray([
      ids.staleLeadTrial,
      ids.recentLeadTrial,
      ids.convertedLeadTrial,
    ])})
  `);
  await db.execute(sql`
    delete from public.commercial_interviews where id = ${ids.staleInterview}::uuid
  `);
  await db.execute(sql`
    delete from public.academy_trials
    where id = any(${sqlUuidArray([ids.staleAcademyTrial, ids.convertedAcademyTrial])})
  `);
  await db.execute(sql`
    delete from public.growth_events
    where idempotency_key in (
      ${`contact:${ids.staleSubmission}`},
      ${`directory:demo:${ids.staleSubmission}`}
    )
  `);
  await db.execute(sql`
    delete from public.email_logs
    where idempotency_key = ${`email:public-contact-lead:${ids.staleSubmission}`}
  `);
  await db.execute(sql`
    delete from public.leads where id = any(${sqlUuidArray(leadIds)})
  `);
  if (academyId) await db.execute(sql`delete from public.academies where id = ${academyId}::uuid`);
  await db.execute(sql`delete from public.profiles where id = ${fixtureOwner.profileId}::uuid`);
  await db.execute(sql`delete from auth.users where id = ${fixtureOwner.userId}::uuid`);
}

describe.skipIf(!disposablePgEnabled)("retención de contactos en PostgreSQL desechable", () => {
  beforeAll(async () => {
    assertDisposableTarget();
    const client = new Client({ connectionString: process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL });
    await client.connect();
    try {
      const createdAcademy = randomUUID();
      await client.query("insert into auth.users (id, email) values ($1, $2)", [
        fixtureOwner.userId,
        `ci-lead-retention-${fixtureOwner.userId}@example.invalid`,
      ]);
      await client.query(
        "insert into public.profiles (id, user_id, tenant_id, name, role) values ($1, $2, $3, 'Persona CI', 'coach')",
        [fixtureOwner.profileId, fixtureOwner.userId, randomUUID()]
      );
      await client.query(
        "insert into public.academies (id, tenant_id, name, owner_id) values ($1, $2, 'Academia CI retención', $3)",
        [createdAcademy, createdAcademy, fixtureOwner.profileId]
      );
      academyId = createdAcademy;
    } finally {
      await client.end();
    }
    if (!academyId) throw new Error("The disposable fixture must contain a synthetic academy");

    seeded = true;
    await insertLead(ids.staleLead);
    await insertLead(ids.recentLead);
    await insertLead(ids.ownedLead, { tenantId: academyId, academyId });
    await insertLead(ids.outcomeConvertedLead);
    await insertLead(ids.academyConvertedLead);
    await insertLead(ids.recentOutcomeLead);

    await db.execute(sql`
      insert into public.lead_interactions
        (id, lead_id, submission_id, name, email, reason, source, message, created_at)
      values
        (${randomUUID()}::uuid, ${ids.staleLead}::uuid, ${ids.staleSubmission}::uuid,
          'Lead retention fixture', ${emailFor(ids.staleLead)}, 'demo', 'test',
          'Synthetic stale request message', now() - interval '6 months' - interval '1 minute'),
        (${randomUUID()}::uuid, ${ids.recentLead}::uuid, ${randomUUID()}::uuid,
          'Lead retention fixture', ${emailFor(ids.recentLead)}, 'demo', 'test',
          'Synthetic recent request message', now() - interval '6 months' + interval '1 minute'),
        (${randomUUID()}::uuid, ${ids.recentOutcomeLead}::uuid, ${randomUUID()}::uuid,
          'Lead retention fixture', ${emailFor(ids.recentOutcomeLead)}, 'demo', 'test',
          'Synthetic old request message', now() - interval '7 months')
    `);

    await db.execute(sql`
      insert into public.lead_trials
        (id, tenant_id, academy_id, lead_id, status, created_at, updated_at)
      values
        (${ids.staleLeadTrial}::uuid, ${academyId}::uuid, ${academyId}::uuid,
          ${ids.staleLead}::uuid, 'completed', now() - interval '7 months', now() - interval '7 months'),
        (${ids.recentLeadTrial}::uuid, ${academyId}::uuid, ${academyId}::uuid,
          ${ids.recentOutcomeLead}::uuid, 'completed', now() - interval '7 months', now() - interval '7 months'),
        (${ids.convertedLeadTrial}::uuid, ${academyId}::uuid, ${academyId}::uuid,
          ${ids.outcomeConvertedLead}::uuid, 'completed', now() - interval '7 months', now() - interval '7 months')
    `);
    await db.execute(sql`
      insert into public.lead_trial_outcomes
        (id, tenant_id, academy_id, lead_trial_id, outcome, notes, created_at)
      values
        (${ids.staleTrialOutcome}::uuid, ${academyId}::uuid, ${academyId}::uuid,
          ${ids.staleLeadTrial}::uuid, 'not_converted', 'Synthetic stale outcome',
          now() - interval '7 months'),
        (${ids.recentTrialOutcome}::uuid, ${academyId}::uuid, ${academyId}::uuid,
          ${ids.recentLeadTrial}::uuid, 'not_converted', 'Synthetic recent outcome',
          now() - interval '5 months'),
        (${ids.convertedTrialOutcome}::uuid, ${academyId}::uuid, ${academyId}::uuid,
          ${ids.convertedLeadTrial}::uuid, '  CONVERTED  ', 'Synthetic converted outcome',
          now() - interval '7 months')
    `);

    await db.execute(sql`
      insert into public.academy_trials
        (id, tenant_id, academy_id, lead_id, status, started_at, ends_at, created_at, updated_at, converted_at)
      values
        (${ids.staleAcademyTrial}::uuid, ${academyId}::uuid, ${academyId}::uuid,
          ${ids.staleLead}::uuid, 'ended', now() - interval '7 months',
          now() - interval '6 months', now() - interval '7 months', now() - interval '7 months', null),
        (${ids.convertedAcademyTrial}::uuid, ${academyId}::uuid, ${academyId}::uuid,
          ${ids.academyConvertedLead}::uuid, 'ended', now() - interval '7 months',
          now() - interval '6 months', now() - interval '7 months', now() - interval '7 months',
          now() - interval '6 months')
    `);

    await db.execute(sql`
      insert into public.commercial_interviews
        (id, lead_id, academy_fingerprint, academy_name, contact_name, contact_email,
         status, notes, created_at, updated_at)
      values
        (${ids.staleInterview}::uuid, ${ids.staleLead}::uuid,
          ${`retention-${ids.staleLead}`}, 'Synthetic academy', 'Synthetic contact',
          ${emailFor(ids.staleLead)}, 'scheduled', 'Synthetic interview notes',
          now() - interval '7 months', now() - interval '7 months')
    `);

    await db.execute(sql`
      insert into public.growth_events
        (event_name, source, properties, idempotency_key, occurred_at, created_at)
      values
        ('contact_submitted', 'test', '{"synthetic":true}',
          ${`contact:${ids.staleSubmission}`}, now() - interval '6 months' - interval '1 minute',
          now() - interval '6 months' - interval '1 minute'),
        ('directory_demo_requested', 'test', '{"synthetic":true}',
          ${`directory:demo:${ids.staleSubmission}`}, now() - interval '6 months' - interval '1 minute',
          now() - interval '6 months' - interval '1 minute')
    `);
    await db.execute(sql`
      insert into public.email_logs
        (to_email, subject, template, status, idempotency_key, metadata, created_at)
      values
        (${emailFor(ids.staleLead)}, 'Synthetic contact notification', 'public-contact-lead',
          'sent', ${`email:public-contact-lead:${ids.staleSubmission}`},
          ${JSON.stringify({ dedupeKey: `public-contact-lead:${ids.staleSubmission}` })}::jsonb,
          now() - interval '6 months' - interval '1 minute')
    `);
  }, 30_000);

  afterAll(async () => {
    await cleanupFixtures();
  });

  it("borra solo contactos con más de seis meses de actividad y retiene conversiones", async () => {
    const result = await eraseExpiredContactLeads();

    expect(result).toEqual({
      enabled: true,
      erasedLeads: 1,
      erasedInteractions: 1,
      erasedLeadTrials: 1,
      erasedTrialOutcomes: 1,
      erasedInterviews: 1,
      erasedGrowthEvents: 2,
      erasedEmailLogs: 1,
      unlinkedAcademyTrials: 1,
      batches: 1,
    });
    expect(JSON.stringify(result)).not.toMatch(/@|Synthetic|message|notes/i);

    const remaining = await db.execute(sql`
      select id from public.leads where id = any(${sqlUuidArray(leadIds)}) order by id
    `);
    expect((remaining.rows as Array<{ id: string }>).map((row) => row.id)).toEqual(
      [ids.recentLead, ids.ownedLead, ids.outcomeConvertedLead, ids.academyConvertedLead, ids.recentOutcomeLead].sort()
    );

    const linkedData = await db.execute(sql`
      select
        (select count(*)::int from public.lead_interactions where lead_id = ${ids.staleLead}::uuid) as interactions,
        (select count(*)::int from public.lead_trials where id = ${ids.staleLeadTrial}::uuid) as trials,
        (select count(*)::int from public.lead_trial_outcomes where id = ${ids.staleTrialOutcome}::uuid) as outcomes,
        (select count(*)::int from public.commercial_interviews where id = ${ids.staleInterview}::uuid) as interviews,
        (select count(*)::int from public.growth_events where idempotency_key = ${`contact:${ids.staleSubmission}`}) as events,
        (select count(*)::int from public.email_logs where idempotency_key = ${`email:public-contact-lead:${ids.staleSubmission}`}) as emails,
        (select lead_id is null from public.academy_trials where id = ${ids.staleAcademyTrial}::uuid) as academy_trial_unlinked
    `);
    expect(linkedData.rows[0]).toEqual({
      interactions: 0,
      trials: 0,
      outcomes: 0,
      interviews: 0,
      events: 0,
      emails: 0,
      academy_trial_unlinked: true,
    });

    expect(await eraseExpiredContactLeads()).toMatchObject({
      enabled: true,
      erasedLeads: 0,
      batches: 0,
    });
  });
});
