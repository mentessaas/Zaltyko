import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  completeFamilyPaymentSetup,
  getFamilyPaymentMethodState,
  listOwnerFamilyPaymentMethods,
  revokeFamilyPaymentMethod,
  revokeFamilyPaymentMethodByOwner,
  startFamilyPaymentSetup,
} from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { FAMILY_PAYMENT_CONSENT_VERSION, type PaymentMethodKind } from "@/modules/family-payment-methods/domain/consent";
import type { FamilyPaymentGateway } from "@/modules/family-payment-methods/infrastructure/stripe-family-gateway";
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

/**
 * Servicio de pago automático sobre la base real con Stripe simulado:
 * evidencia guardada, carrera de dos `complete`, cambio de método, revocar
 * por la familia y por la academia, y aislamiento de la persona pagadora.
 * Es autónomo: instala los candidatos que falten y los retira al terminar.
 */
describeDisposablePg("servicio de pago automático en Postgres desechable", () => {
  const createdOrganizations: string[] = [];
  let connectOnboardingInstalledHere = false;
  let candidateInstalledHere = false;

  const compact = () => randomUUID().replace(/-/g, "").slice(0, 20);

  async function authUser(): Promise<string> {
    const id = randomUUID();
    await db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`ci-family-pay-${id}@example.invalid`})`);
    return id;
  }

  /** Academia con plan de pago, owner y cuenta conectada lista (tarjeta y domiciliación). */
  async function createReadyAcademy(label: string) {
    const organizationId = randomUUID();
    const ownerId = await authUser();
    const accountRowId = randomUUID();
    const accountReference = `acct_CI${compact()}`;
    await db.execute(sql`
      insert into zaltyko.organizations (id, name, status, default_timezone, default_currency)
      values (${organizationId}::uuid, ${`CI Pago automático ${label}`}, 'active'::zaltyko.organization_status, 'Europe/Madrid', 'EUR')
    `);
    await db.execute(sql`
      insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
      values (${randomUUID()}::uuid, ${organizationId}::uuid, ${ownerId}::uuid, 'owner', 'active', 'all')
    `);
    await db.execute(sql`
      update zaltyko.organization_entitlements
         set plan_code = 'network', source = 'contract', source_reference = ${`contract:${organizationId}`}
       where organization_id = ${organizationId}::uuid
    `);
    await db.execute(sql`
      insert into zaltyko.organization_payment_provider_accounts (
        id, organization_id, environment, provider_account_reference, status,
        card_payments_capability_status, sepa_debit_payments_capability_status, requirements_state
      ) values (
        ${accountRowId}::uuid, ${organizationId}::uuid, 'test'::zaltyko.stripe_environment, ${accountReference},
        'active'::zaltyko.organization_payment_account_status, 'active', 'active', 'none'
      )
    `);
    createdOrganizations.push(organizationId);
    const familyId = randomUUID();
    await db.execute(sql`insert into zaltyko.families (id, organization_id) values (${familyId}::uuid, ${organizationId}::uuid)`);
    return { organizationId, ownerId, accountRowId, accountReference, familyId };
  }

  /** Tutor con cuenta, enlazado a la familia; pagador vigente si `payer`. */
  async function createTutor(
    academy: { organizationId: string; familyId: string },
    input: { payer: boolean; givenName: string; familyName: string }
  ) {
    const userId = await authUser();
    const personId = randomUUID();
    const guardianId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (${personId}::uuid, ${academy.organizationId}::uuid, ${input.givenName}, ${input.familyName})
    `);
    await db.execute(sql`
      insert into zaltyko.guardians (id, organization_id, person_id, auth_user_id)
      values (${guardianId}::uuid, ${academy.organizationId}::uuid, ${personId}::uuid, ${userId}::uuid)
    `);
    await db.execute(sql`
      insert into zaltyko.family_guardians (organization_id, family_id, guardian_id, relationship)
      values (${academy.organizationId}::uuid, ${academy.familyId}::uuid, ${guardianId}::uuid, 'parent')
    `);
    let familyPayerId: string | null = null;
    if (input.payer) {
      familyPayerId = randomUUID();
      await db.execute(sql`
        insert into zaltyko.family_payers (id, organization_id, family_id, guardian_id, is_primary, starts_on)
        values (${familyPayerId}::uuid, ${academy.organizationId}::uuid, ${academy.familyId}::uuid, ${guardianId}::uuid, true, '2000-01-01')
      `);
    }
    return { userId, guardianId, familyPayerId };
  }

  /**
   * Stripe simulado en la cuenta de la academia: recuerda cada preparación
   * y la devuelve como completada, con un pm_ propio (y orden si es
   * domiciliación).
   */
  function stripeDouble() {
    const setups = new Map<string, { attemptId: string; customer: string; kind: PaymentMethodKind }>();
    return {
      createCustomer: vi.fn(async () => ({ id: `cus_CI${compact()}` })),
      createSetupIntent: vi.fn(async (input: { customer: string; kind: PaymentMethodKind; attemptId: string }) => {
        const id = `seti_CI${compact()}`;
        setups.set(id, { attemptId: input.attemptId, customer: input.customer, kind: input.kind });
        return { id, clientSecret: `${id}_secret_ci` };
      }),
      retrieveSetupIntent: vi.fn(async (input: { setupIntentId: string }) => {
        const setup = setups.get(input.setupIntentId);
        if (!setup) throw new Error("unknown setup intent");
        const suffix = input.setupIntentId.slice("seti_".length);
        return {
          id: input.setupIntentId,
          status: "succeeded",
          customer: setup.customer,
          paymentMethod: `pm_${suffix}`,
          paymentMethodType: setup.kind,
          mandate: setup.kind === "sepa_debit" ? `mandate_${suffix}` : null,
          metadataAttemptId: setup.attemptId,
          hasLastSetupError: false,
        };
      }),
      detachPaymentMethod: vi.fn(async (): Promise<void> => undefined),
    } satisfies FamilyPaymentGateway;
  }

  function startInput(
    academy: { organizationId: string; familyId: string },
    tutor: { userId: string },
    kind: PaymentMethodKind = "card"
  ) {
    return {
      userId: tutor.userId,
      organizationId: academy.organizationId,
      familyId: academy.familyId,
      kind,
      consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
      consentAccepted: true as const,
      clientIp: "203.0.113.77",
      userAgent: "Mozilla/5.0 (CI)",
    };
  }

  async function authorizationRows(organizationId: string) {
    const result = await db.execute(sql`
      select id::text as "id", status::text as "status", payment_method_kind as "kind",
             payment_method_reference as "paymentMethod", mandate_reference as "mandate",
             provider_setup_reference as "setupReference", consent_version as "consentVersion",
             consent_evidence_reference as "evidenceReference", consent_evidence_sha256 as "evidenceSha",
             consented_by_guardian_id::text as "guardianId", revoked_at is not null as "hasRevokedAt"
        from zaltyko.family_payment_authorizations
       where organization_id = ${organizationId}::uuid
       order by created_at, id
    `);
    return result.rows as Array<{
      id: string;
      status: string;
      kind: string;
      paymentMethod: string;
      mandate: string | null;
      setupReference: string;
      consentVersion: string;
      evidenceReference: string;
      evidenceSha: string;
      guardianId: string;
      hasRevokedAt: boolean;
    }>;
  }

  async function auditCount(organizationId: string, action: string): Promise<number> {
    const result = await db.execute(sql`
      select count(*)::int as n from zaltyko.audit_log where organization_id = ${organizationId}::uuid and action = ${action}
    `);
    return (result.rows[0] as { n: number }).n;
  }

  beforeAll(async () => {
    assertDisposableTarget();
    if (!(await isConnectOnboardingStorageAvailable())) {
      await db.execute(sql.raw(connectOnboardingCandidate()));
      connectOnboardingInstalledHere = true;
    }
    if (!(await isFamilyPaymentMethodsStorageAvailable())) {
      await runOnOwnConnection(familyPaymentMethodsCandidate());
      candidateInstalledHere = true;
    }
    vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_ci_family_payment_fake");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (!disposablePgEnabled) return;
    // Primero lo que referencia a otras filas (los intentos apuntan a la
    // autorización y las autorizaciones a la cuenta conectada).
    for (const organizationId of createdOrganizations) {
      await db.execute(sql`delete from zaltyko.family_payment_setup_attempts where organization_id = ${organizationId}::uuid`);
      await db.execute(sql`delete from zaltyko.family_payment_authorizations where organization_id = ${organizationId}::uuid`);
      await db.execute(sql`delete from zaltyko.organization_payment_provider_accounts where organization_id = ${organizationId}::uuid`);
    }
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

  it("start → complete activa una autorización con la evidencia y el tipo", async () => {
    const academy = await createReadyAcademy("Evidencia");
    const tutor = await createTutor(academy, { payer: true, givenName: "Lucía", familyName: "García Pons" });
    const gateway = stripeDouble();

    expect(await getFamilyPaymentMethodState({ userId: tutor.userId, organizationId: academy.organizationId, familyId: academy.familyId }))
      .toMatchObject({ kind: "none", kinds: ["card", "sepa_debit"] });

    const started = await startFamilyPaymentSetup(startInput(academy, tutor), { gateway });
    expect(started.connectedAccount).toBe(academy.accountReference);
    expect(gateway.createCustomer).toHaveBeenCalledTimes(1);

    const attempts = await db.execute(sql`
      select id::text as "id", status, payment_method_kind as "kind", client_ip_prefix as "ip",
             user_agent_excerpt as "agent", consent_version as "version", consent_text_sha256 as "sha",
             guardian_id::text as "guardianId", family_payer_id::text as "payerId", provider_setup_reference as "setupReference"
        from zaltyko.family_payment_setup_attempts
       where organization_id = ${academy.organizationId}::uuid
    `);
    const attempt = attempts.rows[0] as {
      id: string; status: string; kind: string; ip: string; agent: string; version: string;
      sha: string; guardianId: string; payerId: string; setupReference: string;
    };
    expect(attempts.rows).toHaveLength(1);
    expect(attempt).toMatchObject({
      status: "open",
      kind: "card",
      ip: "203.0.113.0",
      agent: "Mozilla/5.0 (CI)",
      version: FAMILY_PAYMENT_CONSENT_VERSION,
      guardianId: tutor.guardianId,
      payerId: tutor.familyPayerId,
      setupReference: started.setupIntentId,
    });
    expect(attempt.sha).toMatch(/^[a-f0-9]{64}$/);

    expect(
      await completeFamilyPaymentSetup(
        { userId: tutor.userId, organizationId: academy.organizationId, familyId: academy.familyId, setupIntentId: started.setupIntentId },
        { gateway }
      )
    ).toEqual({ outcome: "active", method: "card" });

    const rows = await authorizationRows(academy.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "active",
      kind: "card",
      paymentMethod: `pm_${started.setupIntentId.slice("seti_".length)}`,
      mandate: null,
      setupReference: started.setupIntentId,
      consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
      evidenceReference: `family_payment_setup_attempts:${attempt.id}`,
      evidenceSha: attempt.sha,
      guardianId: tutor.guardianId,
      hasRevokedAt: false,
    });
    const completed = await db.execute(sql`
      select status, authorization_id::text as "authorizationId"
        from zaltyko.family_payment_setup_attempts where id = ${attempt.id}::uuid
    `);
    expect(completed.rows).toEqual([{ status: "completed", authorizationId: rows[0].id }]);

    // Auditoría y evento sin IP ni agente.
    const written = await db.execute(sql`
      select (select coalesce(string_agg(metadata::text, ' '), '') from zaltyko.audit_log where organization_id = ${academy.organizationId}::uuid) as audit,
             (select coalesce(string_agg(payload::text, ' '), '') from zaltyko.outbox_events where organization_id = ${academy.organizationId}::uuid) as outbox
    `);
    const text = JSON.stringify(written.rows);
    expect(text).not.toContain("203.0.113");
    expect(text).not.toContain("Mozilla");
    expect(await auditCount(academy.organizationId, "family_payment_methods.setup_started")).toBe(1);
    expect(await auditCount(academy.organizationId, "family_payment_methods.authorization_activated")).toBe(1);

    expect(await getFamilyPaymentMethodState({ userId: tutor.userId, organizationId: academy.organizationId, familyId: academy.familyId }))
      .toMatchObject({ kind: "active", method: "card" });
  });

  it("dos complete simultáneos dejan una sola autorización activa", async () => {
    const academy = await createReadyAcademy("Carrera");
    const tutor = await createTutor(academy, { payer: true, givenName: "Marta", familyName: "Ruiz" });
    const gateway = stripeDouble();
    const started = await startFamilyPaymentSetup(startInput(academy, tutor), { gateway });
    const input = {
      userId: tutor.userId,
      organizationId: academy.organizationId,
      familyId: academy.familyId,
      setupIntentId: started.setupIntentId,
    };

    const results = await Promise.all([
      completeFamilyPaymentSetup(input, { gateway }),
      completeFamilyPaymentSetup(input, { gateway }),
    ]);
    expect(results).toEqual([
      { outcome: "active", method: "card" },
      { outcome: "active", method: "card" },
    ]);
    const rows = await authorizationRows(academy.organizationId);
    expect(rows.filter((row) => row.status === "active")).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(await auditCount(academy.organizationId, "family_payment_methods.authorization_activated")).toBe(1);
  });

  it("cambiar de método revoca la anterior, reutiliza el cliente y desliga el pm_ anterior", async () => {
    const academy = await createReadyAcademy("Cambio");
    const tutor = await createTutor(academy, { payer: true, givenName: "Ana", familyName: "López" });
    const gateway = stripeDouble();
    const base = { userId: tutor.userId, organizationId: academy.organizationId, familyId: academy.familyId };

    const card = await startFamilyPaymentSetup(startInput(academy, tutor, "card"), { gateway });
    await completeFamilyPaymentSetup({ ...base, setupIntentId: card.setupIntentId }, { gateway });
    const sepa = await startFamilyPaymentSetup(startInput(academy, tutor, "sepa_debit"), { gateway });
    expect(gateway.createCustomer).toHaveBeenCalledTimes(1);
    expect(
      await completeFamilyPaymentSetup({ ...base, setupIntentId: sepa.setupIntentId }, { gateway })
    ).toEqual({ outcome: "active", method: "sepa_debit" });

    const rows = await authorizationRows(academy.organizationId);
    expect(rows.map((row) => [row.kind, row.status, row.hasRevokedAt])).toEqual([
      ["card", "revoked", true],
      ["sepa_debit", "active", false],
    ]);
    expect(rows[1].mandate).toBe(`mandate_${sepa.setupIntentId.slice("seti_".length)}`);
    expect(gateway.detachPaymentMethod).toHaveBeenCalledTimes(1);
    expect(gateway.detachPaymentMethod).toHaveBeenCalledWith({
      connectedAccount: academy.accountReference,
      paymentMethod: rows[0].paymentMethod,
    });
    expect(await auditCount(academy.organizationId, "family_payment_methods.authorization_revoked")).toBe(1);
  });

  it("la familia y la academia pueden dejar de pagar automáticamente", async () => {
    const academy = await createReadyAcademy("Revocar");
    const tutor = await createTutor(academy, { payer: true, givenName: "Elena", familyName: "Martín Sanz" });
    const gateway = stripeDouble();
    const base = { userId: tutor.userId, organizationId: academy.organizationId, familyId: academy.familyId };

    // Familia.
    const first = await startFamilyPaymentSetup(startInput(academy, tutor), { gateway });
    await completeFamilyPaymentSetup({ ...base, setupIntentId: first.setupIntentId }, { gateway });
    expect(await revokeFamilyPaymentMethod(base, { gateway })).toEqual({ outcome: "revoked" });
    expect(await revokeFamilyPaymentMethod(base, { gateway })).toEqual({ outcome: "none" });
    expect(await getFamilyPaymentMethodState(base)).toMatchObject({ kind: "none" });
    expect(gateway.detachPaymentMethod).toHaveBeenCalledTimes(1);

    // Academia.
    const second = await startFamilyPaymentSetup(startInput(academy, tutor), { gateway });
    await completeFamilyPaymentSetup({ ...base, setupIntentId: second.setupIntentId }, { gateway });
    const listed = await listOwnerFamilyPaymentMethods({ userId: academy.ownerId, organizationId: academy.organizationId });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ familyId: academy.familyId, payerName: "Elena Martín", method: "card" });

    const owner = { userId: academy.ownerId, organizationId: academy.organizationId, authorizationId: listed[0].authorizationId };
    expect(await revokeFamilyPaymentMethodByOwner(owner, { gateway })).toEqual({ outcome: "revoked" });
    expect(await revokeFamilyPaymentMethodByOwner(owner, { gateway })).toEqual({ outcome: "none" });
    expect(await listOwnerFamilyPaymentMethods({ userId: academy.ownerId, organizationId: academy.organizationId })).toEqual([]);
    expect(gateway.detachPaymentMethod).toHaveBeenCalledTimes(2);

    const rows = await authorizationRows(academy.organizationId);
    expect(rows.map((row) => row.status)).toEqual(["revoked", "revoked"]);
    const actors = await db.execute(sql`
      select payload->>'actor' as actor from zaltyko.outbox_events
       where organization_id = ${academy.organizationId}::uuid
         and event_name = 'family_payment_methods.authorization_revoked'
       order by occurred_at, id
    `);
    expect(actors.rows).toEqual([{ actor: "family" }, { actor: "owner" }]);
  });

  it("otro tutor no pagador de la familia y un tutor de otra academia reciben 404", async () => {
    const academy = await createReadyAcademy("Aislamiento A");
    const payer = await createTutor(academy, { payer: true, givenName: "Rosa", familyName: "Vidal" });
    const notPayer = await createTutor(academy, { payer: false, givenName: "Pablo", familyName: "Vidal" });
    const other = await createReadyAcademy("Aislamiento B");
    const foreign = await createTutor(other, { payer: true, givenName: "Iván", familyName: "Soler" });
    const gateway = stripeDouble();

    for (const intruder of [notPayer, foreign]) {
      await expect(startFamilyPaymentSetup(startInput(academy, intruder), { gateway })).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });
      await expect(
        revokeFamilyPaymentMethod({ userId: intruder.userId, organizationId: academy.organizationId, familyId: academy.familyId }, { gateway })
      ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
      expect(
        await getFamilyPaymentMethodState({ userId: intruder.userId, organizationId: academy.organizationId, familyId: academy.familyId })
      ).toEqual({ kind: "unavailable", reason: "not_payer" });
    }
    expect(gateway.createCustomer).not.toHaveBeenCalled();
    expect(gateway.createSetupIntent).not.toHaveBeenCalled();

    // El seti_ de la pagadora no sirve a otra persona.
    const started = await startFamilyPaymentSetup(startInput(academy, payer), { gateway });
    await expect(
      completeFamilyPaymentSetup(
        { userId: notPayer.userId, organizationId: academy.organizationId, familyId: academy.familyId, setupIntentId: started.setupIntentId },
        { gateway }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    // Ni desde la familia de la otra academia con su propia sesión de pagadora.
    await expect(
      completeFamilyPaymentSetup(
        { userId: foreign.userId, organizationId: other.organizationId, familyId: other.familyId, setupIntentId: started.setupIntentId },
        { gateway }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
    expect(await authorizationRows(academy.organizationId)).toEqual([]);

    // La academia B no ve ni revoca nada de A.
    await expect(
      revokeFamilyPaymentMethodByOwner(
        { userId: other.ownerId, organizationId: academy.organizationId, authorizationId: randomUUID() },
        { gateway }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
