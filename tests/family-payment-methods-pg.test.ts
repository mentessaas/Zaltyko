import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";

/**
 * Pago automático de cuotas (cobro automático, Fase 2) sobre PostgreSQL
 * desechable de GitHub. Instala el candidato SQL solo aquí, después de todos
 * los guardas (y antes el de la Fase 1 si sus columnas no están), y retira al
 * terminar todo lo que instaló; nunca en un proyecto enlazado ni con
 * credenciales externas. Cubre lo que los mocks no ven: tipos, checks reales,
 * permisos, el preflight que rechaza reinstalar y la detección de
 * almacenamiento antes y después.
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

const readCandidate = (name: string) =>
  readFileSync(resolve(process.cwd(), `docs/deployment/candidates/${name}`), "utf8");
const connectOnboardingCandidate = () => readCandidate("20261116120000_connect_onboarding_candidate.sql");
const familyPaymentMethodsCandidate = () => readCandidate("20261116180000_family_payment_methods_candidate.sql");

type PgFailure = { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;

/** Error de PostgreSQL de una sentencia que debe fallar (Drizzle lo envuelve en `cause`). */
async function failureOf(statement: Promise<unknown>) {
  const failure = (await statement.then(
    () => null,
    (error) => error
  )) as PgFailure;
  return failure?.cause ?? failure;
}

/**
 * El candidato abre su propia transacción (`begin; … commit;`). Si falla a
 * mitad, la conexión queda en una transacción abortada; por eso se ejecuta en
 * una conexión propia que se cierra al terminar y nunca vuelve al pool de
 * `db`. Solo se llama después de assertDisposableTarget().
 */
async function runOnOwnConnection(text: string): Promise<void> {
  const client = new Client({ connectionString: process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

const SHA = "a".repeat(64);

describeDisposablePg("family payment methods candidate schema", () => {
  let connectOnboardingInstalledHere = false;
  let candidateInstalledHere = false;

  beforeAll(async () => {
    assertDisposableTarget();
    // Antes del candidato la función está dormida.
    expect(await isFamilyPaymentMethodsStorageAvailable()).toBe(false);

    // La base de CI solo tiene supabase/migrations: la Fase 1 va primero.
    if (!(await isConnectOnboardingStorageAvailable())) {
      await db.execute(sql.raw(connectOnboardingCandidate()));
      connectOnboardingInstalledHere = true;
    }
    await runOnOwnConnection(familyPaymentMethodsCandidate());
    candidateInstalledHere = true;
  }, 120_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    // Deja la base compartida como estaba: otras suites (p. ej. la exportación
    // de academia, que compara las tablas reales con su catálogo, o la de
    // Conectar Stripe, que espera las columnas de la Fase 1 ausentes) no deben
    // ver nada de lo instalado aquí. Los checks se van con su columna.
    if (candidateInstalledHere) {
      await db.execute(sql`drop table if exists zaltyko.family_payment_setup_attempts`);
      await db.execute(sql`
        alter table zaltyko.family_payment_authorizations drop column if exists payment_method_kind
      `);
    }
    if (connectOnboardingInstalledHere) {
      await db.execute(sql`
        alter table zaltyko.organization_payment_provider_accounts
          drop column if exists sepa_debit_payments_capability_status,
          drop column if exists requirements_state
      `);
    }
  });

  it("crea la tabla de intentos con sus columnas y tipos", async () => {
    const columns = await db.execute(sql`
      select column_name::text as name, data_type::text as type, is_nullable::text as nullable, column_default::text as default_value
        from information_schema.columns
       where table_schema = 'zaltyko'
         and table_name = 'family_payment_setup_attempts'
       order by ordinal_position
    `);
    expect(columns.rows).toEqual([
      { name: "id", type: "uuid", nullable: "NO", default_value: "gen_random_uuid()" },
      { name: "organization_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "family_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "family_payer_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "guardian_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "payment_provider_account_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "payment_method_kind", type: "text", nullable: "NO", default_value: null },
      { name: "provider_customer_reference", type: "text", nullable: "NO", default_value: null },
      { name: "provider_setup_reference", type: "text", nullable: "NO", default_value: null },
      { name: "consent_version", type: "text", nullable: "NO", default_value: null },
      { name: "consent_text_sha256", type: "text", nullable: "NO", default_value: null },
      { name: "consented_at", type: "timestamp with time zone", nullable: "NO", default_value: null },
      { name: "client_ip_prefix", type: "text", nullable: "YES", default_value: null },
      { name: "user_agent_excerpt", type: "text", nullable: "YES", default_value: null },
      { name: "status", type: "text", nullable: "NO", default_value: "'open'::text" },
      { name: "authorization_id", type: "uuid", nullable: "YES", default_value: null },
      { name: "created_at", type: "timestamp with time zone", nullable: "NO", default_value: "now()" },
      { name: "updated_at", type: "timestamp with time zone", nullable: "NO", default_value: "now()" },
    ]);

    const kind = await db.execute(sql`
      select data_type::text as type, is_nullable::text as nullable, column_default::text as default_value
        from information_schema.columns
       where table_schema = 'zaltyko'
         and table_name = 'family_payment_authorizations'
         and column_name = 'payment_method_kind'
    `);
    expect(kind.rows).toEqual([{ type: "text", nullable: "YES", default_value: null }]);
  });

  it("solo service_role lee y escribe, con RLS ENABLE y FORCE", async () => {
    const rls = await db.execute(sql`
      select relrowsecurity as enabled, relforcerowsecurity as forced
        from pg_class where oid = 'zaltyko.family_payment_setup_attempts'::regclass
    `);
    expect(rls.rows).toEqual([{ enabled: true, forced: true }]);

    const grants = await db.execute(sql`
      select coalesce(r.rolname, 'PUBLIC')::text as grantee, a.privilege_type::text as privilege
        from pg_class c
        cross join lateral aclexplode(c.relacl) a
        left join pg_roles r on r.oid = a.grantee
       where c.oid = 'zaltyko.family_payment_setup_attempts'::regclass
         and coalesce(r.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')
       order by 1, 2
    `);
    expect(grants.rows).toEqual([
      { grantee: "service_role", privilege: "INSERT" },
      { grantee: "service_role", privilege: "SELECT" },
      { grantee: "service_role", privilege: "UPDATE" },
    ]);

    const comments = await db.execute(sql`
      select obj_description('zaltyko.family_payment_setup_attempts'::regclass, 'pg_class') as attempts,
             obj_description('zaltyko.family_payment_authorizations'::regclass, 'pg_class') as authorizations
    `);
    const row = comments.rows[0] as { attempts: string | null; authorizations: string | null };
    expect(row.attempts).toContain("nunca datos de tarjeta ni de banco");
    expect(row.authorizations).not.toContain("not operational");
  });

  /**
   * Inserta un intento con valores válidos salvo lo que indique `override`.
   * Los ids son nuevos: los checks se evalúan antes que las claves foráneas,
   * así que una fila que solo incumple un check falla por ese check (23514) y
   * una fila correcta falla por la clave foránea (23503).
   */
  function insertAttempt(override: Partial<Record<"kind" | "sha" | "agent" | "status", string>> & { authorizationId?: string | null } = {}) {
    const organizationId = randomUUID();
    return db.execute(sql`
      insert into zaltyko.family_payment_setup_attempts (
        organization_id, family_id, family_payer_id, guardian_id, payment_provider_account_id,
        payment_method_kind, provider_customer_reference, provider_setup_reference,
        consent_version, consent_text_sha256, consented_at, client_ip_prefix, user_agent_excerpt,
        status, authorization_id
      ) values (
        ${organizationId}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
        ${override.kind ?? "card"}, 'cus_CI', 'seti_CI',
        'borrador-2026-11-16', ${override.sha ?? SHA}, now(), '203.0.113.0', ${override.agent ?? "Mozilla/5.0"},
        ${override.status ?? "open"}, ${override.authorizationId ?? null}::uuid
      )
    `);
  }

  async function expectCheck(statement: Promise<unknown>, constraint: string) {
    const refused = await failureOf(statement);
    expect(refused?.code).toBe("23514");
    expect(refused?.message).toContain(constraint);
  }

  it("el intento rechaza tipo, huella, agente y estado incoherentes", async () => {
    await expectCheck(insertAttempt({ kind: "otro" }), "family_payment_setup_attempts_method_kind_check");
    await expectCheck(insertAttempt({ sha: "x" }), "family_payment_setup_attempts_consent_digest_valid");
    await expectCheck(insertAttempt({ agent: "a".repeat(121) }), "family_payment_setup_attempts_user_agent_excerpt_length");
    await expectCheck(insertAttempt({ status: "completed" }), "family_payment_setup_attempts_completed_authorization_valid");
    await expectCheck(
      insertAttempt({ status: "open", authorizationId: randomUUID() }),
      "family_payment_setup_attempts_completed_authorization_valid"
    );
    await expectCheck(insertAttempt({ status: "otro" }), "family_payment_setup_attempts_status_check");

    // 120 caracteres caben; la fila pasa los checks y la detiene la clave foránea.
    const blocked = await failureOf(insertAttempt({ agent: "a".repeat(120), kind: "sepa_debit" }));
    expect(blocked?.code).toBe("23503");
  });

  /** Autorización con todo lo que exige `active` salvo lo que indique `override`. */
  function insertAuthorization(override: { status?: string; kind?: string | null; mandate?: string | null }) {
    return db.execute(sql`
      insert into zaltyko.family_payment_authorizations (
        organization_id, family_id, family_payer_id, payment_provider_account_id, status,
        provider_setup_reference, payment_method_reference, mandate_reference,
        consent_version, consent_evidence_reference, consent_evidence_sha256, consented_at,
        consented_by_guardian_id, payment_method_kind
      ) values (
        ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
        ${override.status ?? "active"}::zaltyko.payment_authorization_status,
        'seti_CI', 'pm_CI', ${override.mandate ?? null},
        'borrador-2026-11-16', ${`attempt:${randomUUID()}`}, ${SHA}, now(),
        ${randomUUID()}::uuid, ${override.kind === undefined ? "card" : override.kind}
      )
    `);
  }

  it("la autorización rechaza un tipo desconocido, activa sin tipo y domiciliación activa sin orden", async () => {
    await expectCheck(insertAuthorization({ status: "pending", kind: "otro" }), "family_payment_authorizations_method_kind_check");
    await expectCheck(insertAuthorization({ kind: null }), "family_payment_authorizations_active_method_kind_required");
    await expectCheck(
      insertAuthorization({ kind: "sepa_debit", mandate: null }),
      "family_payment_authorizations_active_sepa_mandate_required"
    );

    // Una pendiente puede no tener tipo todavía, y una domiciliación activa
    // con su orden pasa los checks: las detiene la clave foránea.
    expect((await failureOf(insertAuthorization({ status: "pending", kind: null })))?.code).toBe("23503");
    expect((await failureOf(insertAuthorization({ kind: "sepa_debit", mandate: "mandate_CI" })))?.code).toBe("23503");
  });

  it("detecta el almacenamiento instalado y rechaza reinstalar el candidato", async () => {
    expect(await isFamilyPaymentMethodsStorageAvailable()).toBe(true);
    expect(await isFamilyPaymentMethodsStorageAvailable(db)).toBe(true);

    const raised = (await runOnOwnConnection(familyPaymentMethodsCandidate()).then(
      () => null,
      (error) => error
    )) as PgFailure;
    expect(raised).not.toBeNull();
    expect(raised?.code).toBe("P0001");
    expect(raised?.message).toBe(
      "Family payment methods candidate requires family_payment_setup_attempts and family_payment_authorizations.payment_method_kind absent; inspect existing schema before promotion"
    );
    // El intento abortado no dejó nada a medias.
    expect(await isFamilyPaymentMethodsStorageAvailable()).toBe(true);
  });
});
