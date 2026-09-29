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
const visitorId = randomUUID();
const email = `e2e-contact-${submissionId}@zaltyko.test`;
const idempotencyKey = `contact:${submissionId}`;

const payload = {
  name: "E2E Contact Probe",
  email,
  academy: "Zaltyko E2E Sandbox",
  reason: "demo" as const,
  plan: "starter" as const,
  source: "e2e_sandbox_contact",
  message: "Prueba controlada del formulario de contacto en sandbox.",
  visitorId,
  submissionId,
};

test.afterAll(async () => {
  if (!pool) return;
  try {
    await pool.query("BEGIN");
    await pool.query("DELETE FROM lead_interactions WHERE submission_id = $1", [
      submissionId,
    ]);
    await pool.query("DELETE FROM growth_events WHERE idempotency_key = $1", [
      idempotencyKey,
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

test("persists one contact and keeps retries idempotent in the sandbox", async ({
  request,
}) => {
  const first = await request.post("/api/contact", { data: payload });
  expect(first.status()).toBe(201);
  const firstBody = await first.json();
  expect(firstBody.ok).toBe(true);
  expect(firstBody.data.idempotent).toBe(false);
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
  }>(
    `
      select
        (select count(*) from leads where email = $1)::text as lead_count,
        (select count(*) from lead_interactions where submission_id = $2)::text as interaction_count,
        (select count(*) from growth_events where idempotency_key = $3)::text as growth_count
    `,
    [email, submissionId, idempotencyKey]
  );

  expect(rows.rows[0]).toEqual({
    lead_count: "1",
    interaction_count: "1",
    growth_count: "1",
  });
});
