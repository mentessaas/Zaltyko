import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

/**
 * This is an explicit write probe for the isolated E2E database only.
 *
 * The test is skipped by default. CI enables it with E2E_STAGING_WRITE_TEST
 * after the target guard has already rejected production and the E2E job has
 * provisioned the sandbox. Every synthetic row is removed in afterAll.
 */
const enabled = process.env.E2E_STAGING_WRITE_TEST === "true";
test.skip(
  !enabled,
  "The contact write probe only runs when CI explicitly targets the E2E sandbox."
);

const pool = enabled
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
const submissionId = randomUUID();
const email = `e2e-contact-${submissionId}@zaltyko.test`;
const idempotencyKey = `contact:${submissionId}`;
const emailDedupeKey = `public-contact-lead:${submissionId}`;
const emailLogIdempotencyKey = `email:${emailDedupeKey}`;

const payload = {
  name: "E2E Contact Probe",
  email,
  academy: "Zaltyko E2E Sandbox",
  reason: "sales" as const,
  source: "academy_waitlist",
  message: "Solicitud de información desde la landing de academias.",
  marketingConsent: true,
  visitorId: null,
  attribution: {
    utm_source: "e2e_sandbox",
    utm_medium: "test",
    utm_campaign: "academy_waitlist",
    utm_term: "artistic_gymnastics",
    utm_content: "form_test",
  },
  submissionId,
};

test.afterAll(async () => {
  if (!pool) return;
  try {
    await pool.query("BEGIN");
    await pool.query(
      "DELETE FROM directory_deliveries WHERE subscription_id IN (SELECT id FROM directory_subscriptions WHERE email = $1 AND purpose = 'marketing' AND source = 'academy_waitlist')",
      [email]
    );
    await pool.query(
      "DELETE FROM directory_subscriptions WHERE email = $1 AND purpose = 'marketing' AND source = 'academy_waitlist'",
      [email]
    );
    await pool.query("DELETE FROM lead_interactions WHERE submission_id = $1", [
      submissionId,
    ]);
    await pool.query("DELETE FROM growth_events WHERE idempotency_key = $1", [
      idempotencyKey,
    ]);
    await pool.query("DELETE FROM email_logs WHERE idempotency_key = $1", [
      emailLogIdempotencyKey,
    ]);
    await pool.query("DELETE FROM leads WHERE email = $1", [email]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await pool.end();
  }
});

test("persists one academy waitlist lead, its attribution, event and notification attempt in sandbox", async ({
  request,
}) => {
  const first = await request.post("/api/contact", { data: payload });
  expect(first.status()).toBe(201);
  const firstBody = await first.json();
  expect(firstBody.ok).toBe(true);
  expect(firstBody.data.idempotent).toBe(false);
  expect(firstBody.data.marketingSubscriptionRequestAccepted).toBe(true);
  expect(firstBody.data.leadId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(firstBody.data.interactionId).toMatch(/^[0-9a-f-]{36}$/i);

  const retry = await request.post("/api/contact", { data: payload });
  expect(retry.status()).toBe(201);
  const retryBody = await retry.json();
  expect(retryBody.ok).toBe(true);
  expect(retryBody.data.idempotent).toBe(true);

  const rows = await pool.query<{
    lead_count: string;
    interaction_count: string;
    growth_count: string;
    lead_attribution: Record<string, string>;
    event_source: string;
    event_utm_campaign: string;
    event_opt_in: string;
    notification_count: string;
    notification_to: string;
    notification_subject: string;
    consent_count: string;
    consent_source: string;
    consent_purpose: string;
    consent_version: string;
    consent_pending: boolean;
    confirmation_delivery_count: string;
    confirmation_delivery_status: string;
  }>(
    `
      select
        (select count(*) from leads where email = $1)::text as lead_count,
        (select count(*) from lead_interactions where submission_id = $2)::text as interaction_count,
        (select count(*) from growth_events where idempotency_key = $3)::text as growth_count,
        (select metadata::jsonb -> 'attribution' from leads where email = $1) as lead_attribution,
        (select source from growth_events where idempotency_key = $3) as event_source,
        (select properties ->> 'utm_campaign' from growth_events where idempotency_key = $3) as event_utm_campaign,
        (select properties ->> 'marketing_opt_in' from growth_events where idempotency_key = $3) as event_opt_in,
        (select count(*) from email_logs where idempotency_key = $4 and template = 'public-contact-lead')::text as notification_count,
        (select to_email from email_logs where idempotency_key = $4 and template = 'public-contact-lead') as notification_to,
        (select subject from email_logs where idempotency_key = $4 and template = 'public-contact-lead') as notification_subject,
        (select count(*) from directory_subscriptions where email = $1 and purpose = 'marketing' and source = 'academy_waitlist')::text as consent_count,
        (select source from directory_subscriptions where email = $1 and purpose = 'marketing' and source = 'academy_waitlist' order by created_at desc limit 1) as consent_source,
        (select purpose from directory_subscriptions where email = $1 and purpose = 'marketing' and source = 'academy_waitlist' order by created_at desc limit 1) as consent_purpose,
        (select policy_version from directory_subscriptions where email = $1 and purpose = 'marketing' and source = 'academy_waitlist' order by created_at desc limit 1) as consent_version,
        (select confirmed_at is null from directory_subscriptions where email = $1 and purpose = 'marketing' and source = 'academy_waitlist' order by created_at desc limit 1) as consent_pending,
        (select count(*) from directory_deliveries d join directory_subscriptions s on s.id = d.subscription_id where s.email = $1 and s.purpose = 'marketing' and s.source = 'academy_waitlist' and d.dedupe_key like 'confirm:%')::text as confirmation_delivery_count,
        (select d.status from directory_deliveries d join directory_subscriptions s on s.id = d.subscription_id where s.email = $1 and s.purpose = 'marketing' and s.source = 'academy_waitlist' and d.dedupe_key like 'confirm:%' order by d.created_at desc limit 1) as confirmation_delivery_status
    `,
    [email, submissionId, idempotencyKey, emailLogIdempotencyKey]
  );

  expect(rows.rows[0]).toEqual({
    lead_count: "1",
    interaction_count: "1",
    growth_count: "1",
    lead_attribution: payload.attribution,
    event_source: "academy_waitlist",
    event_utm_campaign: "academy_waitlist",
    event_opt_in: "true",
    notification_count: "1",
    notification_to: "hola@zaltyko.com",
    notification_subject: "[Zaltyko] Nueva solicitud · Información de ventas",
    consent_count: "1",
    consent_source: "academy_waitlist",
    consent_purpose: "marketing",
    consent_version: "academy-waitlist-2026-10-16",
    consent_pending: true,
    confirmation_delivery_count: "1",
    confirmation_delivery_status: "pending",
  });
});
