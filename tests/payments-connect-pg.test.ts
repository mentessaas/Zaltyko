import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";

/**
 * Conectar Stripe (cobro automático, Fase 1) sobre PostgreSQL desechable de
 * GitHub. Instala el candidato SQL solo aquí, después de todos los guardas, y
 * retira sus dos columnas al terminar; nunca en un proyecto enlazado ni con
 * credenciales externas. Cubre lo que los mocks no ven: tipos, valores por
 * defecto y checks reales de las columnas nuevas, el preflight que rechaza
 * reinstalar y la detección de almacenamiento antes y después.
 */
const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";
const describeDisposablePg = describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1");

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

const candidate = () =>
  readFileSync(resolve(process.cwd(), "docs/deployment/candidates/20261116120000_connect_onboarding_candidate.sql"), "utf8");

type PgFailure = { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;

/** Error de PostgreSQL de una sentencia que debe fallar (Drizzle lo envuelve en `cause`). */
async function failureOf(statement: Promise<unknown>) {
  const failure = (await statement.then(
    () => null,
    (error) => error
  )) as PgFailure;
  return failure?.cause ?? failure;
}

describeDisposablePg("connect onboarding candidate schema", () => {
  let organizationId: string;
  let accountId: string;

  beforeAll(async () => {
    assertDisposableTarget();
    // Antes del candidato la función está dormida.
    expect(await isConnectOnboardingStorageAvailable()).toBe(false);
    await db.execute(sql.raw(candidate()));

    organizationId = randomUUID();
    accountId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.organizations (id, name, status, default_timezone, default_currency)
      values (${organizationId}::uuid, 'CI Conectar Stripe', 'active'::zaltyko.organization_status, 'Europe/Madrid', 'EUR')
    `);
    // Sin indicar las columnas nuevas: deben tomar sus valores por defecto.
    await db.execute(sql`
      insert into zaltyko.organization_payment_provider_accounts (id, organization_id, environment, provider_account_reference)
      values (${accountId}::uuid, ${organizationId}::uuid, 'test'::zaltyko.stripe_environment, ${`acct_CI${organizationId.replace(/-/g, "").slice(0, 16)}`})
    `);
  }, 120_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    // Deja la base compartida como estaba: la fila de prueba y las dos columnas
    // (sus checks se van con ellas). La academia de prueba queda, como en las
    // demás suites.
    if (accountId) {
      await db.execute(sql`delete from zaltyko.organization_payment_provider_accounts where id = ${accountId}::uuid`);
    }
    await db.execute(sql`
      alter table zaltyko.organization_payment_provider_accounts
        drop column if exists sepa_debit_payments_capability_status,
        drop column if exists requirements_state
    `);
  });

  it("añade las dos columnas text not null con sus valores por defecto", async () => {
    const columns = await db.execute(sql`
      select column_name::text as name, data_type::text as type, is_nullable::text as nullable, column_default::text as default_value
        from information_schema.columns
       where table_schema = 'zaltyko'
         and table_name = 'organization_payment_provider_accounts'
         and column_name in ('sepa_debit_payments_capability_status', 'requirements_state')
       order by column_name
    `);
    expect(columns.rows).toEqual([
      { name: "requirements_state", type: "text", nullable: "NO", default_value: "'user_action'::text" },
      { name: "sepa_debit_payments_capability_status", type: "text", nullable: "NO", default_value: "'pending'::text" },
    ]);

    const row = await db.execute(sql`
      select sepa_debit_payments_capability_status as sepa, requirements_state as requirements
        from zaltyko.organization_payment_provider_accounts where id = ${accountId}::uuid
    `);
    expect(row.rows).toEqual([{ sepa: "pending", requirements: "user_action" }]);
  });

  it("requirements_state solo admite los cuatro códigos", async () => {
    const refused = await failureOf(
      db.execute(sql`
        update zaltyko.organization_payment_provider_accounts set requirements_state = 'otro' where id = ${accountId}::uuid
      `)
    );
    expect(refused?.code).toBe("23514");
    expect(refused?.message).toContain("organization_payment_provider_accounts_requirements_state_check");

    for (const state of ["none", "user_action", "stripe_review", "past_due"]) {
      await db.execute(sql`
        update zaltyko.organization_payment_provider_accounts set requirements_state = ${state} where id = ${accountId}::uuid
      `);
    }
    const row = await db.execute(sql`
      select requirements_state as requirements from zaltyko.organization_payment_provider_accounts where id = ${accountId}::uuid
    `);
    expect(row.rows).toEqual([{ requirements: "past_due" }]);
  });

  it("sepa_debit_payments_capability_status rechaza un valor en blanco", async () => {
    const refused = await failureOf(
      db.execute(sql`
        update zaltyko.organization_payment_provider_accounts
           set sepa_debit_payments_capability_status = '  ' where id = ${accountId}::uuid
      `)
    );
    expect(refused?.code).toBe("23514");
    expect(refused?.message).toContain("organization_payment_provider_accounts_sepa_status_not_blank");

    await db.execute(sql`
      update zaltyko.organization_payment_provider_accounts
         set sepa_debit_payments_capability_status = 'active' where id = ${accountId}::uuid
    `);
    const row = await db.execute(sql`
      select sepa_debit_payments_capability_status as sepa from zaltyko.organization_payment_provider_accounts where id = ${accountId}::uuid
    `);
    expect(row.rows).toEqual([{ sepa: "active" }]);
  });

  it("detecta el almacenamiento instalado y rechaza reinstalar el candidato", async () => {
    expect(await isConnectOnboardingStorageAvailable()).toBe(true);
    expect(await isConnectOnboardingStorageAvailable(db)).toBe(true);

    const raised = await failureOf(db.execute(sql.raw(candidate())));
    expect(raised).not.toBeNull();
    expect(raised?.code).toBe("P0001");
    expect(raised?.message).toBe(
      "Connect onboarding candidate requires sepa_debit_payments_capability_status and requirements_state absent; inspect existing schema before promotion"
    );
  });
});
