import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";

/**
 * Cobro automático de cuotas (Fase 3) sobre PostgreSQL desechable de GitHub.
 * Instala la candidata solo aquí, después de todos los guardas (y antes las de
 * las Fases 1 y 2 si faltan), y al terminar retira solo lo que instaló y
 * restaura el comentario de tabla que cambió la Fase 2: la base queda igual
 * que antes, cosa que el último test comprueba. Nunca en un proyecto enlazado
 * ni con credenciales externas. Cubre lo que los mocks no ven: tipos, checks
 * reales, únicos, los índices de un intento abierto y de uno cobrado por
 * factura, permisos, el preflight y la detección de almacenamiento antes y
 * después.
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
const familyCollectionCandidate = () => readCandidate("20261117120000_family_collection_candidate.sql");

const PHASE_1_MISSING =
  "Family collection candidate requires the Connect onboarding candidate (sepa_debit_payments_capability_status and requirements_state) installed first";
const PHASE_2_MISSING =
  "Family collection candidate requires the family payment methods candidate (family_payment_setup_attempts and family_payment_authorizations.payment_method_kind) installed first";
const ALREADY_INSTALLED =
  "Family collection candidate requires family_collection_attempts, family_collection_attempt_charges and organization_collection_settings absent; inspect existing schema before promotion";

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
 * Las candidatas de las Fases 2 y 3 abren su propia transacción
 * (`begin; … commit;`). Si fallan a mitad, la conexión queda en una
 * transacción abortada; por eso se ejecutan en una conexión propia que se
 * cierra al terminar y nunca vuelve al pool de `db`. Solo se llama después de
 * assertDisposableTarget().
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

/** Literal SQL de un texto leído de la propia base (comentario de tabla). */
const sqlLiteral = (value: string | null) => (value === null ? "null" : `'${value.replace(/'/g, "''")}'`);

/**
 * Huella del esquema zaltyko: columnas, restricciones, índices, comentarios de
 * tabla, RLS y permisos. Antes de instalar y después de retirar debe coincidir.
 */
async function schemaFingerprint() {
  const result = await db.execute(sql`
    select
      (select coalesce(string_agg(table_name::text || '.' || column_name::text || ':' || data_type::text || ':' || is_nullable::text || ':' || coalesce(column_default::text, ''), ',' order by table_name::text, column_name::text), '')
         from information_schema.columns where table_schema = 'zaltyko') as columns,
      (select coalesce(string_agg(conrelid::regclass::text || '.' || conname::text || ':' || pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname::text, pg_get_constraintdef(oid)), '')
         from pg_constraint where connamespace = 'zaltyko'::regnamespace) as constraints,
      (select coalesce(string_agg(indexname::text || ':' || indexdef, ',' order by indexname::text), '')
         from pg_indexes where schemaname = 'zaltyko') as indexes,
      (select coalesce(string_agg(c.relname::text || ':' || coalesce(obj_description(c.oid, 'pg_class'), '') || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text || ':' || coalesce(c.relacl::text, ''), ',' order by c.relname::text), '')
         from pg_class c where c.relnamespace = 'zaltyko'::regnamespace and c.relkind = 'r') as tables
  `);
  return result.rows[0] as { columns: string; constraints: string; indexes: string; tables: string };
}

async function authorizationsComment(): Promise<string | null> {
  const result = await db.execute(sql`
    select obj_description('zaltyko.family_payment_authorizations'::regclass, 'pg_class') as comment
  `);
  return (result.rows[0] as { comment: string | null }).comment;
}

describeDisposablePg("family collection candidate schema", () => {
  let before: Awaited<ReturnType<typeof schemaFingerprint>> | null = null;
  let connectOnboardingInstalledHere = false;
  let familyPaymentMethodsInstalledHere = false;
  let candidateInstalledHere = false;
  let removed = false;
  let savedAuthorizationsComment: string | null = null;
  let phase1Failure: PgFailure = null;
  let phase2Failure: PgFailure = null;
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];

  /**
   * Borra las filas de las academias de prueba en orden de claves foráneas.
   * Las academias en sí no se pueden borrar: su historial de plan
   * (organization_entitlement_changes) es solo de añadir, como en las demás
   * suites; quedan vacías y sin miembros.
   */
  async function deleteFixtureRows() {
    for (const organizationId of createdOrganizations) {
      for (const table of [
        "payments",
        "charges",
        "invoice_lines",
        "invoices",
        "family_payment_authorizations",
        "organization_payment_provider_accounts",
        "family_payers",
        "family_guardians",
        "guardians",
        "people",
        "families",
        "organization_members",
        "locations",
      ]) {
        await db.execute(sql`delete from ${sql.identifier("zaltyko")}.${sql.identifier(table)} where organization_id = ${organizationId}::uuid`);
      }
    }
    for (const userId of createdUsers) {
      await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
    }
  }

  /** Filas que quedan de las academias de prueba (todas deben ser cero). */
  async function remainingFixtureRows() {
    // Listas como texto: Drizzle expandiría un array en una lista de parámetros.
    const organizations = createdOrganizations.join(",");
    const users = createdUsers.join(",");
    const result = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.payments where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as payments,
        (select count(*)::int from zaltyko.charges where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as charges,
        (select count(*)::int from zaltyko.invoices where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as invoices,
        (select count(*)::int from zaltyko.family_payment_authorizations where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as authorizations,
        (select count(*)::int from zaltyko.organization_payment_provider_accounts where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as accounts,
        (select count(*)::int from zaltyko.families where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as families,
        (select count(*)::int from zaltyko.people where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as people,
        (select count(*)::int from zaltyko.organization_members where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as members,
        (select count(*)::int from zaltyko.locations where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as locations,
        (select count(*)::int from auth.users where id = any(string_to_array(${users}, ',')::uuid[])) as users
    `);
    return result.rows[0];
  }

  /** Retira solo lo que instaló este archivo, en orden inverso. */
  async function removeInstalled() {
    if (removed) return;
    removed = true;
    if (candidateInstalledHere) {
      await db.execute(sql`drop table if exists zaltyko.family_collection_attempt_charges`);
      await db.execute(sql`drop table if exists zaltyko.family_collection_attempts`);
      await db.execute(sql`drop table if exists zaltyko.organization_collection_settings`);
    }
    if (familyPaymentMethodsInstalledHere) {
      // Los checks se van con su columna; el comentario de la tabla se restaura.
      await db.execute(sql`drop table if exists zaltyko.family_payment_setup_attempts`);
      await db.execute(sql`
        alter table zaltyko.family_payment_authorizations drop column if exists payment_method_kind
      `);
      await db.execute(
        sql.raw(`comment on table zaltyko.family_payment_authorizations is ${sqlLiteral(savedAuthorizationsComment)}`)
      );
    }
    if (connectOnboardingInstalledHere) {
      await db.execute(sql`
        alter table zaltyko.organization_payment_provider_accounts
          drop column if exists sepa_debit_payments_capability_status,
          drop column if exists requirements_state
      `);
    }
    // Después del esquema: las tablas retiradas ya no apuntan a estas filas.
    await deleteFixtureRows();
  }

  beforeAll(async () => {
    assertDisposableTarget();
    // Antes de la candidata el cobro está dormido.
    expect(await isFamilyCollectionStorageAvailable()).toBe(false);
    before = await schemaFingerprint();

    // La base de CI solo tiene supabase/migrations: las Fases 1 y 2 van
    // primero. Sin cada una, la candidata se niega a instalarse.
    if (!(await isConnectOnboardingStorageAvailable())) {
      phase1Failure = await failureOf(runOnOwnConnection(familyCollectionCandidate()));
      await db.execute(sql.raw(connectOnboardingCandidate()));
      connectOnboardingInstalledHere = true;
    }
    if (!(await isFamilyPaymentMethodsStorageAvailable())) {
      phase2Failure = await failureOf(runOnOwnConnection(familyCollectionCandidate()));
      savedAuthorizationsComment = await authorizationsComment();
      await runOnOwnConnection(familyPaymentMethodsCandidate());
      familyPaymentMethodsInstalledHere = true;
    }
    await runOnOwnConnection(familyCollectionCandidate());
    candidateInstalledHere = true;
  }, 120_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    // Por si un test falló antes del último: deja la base como estaba.
    await removeInstalled();
  });

  it("se niega a instalarse sin las Fases 1 y 2, sin dejar nada a medias", () => {
    if (connectOnboardingInstalledHere) {
      expect(phase1Failure?.code).toBe("P0001");
      expect(phase1Failure?.message).toBe(PHASE_1_MISSING);
    }
    if (familyPaymentMethodsInstalledHere) {
      expect(phase2Failure?.code).toBe("P0001");
      expect(phase2Failure?.message).toBe(PHASE_2_MISSING);
    }
    expect(candidateInstalledHere).toBe(true);
  });

  async function columnsOf(table: string) {
    const result = await db.execute(sql`
      select column_name::text as name, data_type::text as type, is_nullable::text as nullable, column_default::text as default_value
        from information_schema.columns
       where table_schema = 'zaltyko'
         and table_name = ${table}
       order by ordinal_position
    `);
    return result.rows;
  }

  it("crea las tres tablas con sus columnas y tipos", async () => {
    const tz = "timestamp with time zone";
    expect(await columnsOf("family_collection_attempts")).toEqual([
      { name: "id", type: "uuid", nullable: "NO", default_value: "gen_random_uuid()" },
      { name: "organization_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "location_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "invoice_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "family_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "family_payer_id", type: "uuid", nullable: "YES", default_value: null },
      { name: "authorization_id", type: "uuid", nullable: "YES", default_value: null },
      { name: "payment_provider_account_id", type: "uuid", nullable: "YES", default_value: null },
      { name: "attempt_number", type: "integer", nullable: "NO", default_value: null },
      { name: "payment_method_kind", type: "text", nullable: "YES", default_value: null },
      { name: "amount_cents", type: "bigint", nullable: "NO", default_value: null },
      { name: "currency", type: "text", nullable: "NO", default_value: null },
      { name: "status", type: "text", nullable: "NO", default_value: null },
      { name: "provider_payment_intent_reference", type: "text", nullable: "YES", default_value: null },
      { name: "failure_code", type: "text", nullable: "YES", default_value: null },
      { name: "decline_code", type: "text", nullable: "YES", default_value: null },
      { name: "next_retry_at", type: tz, nullable: "YES", default_value: null },
      { name: "resume_count", type: "integer", nullable: "NO", default_value: "0" },
      { name: "payment_id", type: "uuid", nullable: "YES", default_value: null },
      { name: "allocation_status", type: "text", nullable: "YES", default_value: null },
      { name: "claimed_at", type: tz, nullable: "NO", default_value: "now()" },
      { name: "completed_at", type: tz, nullable: "YES", default_value: null },
      { name: "created_at", type: tz, nullable: "NO", default_value: "now()" },
      { name: "updated_at", type: tz, nullable: "NO", default_value: "now()" },
    ]);
    expect(await columnsOf("family_collection_attempt_charges")).toEqual([
      { name: "attempt_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "organization_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "charge_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "amount_cents", type: "bigint", nullable: "NO", default_value: null },
    ]);
    expect(await columnsOf("organization_collection_settings")).toEqual([
      { name: "organization_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "collection_day_of_month", type: "smallint", nullable: "YES", default_value: null },
      { name: "version", type: "integer", nullable: "NO", default_value: "1" },
      { name: "updated_by_member_id", type: "uuid", nullable: "YES", default_value: null },
      { name: "updated_at", type: tz, nullable: "NO", default_value: "now()" },
    ]);
  });

  it("solo service_role lee y escribe, con RLS ENABLE y FORCE en las tres", async () => {
    for (const table of ["family_collection_attempts", "family_collection_attempt_charges", "organization_collection_settings"]) {
      const regclass = `zaltyko.${table}`;
      const rls = await db.execute(sql`
        select relrowsecurity as enabled, relforcerowsecurity as forced
          from pg_class where oid = ${regclass}::regclass
      `);
      expect(rls.rows, table).toEqual([{ enabled: true, forced: true }]);

      const grants = await db.execute(sql`
        select coalesce(r.rolname, 'PUBLIC')::text as grantee, a.privilege_type::text as privilege
          from pg_class c
          cross join lateral aclexplode(c.relacl) a
          left join pg_roles r on r.oid = a.grantee
         where c.oid = ${regclass}::regclass
           and coalesce(r.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')
         order by 1, 2
      `);
      expect(grants.rows, table).toEqual([
        { grantee: "service_role", privilege: "INSERT" },
        { grantee: "service_role", privilege: "SELECT" },
        { grantee: "service_role", privilege: "UPDATE" },
      ]);
      const policies = await db.execute(sql`select count(*)::int as n from pg_policies where schemaname = 'zaltyko' and tablename = ${table}`);
      expect(policies.rows, table).toEqual([{ n: 0 }]);
    }
  });

  it("crea los índices únicos parciales de un intento abierto y uno cobrado por factura, y los de reanudar y reintentar", async () => {
    const result = await db.execute(sql`
      select indexname::text as name, indexdef as definition
        from pg_indexes
       where schemaname = 'zaltyko'
         and tablename in ('family_collection_attempts', 'family_collection_attempt_charges', 'organization_collection_settings')
       order by indexname
    `);
    const indexes = new Map((result.rows as Array<{ name: string; definition: string }>).map((row) => [row.name, row.definition]));
    const open = indexes.get("family_collection_attempts_open_uq") ?? "";
    expect(open).toContain("CREATE UNIQUE INDEX");
    expect(open).toContain("(organization_id, invoice_id)");
    for (const status of ["claimed", "created", "processing"]) expect(open).toContain(`'${status}'::text`);
    for (const status of ["succeeded", "failed", "canceled"]) expect(open).not.toContain(status);
    const succeeded = indexes.get("family_collection_attempts_succeeded_uq") ?? "";
    expect(succeeded).toContain("CREATE UNIQUE INDEX");
    expect(succeeded).toContain("(organization_id, invoice_id)");
    expect(succeeded).toContain("'succeeded'::text");
    for (const status of ["claimed", "created", "processing", "failed", "canceled"]) expect(succeeded).not.toContain(status);
    expect(indexes.get("family_collection_attempts_retry_idx")).toContain("(organization_id, status, next_retry_at)");
    expect(indexes.get("family_collection_attempts_resume_idx")).toContain("(status, updated_at)");
    expect(indexes.get("family_collection_attempt_charges_charge_idx")).toContain("(organization_id, charge_id)");
    expect(indexes.get("organization_collection_settings_member_idx")).toContain("(organization_id, updated_by_member_id)");
  });

  type AttemptOverride = Partial<{
    status: string;
    attemptNumber: number;
    kind: string | null;
    amount: number;
    currency: string;
    intent: string | null;
    failure: string | null;
    decline: string | null;
    nextRetry: boolean;
    resume: number;
    payment: boolean;
    allocation: string | null;
    completed: boolean;
    references: boolean;
  }>;

  /**
   * Intento con valores válidos (por defecto `claimed`) salvo lo que indique
   * `override`. Los ids son nuevos: los checks se evalúan antes que las claves
   * foráneas, así que una fila que solo incumple un check falla por ese check
   * (23514) y una fila correcta falla por la clave foránea (23503).
   */
  function insertAttempt(override: AttemptOverride = {}) {
    const withReferences = override.references ?? true;
    const kind = override.kind === undefined ? "card" : override.kind;
    return db.execute(sql`
      insert into zaltyko.family_collection_attempts (
        organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
        payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
        provider_payment_intent_reference, failure_code, decline_code, next_retry_at, resume_count,
        payment_id, allocation_status, completed_at
      ) values (
        ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
        ${withReferences ? randomUUID() : null}::uuid, ${withReferences ? randomUUID() : null}::uuid,
        ${withReferences ? randomUUID() : null}::uuid, ${override.attemptNumber ?? 1}, ${withReferences ? kind : null},
        ${override.amount ?? 4500}, ${override.currency ?? "EUR"}, ${override.status ?? "claimed"},
        ${override.intent ?? null}, ${override.failure ?? null}, ${override.decline ?? null},
        ${override.nextRetry ? new Date(Date.now() + 3 * 86_400_000).toISOString() : null}::timestamptz,
        ${override.resume ?? 0}, ${override.payment ? randomUUID() : null}::uuid, ${override.allocation ?? null},
        ${override.completed ? new Date().toISOString() : null}::timestamptz
      )
    `);
  }

  async function expectCheck(statement: Promise<unknown>, constraint: string) {
    const refused = await failureOf(statement);
    expect(refused?.code, constraint).toBe("23514");
    expect(refused?.message, constraint).toContain(constraint);
  }

  async function expectOnlyForeignKey(statement: Promise<unknown>) {
    const blocked = await failureOf(statement);
    expect(blocked?.code, blocked?.message).toBe("23503");
  }

  const SUCCEEDED = { status: "succeeded", intent: "pi_CI_ok", payment: true, allocation: "allocated", completed: true } as const;

  it("el intento rechaza número, tipo, importe, moneda, estado y reanudaciones fuera de rango", async () => {
    await expectCheck(insertAttempt({ attemptNumber: 0 }), "family_collection_attempts_attempt_number_check");
    await expectCheck(insertAttempt({ attemptNumber: 6 }), "family_collection_attempts_attempt_number_check");
    await expectCheck(insertAttempt({ kind: "otro" }), "family_collection_attempts_method_kind_check");
    await expectCheck(insertAttempt({ amount: 0 }), "family_collection_attempts_amount_check");
    await expectCheck(insertAttempt({ currency: "USD" }), "family_collection_attempts_currency_check");
    await expectCheck(insertAttempt({ status: "otro" }), "family_collection_attempts_status_check");
    await expectCheck(insertAttempt({ resume: 4 }), "family_collection_attempts_resume_count_check");
    await expectCheck(insertAttempt({ resume: -1 }), "family_collection_attempts_resume_count_check");
    await expectCheck(insertAttempt({ ...SUCCEEDED, allocation: "otro" }), "family_collection_attempts_allocation_status_check");

    // Los extremos válidos pasan los checks y los detiene la clave foránea.
    await expectOnlyForeignKey(insertAttempt({ attemptNumber: 5, resume: 3, kind: "sepa_debit" }));
  });

  it("el intento exige la referencia del cobro según el estado y con forma de pi_", async () => {
    await expectCheck(insertAttempt({ status: "created" }), "family_collection_attempts_intent_reference_by_status");
    await expectCheck(insertAttempt({ status: "processing" }), "family_collection_attempts_intent_reference_by_status");
    await expectCheck(insertAttempt({ ...SUCCEEDED, intent: null }), "family_collection_attempts_intent_reference_by_status");
    await expectCheck(insertAttempt({ intent: "pi_CI_claimed" }), "family_collection_attempts_intent_reference_by_status");
    await expectCheck(insertAttempt({ status: "created", intent: "seti_CI" }), "family_collection_attempts_intent_reference_format");
    await expectCheck(
      insertAttempt({ status: "created", intent: `pi_${"a".repeat(253)}` }),
      "family_collection_attempts_intent_reference_format"
    );

    await expectOnlyForeignKey(insertAttempt({ status: "created", intent: `pi_${"a".repeat(252)}` }));
    await expectOnlyForeignKey(insertAttempt({ status: "processing", intent: "pi_CI_processing" }));
    // Un fallo o una cancelación sin cobro en Stripe no tienen pi_.
    await expectOnlyForeignKey(insertAttempt({ status: "failed", failure: "transient_exhausted", completed: true }));
  });

  it("solo guarda códigos, solo en fallos y cancelaciones, y exige el motivo sin cobro en Stripe", async () => {
    await expectCheck(
      insertAttempt({ status: "failed", intent: "pi_CI_f1", failure: "Your card was declined.", completed: true }),
      "family_collection_attempts_failure_code_format"
    );
    await expectCheck(
      insertAttempt({ status: "failed", intent: "pi_CI_f2", failure: "a".repeat(65), completed: true }),
      "family_collection_attempts_failure_code_format"
    );
    await expectCheck(
      insertAttempt({ status: "failed", intent: "pi_CI_f3", failure: "card_declined", decline: "Insufficient", completed: true }),
      "family_collection_attempts_decline_code_format"
    );
    await expectCheck(insertAttempt({ ...SUCCEEDED, failure: "card_declined" }), "family_collection_attempts_codes_only_when_unsuccessful");
    await expectCheck(insertAttempt({ decline: "insufficient_funds" }), "family_collection_attempts_codes_only_when_unsuccessful");
    await expectCheck(insertAttempt({ status: "failed", completed: true }), "family_collection_attempts_reason_required");
    await expectCheck(
      insertAttempt({ status: "canceled", completed: true, references: false }),
      "family_collection_attempts_reason_required"
    );

    await expectOnlyForeignKey(
      insertAttempt({ status: "failed", intent: "pi_CI_f4", failure: "a".repeat(64), decline: "insufficient_funds", completed: true })
    );
    // Un fallo en Stripe puede llegar sin código.
    await expectOnlyForeignKey(insertAttempt({ status: "failed", intent: "pi_CI_f5", completed: true }));
  });

  it("enlaza pago, reparto, reintento y cierre solo en los estados que les corresponden", async () => {
    await expectCheck(insertAttempt({ nextRetry: true }), "family_collection_attempts_next_retry_only_failed");
    await expectCheck(insertAttempt({ payment: true }), "family_collection_attempts_payment_iff_succeeded");
    await expectCheck(insertAttempt({ ...SUCCEEDED, payment: false }), "family_collection_attempts_payment_iff_succeeded");
    await expectCheck(insertAttempt({ allocation: "pending" }), "family_collection_attempts_allocation_iff_succeeded");
    await expectCheck(insertAttempt({ ...SUCCEEDED, allocation: null }), "family_collection_attempts_allocation_iff_succeeded");
    await expectCheck(insertAttempt({ completed: true }), "family_collection_attempts_completed_iff_terminal");
    await expectCheck(
      insertAttempt({ status: "failed", intent: "pi_CI_open", failure: "card_declined" }),
      "family_collection_attempts_completed_iff_terminal"
    );

    await expectOnlyForeignKey(insertAttempt(SUCCEEDED));
    await expectOnlyForeignKey(insertAttempt({ ...SUCCEEDED, allocation: "needs_review" }));
    await expectOnlyForeignKey(
      insertAttempt({ status: "failed", intent: "pi_CI_retry", failure: "card_declined", decline: "insufficient_funds", nextRetry: true, completed: true })
    );
  });

  it("solo una tarjeta rechazada en los intentos 1 a 3 puede tener reintento pendiente (D1)", async () => {
    const retrying = (kind: string, attemptNumber: number) =>
      insertAttempt({
        status: "failed",
        kind,
        attemptNumber,
        intent: `pi_CI_retry_${kind}_${attemptNumber}`,
        failure: "card_declined",
        decline: "insufficient_funds",
        nextRetry: true,
        completed: true,
      });
    // La domiciliación nunca se reintenta.
    await expectCheck(retrying("sepa_debit", 1), "family_collection_attempts_next_retry_card_only");
    // El intento 4 de tarjeta es el último; el 5 tampoco.
    await expectCheck(retrying("card", 4), "family_collection_attempts_next_retry_card_only");
    await expectCheck(retrying("card", 5), "family_collection_attempts_next_retry_card_only");

    // Tarjeta en los intentos 1, 2 y 3: pasa los checks y la detiene la clave foránea.
    for (const attemptNumber of [1, 2, 3]) await expectOnlyForeignKey(retrying("card", attemptNumber));
    // Sin reintento, la domiciliación y el intento 4 fallan sin problema.
    await expectOnlyForeignKey(
      insertAttempt({ status: "failed", kind: "sepa_debit", intent: "pi_CI_sepa_final", failure: "insufficient_funds", completed: true })
    );
    await expectOnlyForeignKey(
      insertAttempt({ status: "failed", attemptNumber: 4, intent: "pi_CI_card_final", failure: "card_declined", completed: true })
    );
  });

  it("solo un intento canceled puede faltar de pagador, autorización, cuenta o tipo", async () => {
    await expectCheck(insertAttempt({ kind: null }), "family_collection_attempts_references_required");
    await expectCheck(insertAttempt({ references: false }), "family_collection_attempts_references_required");
    await expectCheck(
      insertAttempt({ status: "failed", intent: "pi_CI_refs", failure: "card_declined", completed: true, references: false }),
      "family_collection_attempts_references_required"
    );
    // La puerta cerrada en la fecha de cobro: canceled con su motivo y sin referencias.
    await expectOnlyForeignKey(insertAttempt({ status: "canceled", failure: "authorization_missing", completed: true, references: false }));
  });

  it("el reparto y el día de cobro rechazan importes y días fuera de rango", async () => {
    await expectCheck(
      db.execute(sql`
        insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
        values (${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, 0)
      `),
      "family_collection_attempt_charges_amount_check"
    );
    await expectOnlyForeignKey(
      db.execute(sql`
        insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
        values (${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, 1)
      `)
    );

    const insertSettings = (day: number | null, version = 1) =>
      db.execute(sql`
        insert into zaltyko.organization_collection_settings (organization_id, collection_day_of_month, version)
        values (${randomUUID()}::uuid, ${day}, ${version})
      `);
    await expectCheck(insertSettings(0), "organization_collection_settings_day_check");
    await expectCheck(insertSettings(32), "organization_collection_settings_day_check");
    await expectCheck(insertSettings(15, 0), "organization_collection_settings_version_check");
    for (const day of [null, 1, 29, 31]) await expectOnlyForeignKey(insertSettings(day));
  });

  /** Academia con dos sedes, familia, pagador, cuenta conectada, autorización y factura con una cuota. */
  async function createCollectableInvoice(currency = "EUR") {
    const organizationId = randomUUID();
    const locationId = randomUUID();
    const secondLocationId = randomUUID();
    const familyId = randomUUID();
    const guardianId = randomUUID();
    const payerId = randomUUID();
    const accountId = randomUUID();
    const authorizationId = randomUUID();
    const invoiceId = randomUUID();
    const lineId = randomUUID();
    const chargeId = randomUUID();
    const memberId = randomUUID();
    const userId = randomUUID();
    const short = organizationId.slice(0, 8);
    await db.execute(sql`
      insert into zaltyko.organizations (id, name, status, default_timezone, default_currency)
      values (${organizationId}::uuid, ${`CI Cobro automático ${short}`}, 'active'::zaltyko.organization_status, 'Europe/Madrid', 'EUR')
    `);
    createdOrganizations.push(organizationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (${locationId}::uuid, ${organizationId}::uuid, ${`fc-${short}`}, 'Sede CI', 'Europe/Madrid'),
             (${secondLocationId}::uuid, ${organizationId}::uuid, ${`fc2-${short}`}, 'Sede CI 2', 'Europe/Madrid')
    `);
    await db.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-family-collection-${userId}@example.invalid`})`);
    createdUsers.push(userId);
    await db.execute(sql`
      insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
      values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'owner', 'active', 'all')
    `);
    await db.execute(sql`insert into zaltyko.families (id, organization_id, is_active) values (${familyId}::uuid, ${organizationId}::uuid, true)`);
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (${guardianId}::uuid, ${organizationId}::uuid, 'Tutor', 'Cobro Prueba')
    `);
    await db.execute(sql`
      insert into zaltyko.guardians (id, organization_id, person_id, is_active)
      values (${guardianId}::uuid, ${organizationId}::uuid, ${guardianId}::uuid, true)
    `);
    await db.execute(sql`
      insert into zaltyko.family_guardians (organization_id, family_id, guardian_id, relationship)
      values (${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, 'parent')
    `);
    await db.execute(sql`
      insert into zaltyko.family_payers (id, organization_id, family_id, guardian_id, is_primary, starts_on)
      values (${payerId}::uuid, ${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, true, '2026-01-01')
    `);
    await db.execute(sql`
      insert into zaltyko.organization_payment_provider_accounts (
        id, organization_id, environment, provider_account_reference, status,
        card_payments_capability_status, sepa_debit_payments_capability_status, requirements_state
      ) values (
        ${accountId}::uuid, ${organizationId}::uuid, 'test'::zaltyko.stripe_environment, ${`acct_CI${short}`},
        'active'::zaltyko.organization_payment_account_status, 'active', 'active', 'none'
      )
    `);
    await db.execute(sql`
      insert into zaltyko.family_payment_authorizations (
        id, organization_id, family_id, family_payer_id, payment_provider_account_id, status,
        provider_setup_reference, payment_method_reference
      ) values (
        ${authorizationId}::uuid, ${organizationId}::uuid, ${familyId}::uuid, ${payerId}::uuid, ${accountId}::uuid,
        'pending'::zaltyko.payment_authorization_status, ${`seti_CI${short}`}, ${`pm_CI${short}`}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, family_payer_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values (
        ${invoiceId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${familyId}::uuid, ${payerId}::uuid,
        ${`CI-FC-${short}`}, 'issued', ${currency}, 4500, now(), now(), ${`ci-fc-inv-${invoiceId}`}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.invoice_lines (
        id, organization_id, invoice_id, location_id, line_type, quantity,
        unit_amount_cents, amount_cents, currency, service_period_start, service_period_end
      ) values (
        ${lineId}::uuid, ${organizationId}::uuid, ${invoiceId}::uuid, ${locationId}::uuid,
        'ci_collection_fee', 1, 4500, 4500, ${currency}, '2026-11-01'::date, '2026-11-28'::date
      )
    `);
    await db.execute(sql`
      insert into zaltyko.charges (
        id, organization_id, location_id, invoice_id, invoice_line_id, family_id, family_payer_id,
        status, amount_cents, currency, due_at, service_period_start, service_period_end, idempotency_key
      ) values (
        ${chargeId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${invoiceId}::uuid, ${lineId}::uuid,
        ${familyId}::uuid, ${payerId}::uuid, 'due'::zaltyko.charge_status,
        4500, ${currency}, now(), '2026-11-01'::date, '2026-11-28'::date, ${`ci-fc-charge-${chargeId}`}
      )
    `);
    return { organizationId, locationId, secondLocationId, familyId, payerId, accountId, authorizationId, invoiceId, chargeId, memberId, currency };
  }

  type Invoice = Awaited<ReturnType<typeof createCollectableInvoice>>;

  /** Intento real de la factura; devuelve su id. */
  async function claim(invoice: Invoice, attemptNumber: number, status: "claimed" | "canceled" = "claimed") {
    const canceled = status === "canceled";
    const result = await db.execute(sql`
      insert into zaltyko.family_collection_attempts (
        organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
        payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
        failure_code, completed_at
      ) values (
        ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.familyId}::uuid,
        ${invoice.payerId}::uuid, ${invoice.authorizationId}::uuid, ${invoice.accountId}::uuid, ${attemptNumber}, 'card',
        4500, 'EUR', ${status}, ${canceled ? "payer_not_current" : null}, ${canceled ? new Date().toISOString() : null}::timestamptz
      )
      returning id::text as id
    `);
    return (result.rows[0] as { id: string }).id;
  }

  async function uniqueFailure(statement: Promise<unknown>, constraint: string) {
    const refused = await failureOf(statement);
    expect(refused?.code, constraint).toBe("23505");
    expect(refused?.message, constraint).toContain(constraint);
  }

  it("un solo intento no terminal por factura, número único y pi_ único por academia", async () => {
    const invoice = await createCollectableInvoice();
    // pi_ propios de esta factura: payments_provider_uq es global.
    const tag = invoice.invoiceId.slice(0, 8);
    const firstIntent = `pi_CI${tag}first`;
    const secondIntent = `pi_CI${tag}second`;
    const first = await claim(invoice, 1);
    // Otro intento abierto de la misma factura: el índice parcial lo impide.
    await uniqueFailure(claim(invoice, 2), "family_collection_attempts_open_uq");
    // Un intento terminal no choca con el abierto, pero sí con su número.
    await uniqueFailure(claim(invoice, 1, "canceled"), "family_collection_attempts_number_uq");

    // El primero pasa a created con su pi_ y falla con reintento pendiente.
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'created', provider_payment_intent_reference = ${firstIntent}
       where id = ${first}::uuid
    `);
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'failed', failure_code = 'card_declined', decline_code = 'insufficient_funds',
             next_retry_at = now() + interval '3 days', completed_at = now()
       where id = ${first}::uuid
    `);
    // Terminado el primero, el reintento puede reclamarse.
    const second = await claim(invoice, 2);
    // El mismo pi_ no puede servir a dos intentos de la academia.
    await uniqueFailure(
      db.execute(sql`
        update zaltyko.family_collection_attempts
           set status = 'created', provider_payment_intent_reference = ${firstIntent}
         where id = ${second}::uuid
      `),
      "family_collection_attempts_intent_uq"
    );
    // Más de cinco intentos por factura no caben.
    await expectCheck(claim(invoice, 6, "canceled"), "family_collection_attempts_attempt_number_check");

    // Reparto: una fila por cuota e intento.
    const insertCharge = () =>
      db.execute(sql`
        insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
        values (${second}::uuid, ${invoice.organizationId}::uuid, ${invoice.chargeId}::uuid, 4500)
      `);
    await insertCharge();
    await uniqueFailure(insertCharge(), "family_collection_attempt_charges_pkey");
    // Una cuota de otra academia no se puede repartir.
    const other = await createCollectableInvoice();
    await expectOnlyForeignKey(
      db.execute(sql`
        insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
        values (${second}::uuid, ${invoice.organizationId}::uuid, ${other.chargeId}::uuid, 4500)
      `)
    );

    // Cobrado: exige el pago registrado (mismo pi_, misma moneda y academia).
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'created', provider_payment_intent_reference = ${secondIntent}
       where id = ${second}::uuid
    `);
    await expectCheck(
      db.execute(sql`
        update zaltyko.family_collection_attempts
           set status = 'succeeded', allocation_status = 'allocated', completed_at = now()
         where id = ${second}::uuid
      `),
      "family_collection_attempts_payment_iff_succeeded"
    );
    const paymentId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.payments (
        id, organization_id, location_id, family_id, family_payer_id, status, amount_cents, currency,
        processor, environment, provider_payment_id, received_at, idempotency_key
      ) values (
        ${paymentId}::uuid, ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.familyId}::uuid,
        ${invoice.payerId}::uuid, 'succeeded', 4500, 'EUR', 'stripe', 'sandbox', ${secondIntent}, now(),
        ${`ci-fc-pay-${paymentId}`}
      )
    `);
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'succeeded', payment_id = ${paymentId}::uuid, allocation_status = 'allocated', completed_at = now()
       where id = ${second}::uuid
    `);
    const rows = await db.execute(sql`
      select attempt_number as "number", status, provider_payment_intent_reference as "intent",
             next_retry_at is not null as "retry", payment_id::text as "paymentId", allocation_status as "allocation"
        from zaltyko.family_collection_attempts
       where invoice_id = ${invoice.invoiceId}::uuid
       order by attempt_number
    `);
    expect(rows.rows).toEqual([
      { number: 1, status: "failed", intent: firstIntent, retry: true, paymentId: null, allocation: null },
      { number: 2, status: "succeeded", intent: secondIntent, retry: false, paymentId, allocation: "allocated" },
    ]);
    // Ya cobrada, la factura no admite otro intento succeeded, ni con un pago
    // propio: nunca dos cobros registrados de la misma factura.
    const thirdIntent = `pi_CI${tag}third`;
    const third = await claim(invoice, 3);
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'created', provider_payment_intent_reference = ${thirdIntent}
       where id = ${third}::uuid
    `);
    const thirdPaymentId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.payments (
        id, organization_id, location_id, family_id, family_payer_id, status, amount_cents, currency,
        processor, environment, provider_payment_id, received_at, idempotency_key
      ) values (
        ${thirdPaymentId}::uuid, ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.familyId}::uuid,
        ${invoice.payerId}::uuid, 'succeeded', 4500, 'EUR', 'stripe', 'sandbox', ${thirdIntent}, now(),
        ${`ci-fc-pay-${thirdPaymentId}`}
      )
    `);
    await uniqueFailure(
      db.execute(sql`
        update zaltyko.family_collection_attempts
           set status = 'succeeded', payment_id = ${thirdPaymentId}::uuid, allocation_status = 'needs_review', completed_at = now()
         where id = ${third}::uuid
      `),
      "family_collection_attempts_succeeded_uq"
    );

    // El mismo pago tampoco puede cerrar el intento de otra factura de la
    // academia (otra factura: el índice de un solo cobrado no interviene).
    const otherInvoiceId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, family_payer_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values (
        ${otherInvoiceId}::uuid, ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.familyId}::uuid,
        ${invoice.payerId}::uuid, ${`CI-FC-${tag}-other`}, 'issued', 'EUR', 4500, now(), now(), ${`ci-fc-inv-${otherInvoiceId}`}
      )
    `);
    const otherAttempt = await claim({ ...invoice, invoiceId: otherInvoiceId }, 1);
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'created', provider_payment_intent_reference = ${`pi_CI${tag}other`}
       where id = ${otherAttempt}::uuid
    `);
    await uniqueFailure(
      db.execute(sql`
        update zaltyko.family_collection_attempts
           set status = 'succeeded', payment_id = ${paymentId}::uuid, allocation_status = 'needs_review', completed_at = now()
         where id = ${otherAttempt}::uuid
      `),
      "family_collection_attempts_payment_uq"
    );

    // El intento debe ser de la sede de su factura: otra sede de la misma
    // academia existe, así que solo puede fallar la clave (academia, sede, factura).
    const wrongLocation = await failureOf(
      db.execute(sql`
        insert into zaltyko.family_collection_attempts (
          organization_id, location_id, invoice_id, family_id, attempt_number, amount_cents, currency, status,
          failure_code, completed_at
        ) values (
          ${invoice.organizationId}::uuid, ${invoice.secondLocationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.familyId}::uuid,
          4, 4500, 'EUR', 'canceled', 'payer_missing', now()
        )
      `)
    );
    expect(wrongLocation?.code).toBe("23503");
    expect(wrongLocation?.message).toContain("family_collection_attempts_invoice_fk");
    // Y de su moneda: un canceled en otra moneda que la de la factura no cabe.
    const wrongCurrency = await failureOf(
      db.execute(sql`
        insert into zaltyko.family_collection_attempts (
          organization_id, location_id, invoice_id, family_id, attempt_number, amount_cents, currency, status,
          failure_code, completed_at
        ) values (
          ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.familyId}::uuid,
          4, 4500, 'MXN', 'canceled', 'currency_not_supported', now()
        )
      `)
    );
    expect(wrongCurrency?.code).toBe("23503");
    expect(wrongCurrency?.message).toContain("family_collection_attempts_invoice_currency_fk");
  });

  it("la puerta puede cancelar una factura que no es en EUR, pero nada más se intenta en otra moneda", async () => {
    const invoice = await createCollectableInvoice("MXN");
    const insertMxn = (status: "canceled" | "claimed", intent: string | null) =>
      db.execute(sql`
        insert into zaltyko.family_collection_attempts (
          organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
          payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
          provider_payment_intent_reference, failure_code, completed_at
        ) values (
          ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.familyId}::uuid,
          ${invoice.payerId}::uuid, ${invoice.authorizationId}::uuid, ${invoice.accountId}::uuid, 1, 'card',
          4500, 'MXN', ${status}, ${intent},
          ${status === "canceled" ? "currency_not_supported" : null},
          ${status === "canceled" ? new Date().toISOString() : null}::timestamptz
        )
      `);
    // Un intento abierto en otra moneda se rechaza, y también un canceled que llegó a Stripe.
    await expectCheck(insertMxn("claimed", null), "family_collection_attempts_currency_check");
    await expectCheck(insertMxn("canceled", `pi_CI${invoice.invoiceId.slice(0, 8)}mxn`), "family_collection_attempts_currency_check");
    // El canceled de la puerta, sin cobro en Stripe, se guarda con la moneda de la factura.
    await insertMxn("canceled", null);
    const rows = await db.execute(sql`
      select status, currency, failure_code as "failure"
        from zaltyko.family_collection_attempts
       where invoice_id = ${invoice.invoiceId}::uuid
    `);
    expect(rows.rows).toEqual([{ status: "canceled", currency: "MXN", failure: "currency_not_supported" }]);
    // Sin pagador ni autorización, por ids nuevos: los checks lo admiten y lo para la clave foránea.
    await expectOnlyForeignKey(
      insertAttempt({ status: "canceled", currency: "USD", failure: "currency_not_supported", completed: true, references: false })
    );
  });

  it("guarda un solo día de cobro por academia, con quién lo cambió", async () => {
    const invoice = await createCollectableInvoice();
    await db.execute(sql`
      insert into zaltyko.organization_collection_settings (organization_id, collection_day_of_month, updated_by_member_id)
      values (${invoice.organizationId}::uuid, 31, ${invoice.memberId}::uuid)
    `);
    await uniqueFailure(
      db.execute(sql`
        insert into zaltyko.organization_collection_settings (organization_id, collection_day_of_month)
        values (${invoice.organizationId}::uuid, null)
      `),
      "organization_collection_settings_pkey"
    );
    const settings = await db.execute(sql`
      select collection_day_of_month as "day", version, updated_by_member_id::text as "memberId"
        from zaltyko.organization_collection_settings where organization_id = ${invoice.organizationId}::uuid
    `);
    expect(settings.rows).toEqual([{ day: 31, version: 1, memberId: invoice.memberId }]);
  });

  it("detecta el almacenamiento instalado y rechaza reinstalar la candidata", async () => {
    expect(await isFamilyCollectionStorageAvailable()).toBe(true);
    expect(await isFamilyCollectionStorageAvailable(db)).toBe(true);

    const raised = await failureOf(runOnOwnConnection(familyCollectionCandidate()));
    expect(raised?.code).toBe("P0001");
    expect(raised?.message).toBe(ALREADY_INSTALLED);
    // El intento abortado no dejó nada a medias.
    expect(await isFamilyCollectionStorageAvailable()).toBe(true);
  });

  it("al retirar lo instalado la base queda como estaba, en esquema y en filas", async () => {
    expect(createdOrganizations.length).toBeGreaterThan(0);
    await removeInstalled();
    expect(await isFamilyCollectionStorageAvailable()).toBe(false);
    expect(await schemaFingerprint()).toEqual(before);
    // Y sin las filas de prueba (salvo las academias, cuyo historial de plan no se borra).
    expect(await remainingFixtureRows()).toEqual({
      payments: 0, charges: 0, invoices: 0, authorizations: 0, accounts: 0,
      families: 0, people: 0, members: 0, locations: 0, users: 0,
    });
    if (familyPaymentMethodsInstalledHere) expect(await authorizationsComment()).toBe(savedAuthorizationsComment);
  });
});
