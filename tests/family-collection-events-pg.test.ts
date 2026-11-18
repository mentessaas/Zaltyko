import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { handleFamilyCollectionEvent } from "@/modules/family-collection/application/family-collection-events";
import {
  familyCollectionStorageShape,
  isFamilyCollectionEventsStorageAvailable,
  isFamilyCollectionStorageAvailable,
  type FamilyCollectionStorageShape,
} from "@/modules/family-collection/application/storage";
import {
  providerEventPayload,
  type ConnectedAccountEvent,
} from "@/modules/family-collection/domain/provider-event";
import {
  claimProviderEvent,
  finishProviderEvent,
  providerEventPayloadSha256,
} from "@/modules/family-collection/infrastructure/provider-event-inbox";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";

/**
 * Cobro automático de cuotas, Fase 4 (requires_action y disputas), sobre el
 * PostgreSQL desechable de GitHub. Instala la candidata solo aquí, después de
 * todos los guardas (y antes las de las Fases 1, 2 y 3 si faltan). Al terminar
 * ejecuta la vuelta atrás comentada de la propia candidata y comprueba que la
 * Fase 3 queda exactamente como estaba; después retira solo lo que instaló
 * (y restaura el comentario de tabla que cambió la Fase 2): la base queda
 * igual que antes, también comprobado. Nunca en un proyecto enlazado ni con
 * credenciales externas. Sin reloj: todas las fechas son fijas.
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
const eventsCandidate = () => readCandidate("20261118120000_family_collection_events_candidate.sql");

const PHASE_3_MISSING =
  "Family collection events candidate requires the family collection candidate (20261117120000) installed first, with its exact shape";
const ALREADY_INSTALLED =
  "Family collection events candidate requires family_collection_disputes, family_collection_attempts.action_deadline_at and family_collection_attempts_action_deadline_check absent; inspect existing schema before promotion";

/** Fechas fijas: nada de esta suite depende del reloj. */
const CLAIMED_AT = "2026-11-02T08:00:00.000Z";
const DEADLINE = "2026-11-05T22:59:59.000Z";
const RECEIVED_AT = "2026-11-02T08:05:00.000Z";
const OPENED_AT = "2026-11-20T10:00:00.000Z";
const CLOSED_AT = "2026-12-20T10:00:00.000Z";

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
 * Las candidatas abren su propia transacción (`begin; … commit;`). Si fallan a
 * mitad, la conexión queda en una transacción abortada; por eso se ejecutan en
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

/** Literal SQL de un texto leído de la propia base (comentario de tabla). */
const sqlLiteral = (value: string | null) => (value === null ? "null" : `'${value.replace(/'/g, "''")}'`);

/**
 * Bloque de vuelta atrás de la candidata: comentado entre `-- >>> vuelta
 * atrás` y `-- <<< vuelta atrás`, una línea de SQL por línea de comentario.
 * Devuelve el SQL sin los `-- `, tal como lo ejecutaría quien lo autorice.
 */
function rollbackBlock(text: string): string {
  const match = /^-- >>> vuelta atrás\n([\s\S]*?)^-- <<< vuelta atrás$/m.exec(text);
  if (!match) throw new Error("La candidata no tiene bloque de vuelta atrás");
  return match[1]!
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      if (!line.startsWith("-- ")) throw new Error(`Línea de vuelta atrás sin comentar: ${line}`);
      return line.slice(3);
    })
    .join("\n");
}

/**
 * Huella del esquema zaltyko: columnas, restricciones, índices, comentarios de
 * tabla, RLS y permisos. Antes de instalar y después de deshacer debe coincidir.
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

async function tableExists(table: string): Promise<boolean> {
  const result = await db.execute(sql`select to_regclass(${`zaltyko.${table}`}) is not null as "present"`);
  return (result.rows[0] as { present?: unknown } | undefined)?.present === true;
}

describeDisposablePg("family collection events candidate schema (Fase 4)", () => {
  let original: Awaited<ReturnType<typeof schemaFingerprint>> | null = null;
  let beforeEvents: Awaited<ReturnType<typeof schemaFingerprint>> | null = null;
  let connectOnboardingInstalledHere = false;
  let familyPaymentMethodsInstalledHere = false;
  let familyCollectionInstalledHere = false;
  let eventsInstalledHere = false;
  let rolledBack = false;
  let removed = false;
  let savedAuthorizationsComment: string | null = null;
  let phase3Failure: PgFailure = null;
  const shapes: Partial<Record<"initial" | "phase3" | "phase4", FamilyCollectionStorageShape>> = {};
  const gatesWithPhase3 = { collection: false, events: true };
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];

  /**
   * Borra las filas de las academias de prueba en orden de claves foráneas,
   * solo de las tablas que existen en ese momento. Las academias en sí no se
   * pueden borrar: su historial de plan (organization_entitlement_changes) es
   * solo de añadir, como en las demás suites; quedan vacías y sin miembros.
   */
  async function deleteFixtureRows() {
    if (createdOrganizations.length === 0 && createdUsers.length === 0) return;
    // Lista como texto: Drizzle expandiría un array en una lista de parámetros.
    const organizations = createdOrganizations.join(",");
    for (const table of [
      "family_collection_disputes",
      "family_collection_attempt_charges",
      "family_collection_attempts",
      "payment_provider_events",
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
      if (!(await tableExists(table))) continue;
      await db.execute(sql`
        delete from ${sql.identifier("zaltyko")}.${sql.identifier(table)}
         where organization_id = any(string_to_array(${organizations}, ',')::uuid[])
      `);
    }
    for (const userId of createdUsers) {
      await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
    }
  }

  /** Filas que quedan de las academias de prueba (todas deben ser cero). */
  async function remainingFixtureRows() {
    const organizations = createdOrganizations.join(",");
    const users = createdUsers.join(",");
    const result = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.payment_provider_events where organization_id = any(string_to_array(${organizations}, ',')::uuid[])) as events,
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

  /** Deshace la Fase 4 con el bloque comentado de la propia candidata. */
  async function rollBackEvents() {
    if (!eventsInstalledHere || rolledBack) return;
    rolledBack = true;
    // Ningún intento puede seguir en requires_action: las filas de prueba se van antes.
    await deleteFixtureRows();
    await runOnOwnConnection(rollbackBlock(eventsCandidate()));
  }

  /** Retira lo que instaló este archivo de las Fases 1 a 3, en orden inverso. */
  async function removeInstalled() {
    if (removed) return;
    removed = true;
    await rollBackEvents();
    // Después de deshacer la Fase 4: las tablas que quedan ya no tienen filas de prueba.
    await deleteFixtureRows();
    if (familyCollectionInstalledHere) {
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
  }

  beforeAll(async () => {
    assertDisposableTarget();
    original = await schemaFingerprint();
    shapes.initial = await familyCollectionStorageShape();

    // La base de CI solo tiene supabase/migrations: las Fases 1, 2 y 3 van
    // primero. Sin la Fase 3, la candidata de la Fase 4 se niega a instalarse.
    if (!(await isConnectOnboardingStorageAvailable())) {
      await db.execute(sql.raw(connectOnboardingCandidate()));
      connectOnboardingInstalledHere = true;
    }
    if (!(await isFamilyPaymentMethodsStorageAvailable())) {
      savedAuthorizationsComment = await authorizationsComment();
      await runOnOwnConnection(familyPaymentMethodsCandidate());
      familyPaymentMethodsInstalledHere = true;
    }
    if (!(await isFamilyCollectionStorageAvailable())) {
      phase3Failure = await failureOf(runOnOwnConnection(eventsCandidate()));
      await runOnOwnConnection(familyCollectionCandidate());
      familyCollectionInstalledHere = true;
    }
    shapes.phase3 = await familyCollectionStorageShape();
    gatesWithPhase3.collection = await isFamilyCollectionStorageAvailable();
    gatesWithPhase3.events = await isFamilyCollectionEventsStorageAvailable();
    beforeEvents = await schemaFingerprint();

    await runOnOwnConnection(eventsCandidate());
    eventsInstalledHere = true;
    shapes.phase4 = await familyCollectionStorageShape();
  }, 120_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    // Por si un test falló antes del último: deja la base como estaba.
    await removeInstalled();
  });

  it("se niega a instalarse sin la Fase 3 y a reinstalarse, sin dejar nada a medias", async () => {
    if (familyCollectionInstalledHere) {
      expect(phase3Failure?.code).toBe("P0001");
      expect(phase3Failure?.message).toBe(PHASE_3_MISSING);
    }
    expect(eventsInstalledHere).toBe(true);
    const again = await failureOf(runOnOwnConnection(eventsCandidate()));
    expect(again?.code).toBe("P0001");
    expect(again?.message).toBe(ALREADY_INSTALLED);
    // El intento abortado no dejó nada a medias.
    expect(await familyCollectionStorageShape()).toBe("phase4");
  });

  it("almacenamiento: none / phase3 / phase4 según el catálogo", async () => {
    // Sin la Fase 3 instalada antes de esta suite, la forma de partida es "none".
    if (familyCollectionInstalledHere) expect(shapes.initial).toBe("none");
    // Con la Fase 3 tal cual: el cobro diario sigue disponible y lo de la Fase 4 no.
    expect(shapes.phase3).toBe("phase3");
    expect(gatesWithPhase3).toEqual({ collection: true, events: false });
    // Con la Fase 4 encima: las dos puertas abiertas.
    expect(shapes.phase4).toBe("phase4");
    expect(await familyCollectionStorageShape(db)).toBe("phase4");
    expect(await isFamilyCollectionStorageAvailable()).toBe(true);
    expect(await isFamilyCollectionEventsStorageAvailable(db)).toBe(true);
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

  it("añade action_deadline_at, el estado requires_action y el índice de un intento abierto con requires_action", async () => {
    const tz = "timestamp with time zone";
    const attempts = await columnsOf("family_collection_attempts");
    expect(attempts).toHaveLength(25);
    expect(attempts[attempts.length - 1]).toEqual({ name: "action_deadline_at", type: tz, nullable: "YES", default_value: null });

    const index = await db.execute(sql`
      select indexdef as definition
        from pg_indexes
       where schemaname = 'zaltyko' and indexname = 'family_collection_attempts_open_uq'
    `);
    const open = (index.rows[0] as { definition?: string } | undefined)?.definition ?? "";
    expect(open).toContain("CREATE UNIQUE INDEX");
    expect(open).toContain("(organization_id, invoice_id)");
    for (const status of ["claimed", "created", "processing", "requires_action"]) expect(open).toContain(`'${status}'::text`);
    for (const status of ["succeeded", "failed", "canceled"]) expect(open).not.toContain(status);

    const constraints = await db.execute(sql`
      select conname::text as name, pg_get_constraintdef(oid) as definition
        from pg_constraint
       where conrelid = 'zaltyko.family_collection_attempts'::regclass
         and conname in (
           'family_collection_attempts_status_check',
           'family_collection_attempts_intent_reference_by_status',
           'family_collection_attempts_action_deadline_check'
         )
       order by conname
    `);
    const definitions = new Map((constraints.rows as Array<{ name: string; definition: string }>).map((row) => [row.name, row.definition]));
    expect([...definitions.keys()]).toEqual([
      "family_collection_attempts_action_deadline_check",
      "family_collection_attempts_intent_reference_by_status",
      "family_collection_attempts_status_check",
    ]);
    for (const [name, definition] of definitions) expect(definition, name).toContain("requires_action");
  });

  type AttemptOverride = Partial<{
    status: string;
    kind: string | null;
    intent: string | null;
    deadline: string | null;
    failure: string | null;
    payment: boolean;
    allocation: string | null;
    completed: boolean;
  }>;

  /**
   * Intento con valores válidos (por defecto `requires_action` de tarjeta, con
   * pi_ y plazo) salvo lo que indique `override`. Los ids son nuevos: los
   * checks se evalúan antes que las claves foráneas, así que una fila que solo
   * incumple un check falla por ese check (23514) y una fila correcta falla
   * por la clave foránea (23503).
   */
  function insertAttempt(override: AttemptOverride = {}) {
    const kind = override.kind === undefined ? "card" : override.kind;
    const intent = override.intent === undefined ? `pi_CI${randomUUID().replace(/-/g, "")}` : override.intent;
    const deadline = override.deadline === undefined ? DEADLINE : override.deadline;
    return db.execute(sql`
      insert into zaltyko.family_collection_attempts (
        organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
        payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
        provider_payment_intent_reference, failure_code, payment_id, allocation_status, claimed_at,
        completed_at, action_deadline_at
      ) values (
        ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
        ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, 1, ${kind},
        4500, 'EUR', ${override.status ?? "requires_action"}, ${intent}, ${override.failure ?? null},
        ${override.payment ? randomUUID() : null}::uuid, ${override.allocation ?? null}, ${CLAIMED_AT}::timestamptz,
        ${override.completed ? CLOSED_AT : null}::timestamptz, ${deadline}::timestamptz
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

  async function uniqueFailure(statement: Promise<unknown>, constraint: string) {
    const refused = await failureOf(statement);
    expect(refused?.code, constraint).toBe("23505");
    expect(refused?.message, constraint).toContain(constraint);
  }

  it("admite requires_action solo con pi_, plazo y tarjeta", async () => {
    // Sin plazo, o con domiciliación, no cabe.
    await expectCheck(insertAttempt({ deadline: null }), "family_collection_attempts_action_deadline_check");
    await expectCheck(insertAttempt({ kind: "sepa_debit" }), "family_collection_attempts_action_deadline_check");
    // Sin pi_ tampoco: el banco pide confirmar un cobro que ya existe en Stripe.
    await expectCheck(insertAttempt({ intent: null }), "family_collection_attempts_intent_reference_by_status");
    // Es un estado abierto: sin fecha de cierre.
    await expectCheck(insertAttempt({ completed: true }), "family_collection_attempts_completed_iff_terminal");

    // Con pi_, tarjeta y plazo pasa los checks y lo detiene la clave foránea.
    await expectOnlyForeignKey(insertAttempt());
    // Un intento que ya salió de requires_action puede conservar su plazo.
    await expectOnlyForeignKey(insertAttempt({ status: "succeeded", payment: true, allocation: "allocated", completed: true }));
    // Los estados de la Fase 3 siguen igual, con o sin plazo.
    await expectOnlyForeignKey(insertAttempt({ status: "claimed", intent: null, deadline: null }));
    await expectOnlyForeignKey(insertAttempt({ status: "processing", kind: "sepa_debit", deadline: null }));
    await expectCheck(insertAttempt({ status: "otro" }), "family_collection_attempts_status_check");
  });

  /** Academia con sede, familia, pagador, cuenta conectada, autorización y factura con una cuota. */
  async function createCollectableInvoice() {
    const organizationId = randomUUID();
    const locationId = randomUUID();
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
      values (${organizationId}::uuid, ${`CI Disputas ${short}`}, 'active'::zaltyko.organization_status, 'Europe/Madrid', 'EUR')
    `);
    createdOrganizations.push(organizationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (${locationId}::uuid, ${organizationId}::uuid, ${`fce-${short}`}, 'Sede CI', 'Europe/Madrid')
    `);
    await db.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-family-collection-events-${userId}@example.invalid`})`);
    createdUsers.push(userId);
    await db.execute(sql`
      insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
      values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'owner', 'active', 'all')
    `);
    await db.execute(sql`insert into zaltyko.families (id, organization_id, is_active) values (${familyId}::uuid, ${organizationId}::uuid, true)`);
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (${guardianId}::uuid, ${organizationId}::uuid, 'Tutor', 'Disputa Prueba')
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
        ${`CI-FCE-${short}`}, 'issued', 'EUR', 4500, ${CLAIMED_AT}::timestamptz, ${CLAIMED_AT}::timestamptz,
        ${`ci-fce-inv-${invoiceId}`}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.invoice_lines (
        id, organization_id, invoice_id, location_id, line_type, quantity,
        unit_amount_cents, amount_cents, currency, service_period_start, service_period_end
      ) values (
        ${lineId}::uuid, ${organizationId}::uuid, ${invoiceId}::uuid, ${locationId}::uuid,
        'ci_collection_fee', 1, 4500, 4500, 'EUR', '2026-11-01'::date, '2026-11-28'::date
      )
    `);
    await db.execute(sql`
      insert into zaltyko.charges (
        id, organization_id, location_id, invoice_id, invoice_line_id, family_id, family_payer_id,
        status, amount_cents, currency, due_at, service_period_start, service_period_end, idempotency_key
      ) values (
        ${chargeId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${invoiceId}::uuid, ${lineId}::uuid,
        ${familyId}::uuid, ${payerId}::uuid, 'due'::zaltyko.charge_status,
        4500, 'EUR', ${CLAIMED_AT}::timestamptz, '2026-11-01'::date, '2026-11-28'::date, ${`ci-fce-charge-${chargeId}`}
      )
    `);
    return { organizationId, locationId, familyId, payerId, accountId, authorizationId, invoiceId, chargeId };
  }

  type Invoice = Awaited<ReturnType<typeof createCollectableInvoice>>;

  /** Intento real `claimed` de la factura; devuelve su id. */
  async function claim(invoice: Invoice, attemptNumber: number) {
    const result = await db.execute(sql`
      insert into zaltyko.family_collection_attempts (
        organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
        payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status, claimed_at
      ) values (
        ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.familyId}::uuid,
        ${invoice.payerId}::uuid, ${invoice.authorizationId}::uuid, ${invoice.accountId}::uuid, ${attemptNumber}, 'card',
        4500, 'EUR', 'claimed', ${CLAIMED_AT}::timestamptz
      )
      returning id::text as id
    `);
    return (result.rows[0] as { id: string }).id;
  }

  it("un solo intento abierto por factura, contando requires_action", async () => {
    const invoice = await createCollectableInvoice();
    const tag = invoice.invoiceId.slice(0, 8);
    const first = await claim(invoice, 1);
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'created', provider_payment_intent_reference = ${`pi_CI${tag}first`}
       where id = ${first}::uuid
    `);
    // El banco pide confirmar: sin plazo no puede pasar a requires_action.
    await expectCheck(
      db.execute(sql`update zaltyko.family_collection_attempts set status = 'requires_action' where id = ${first}::uuid`),
      "family_collection_attempts_action_deadline_check"
    );
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'requires_action', action_deadline_at = ${DEADLINE}::timestamptz
       where id = ${first}::uuid
    `);
    // Mientras espera al banco, la factura no admite otro intento abierto.
    await uniqueFailure(claim(invoice, 2), "family_collection_attempts_open_uq");

    // Vencido el plazo, el intento se cierra y el siguiente ya se puede reclamar.
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'failed', failure_code = 'authentication_required', completed_at = ${CLOSED_AT}::timestamptz
       where id = ${first}::uuid
    `);
    const second = await claim(invoice, 2);
    const rows = await db.execute(sql`
      select attempt_number as "number", status, action_deadline_at is not null as "deadline"
        from zaltyko.family_collection_attempts
       where invoice_id = ${invoice.invoiceId}::uuid
       order by attempt_number
    `);
    expect(rows.rows).toEqual([
      { number: 1, status: "failed", deadline: true },
      { number: 2, status: "claimed", deadline: false },
    ]);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
  });

  /** Intento cobrado con su pago registrado en el libro. */
  async function succeededAttempt(invoice: Invoice) {
    const tag = invoice.invoiceId.slice(0, 8);
    const intent = `pi_CI${tag}paid`;
    const attemptId = await claim(invoice, 1);
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'created', provider_payment_intent_reference = ${intent}
       where id = ${attemptId}::uuid
    `);
    const paymentId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.payments (
        id, organization_id, location_id, family_id, family_payer_id, status, amount_cents, currency,
        processor, environment, provider_payment_id, received_at, idempotency_key
      ) values (
        ${paymentId}::uuid, ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.familyId}::uuid,
        ${invoice.payerId}::uuid, 'succeeded', 4500, 'EUR', 'stripe', 'sandbox', ${intent}, ${RECEIVED_AT}::timestamptz,
        ${`ci-fce-pay-${paymentId}`}
      )
    `);
    await db.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'succeeded', payment_id = ${paymentId}::uuid, allocation_status = 'allocated',
             completed_at = ${RECEIVED_AT}::timestamptz
       where id = ${attemptId}::uuid
    `);
    return { attemptId, paymentId };
  }

  /** Evento de Stripe guardado en el buzón canónico de la academia; devuelve su id. */
  async function providerEvent(invoice: Invoice) {
    const result = await db.execute(sql`
      insert into zaltyko.payment_provider_events (
        organization_id, processor, environment, provider_event_id, event_type, payload_sha256, payload,
        signature_verified, status, received_at
      ) values (
        ${invoice.organizationId}::uuid, 'stripe', 'sandbox', ${`evt_CI${invoice.invoiceId.replace(/-/g, "")}`},
        'charge.dispute.created', ${"a".repeat(64)}, '{"object":"event"}'::jsonb, true, 'processed',
        ${OPENED_AT}::timestamptz
      )
      returning id::text as id
    `);
    return (result.rows[0] as { id: string }).id;
  }

  type DisputeOverride = Partial<{
    organizationId: string;
    attemptId: string;
    paymentId: string;
    reference: string;
    charge: string;
    amount: number;
    currency: string;
    status: string;
    reason: string | null;
    closed: boolean;
    eventId: string | null;
  }>;

  it("disputa: dp_ único por academia y closed_at solo en estados cerrados", async () => {
    const invoice = await createCollectableInvoice();
    const { attemptId, paymentId } = await succeededAttempt(invoice);
    const eventId = await providerEvent(invoice);
    const tag = invoice.invoiceId.replace(/-/g, "").slice(0, 12);
    const insertDispute = (override: DisputeOverride = {}) =>
      db.execute(sql`
        insert into zaltyko.family_collection_disputes (
          organization_id, attempt_id, payment_id, provider_dispute_reference, provider_charge_reference,
          amount_cents, currency, status, reason_code, evidence_due_at, opened_at, closed_at, last_provider_event_id
        ) values (
          ${override.organizationId ?? invoice.organizationId}::uuid, ${override.attemptId ?? attemptId}::uuid,
          ${override.paymentId ?? paymentId}::uuid, ${override.reference ?? `dp_CI${tag}`}, ${override.charge ?? `ch_CI${tag}`},
          ${override.amount ?? 4500}, ${override.currency ?? "EUR"}, ${override.status ?? "needs_response"},
          ${override.reason === undefined ? "fraudulent" : override.reason}, ${CLOSED_AT}::timestamptz, ${OPENED_AT}::timestamptz,
          ${override.closed ? CLOSED_AT : null}::timestamptz,
          ${override.eventId === undefined ? eventId : override.eventId}::uuid
        )
        returning id::text as id
      `);

    // Formatos y valores: cada fila incumple un solo check.
    await expectCheck(insertDispute({ reference: `ch_CI${tag}x` }), "family_collection_disputes_reference_format");
    await expectCheck(insertDispute({ reference: `dp_${"a".repeat(253)}` }), "family_collection_disputes_reference_format");
    await expectCheck(insertDispute({ reference: `dp_CI${tag}y`, charge: `pi_CI${tag}` }), "family_collection_disputes_charge_reference_format");
    await expectCheck(insertDispute({ reference: `dp_CI${tag}z`, amount: 0 }), "family_collection_disputes_amount_check");
    await expectCheck(insertDispute({ reference: `dp_CI${tag}w`, currency: "USD" }), "family_collection_disputes_currency_check");
    await expectCheck(insertDispute({ reference: `dp_CI${tag}v`, status: "charge_refunded" }), "family_collection_disputes_status_check");
    await expectCheck(insertDispute({ reference: `dp_CI${tag}u`, reason: "Fraudulent card" }), "family_collection_disputes_reason_code_format");
    // closed_at existe exactamente en los estados cerrados.
    for (const status of ["won", "lost", "warning_closed", "prevented"]) {
      await expectCheck(insertDispute({ reference: `dp_CI${tag}open${status}`, status }), "family_collection_disputes_closed_iff_final");
    }
    for (const status of ["warning_needs_response", "warning_under_review", "needs_response", "under_review"]) {
      await expectCheck(
        insertDispute({ reference: `dp_CI${tag}closed${status}`, status, closed: true }),
        "family_collection_disputes_closed_iff_final"
      );
    }

    // Una disputa abierta de tarjeta y otra ya ganada (du_, cargo py_, sin motivo).
    const opened = await insertDispute();
    const disputeId = (opened.rows[0] as { id: string }).id;
    await insertDispute({ reference: `du_CI${tag}`, charge: `py_CI${tag}`, status: "won", closed: true, reason: null, eventId: null });
    // La misma dp_ no cabe dos veces en la academia.
    await uniqueFailure(insertDispute({ status: "lost", closed: true }), "family_collection_disputes_reference_uq");
    // En otra academia, la misma dp_ es otra fila.
    const other = await createCollectableInvoice();
    const otherPaid = await succeededAttempt(other);
    await insertDispute({ organizationId: other.organizationId, attemptId: otherPaid.attemptId, paymentId: otherPaid.paymentId, eventId: null });
    // Pero nunca con el intento o el pago de otra academia.
    const crossAttempt = await failureOf(insertDispute({ organizationId: other.organizationId, reference: `dp_CI${tag}cross`, paymentId: otherPaid.paymentId, eventId: null }));
    expect(crossAttempt?.code).toBe("23503");
    expect(crossAttempt?.message).toContain("family_collection_disputes_attempt_fk");

    const stored = await db.execute(sql`
      select status, funds_withdrawn as "fundsWithdrawn", reversed_at as "reversedAt", closed_at as "closedAt",
             last_provider_event_id::text as "eventId", organization_id::text as "organizationId"
        from zaltyko.family_collection_disputes
       where id = ${disputeId}::uuid
    `);
    expect(stored.rows).toEqual([
      { status: "needs_response", fundsWithdrawn: false, reversedAt: null, closedAt: null, eventId, organizationId: invoice.organizationId },
    ]);

    // El intento y el pago de una disputa no se pueden borrar (restrict).
    const attemptDelete = await failureOf(db.execute(sql`delete from zaltyko.family_collection_attempts where id = ${attemptId}::uuid`));
    expect(attemptDelete?.code).toBe("23503");
    expect(attemptDelete?.message).toContain("family_collection_disputes_attempt_fk");
    // Borrar el evento solo quita el enlace: la academia de la disputa no cambia (C3).
    await db.execute(sql`delete from zaltyko.payment_provider_events where id = ${eventId}::uuid`);
    const afterEvent = await db.execute(sql`
      select last_provider_event_id::text as "eventId", organization_id::text as "organizationId"
        from zaltyko.family_collection_disputes
       where id = ${disputeId}::uuid
    `);
    expect(afterEvent.rows).toEqual([{ eventId: null, organizationId: invoice.organizationId }]);
  }, 60_000);

  it("crea la tabla de disputas con sus columnas, índices, RLS ENABLE y FORCE y solo service_role", async () => {
    const tz = "timestamp with time zone";
    expect(await columnsOf("family_collection_disputes")).toEqual([
      { name: "id", type: "uuid", nullable: "NO", default_value: "gen_random_uuid()" },
      { name: "organization_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "attempt_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "payment_id", type: "uuid", nullable: "NO", default_value: null },
      { name: "provider_dispute_reference", type: "text", nullable: "NO", default_value: null },
      { name: "provider_charge_reference", type: "text", nullable: "NO", default_value: null },
      { name: "amount_cents", type: "bigint", nullable: "NO", default_value: null },
      { name: "currency", type: "text", nullable: "NO", default_value: null },
      { name: "status", type: "text", nullable: "NO", default_value: null },
      { name: "reason_code", type: "text", nullable: "YES", default_value: null },
      { name: "evidence_due_at", type: tz, nullable: "YES", default_value: null },
      { name: "funds_withdrawn", type: "boolean", nullable: "NO", default_value: "false" },
      { name: "reversed_at", type: tz, nullable: "YES", default_value: null },
      { name: "opened_at", type: tz, nullable: "NO", default_value: null },
      { name: "closed_at", type: tz, nullable: "YES", default_value: null },
      { name: "last_provider_event_id", type: "uuid", nullable: "YES", default_value: null },
      { name: "created_at", type: tz, nullable: "NO", default_value: "now()" },
      { name: "updated_at", type: tz, nullable: "NO", default_value: "now()" },
    ]);

    const indexes = await db.execute(sql`
      select indexname::text as name, indexdef as definition
        from pg_indexes
       where schemaname = 'zaltyko' and tablename = 'family_collection_disputes'
       order by indexname
    `);
    const byName = new Map((indexes.rows as Array<{ name: string; definition: string }>).map((row) => [row.name, row.definition]));
    expect(byName.get("family_collection_disputes_status_idx")).toContain("(organization_id, status, updated_at)");
    expect(byName.get("family_collection_disputes_attempt_idx")).toContain("(organization_id, attempt_id)");
    expect(byName.get("family_collection_disputes_event_idx")).toContain("(organization_id, last_provider_event_id)");
    expect(byName.get("family_collection_disputes_reference_uq")).toContain("(organization_id, provider_dispute_reference)");

    const rls = await db.execute(sql`
      select relrowsecurity as enabled, relforcerowsecurity as forced
        from pg_class where oid = 'zaltyko.family_collection_disputes'::regclass
    `);
    expect(rls.rows).toEqual([{ enabled: true, forced: true }]);
    const grants = await db.execute(sql`
      select coalesce(r.rolname, 'PUBLIC')::text as grantee, a.privilege_type::text as privilege
        from pg_class c
        cross join lateral aclexplode(c.relacl) a
        left join pg_roles r on r.oid = a.grantee
       where c.oid = 'zaltyko.family_collection_disputes'::regclass
         and coalesce(r.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')
       order by 1, 2
    `);
    expect(grants.rows).toEqual([
      { grantee: "service_role", privilege: "INSERT" },
      { grantee: "service_role", privilege: "SELECT" },
      { grantee: "service_role", privilege: "UPDATE" },
    ]);
    const policies = await db.execute(sql`
      select count(*)::int as n from pg_policies where schemaname = 'zaltyko' and tablename = 'family_collection_disputes'
    `);
    expect(policies.rows).toEqual([{ n: 0 }]);
  });

  /**
   * Tarea 2: buzón de eventos de Stripe e idempotencia por evt_, con la Fase 4
   * instalada. Los cerrojos de entorno se abren solo dentro de este bloque
   * (clave de prueba sintética y base local); los manejadores son simulados y
   * ninguno llama a Stripe.
   */
  describe("buzón de eventos de Stripe (Tarea 2)", () => {
    const EVENT_NOW = new Date("2026-11-20T10:00:00.000Z");
    const EVENT_CREATED = 1_795_168_795;
    const minutesAfter = (minutes: number) => new Date(EVENT_NOW.getTime() + minutes * 60 * 1000);
    const noEffect = () => vi.fn().mockResolvedValue({ effectType: null, effectId: null });

    beforeEach(() => {
      vi.stubEnv("ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "true");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_ci_synthetic");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** Cuenta conectada `test` que crea createCollectableInvoice. */
    const accountOf = (invoice: Invoice) => `acct_CI${invoice.organizationId.slice(0, 8)}`;

    function eventFor(account: string, overrides: Partial<ConnectedAccountEvent> = {}): ConnectedAccountEvent {
      const tag = randomUUID().replace(/-/g, "");
      return {
        eventId: `evt_CI${tag}`,
        type: "payment_intent.succeeded",
        accountId: account,
        livemode: false,
        created: EVENT_CREATED,
        objectId: `pi_CI${tag}`,
        objectType: "payment_intent",
        ...overrides,
      };
    }

    async function inboxRows(eventId: string) {
      const result = await db.execute(sql`
        select id::text as "id", organization_id::text as "organizationId", processor,
               environment::text as "environment", event_type as "eventType", payload,
               payload_sha256 as "sha", signature_verified as "signatureVerified", status::text as "status",
               attempts, last_error as "lastError", effect_type as "effectType", effect_id::text as "effectId",
               received_at as "receivedAt", processed_at as "processedAt"
          from zaltyko.payment_provider_events
         where provider_event_id = ${eventId}
      `);
      return result.rows as Array<Record<string, unknown>>;
    }

    const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);

    it("mismo evt_ dos veces → un solo procesado; la segunda responde duplicate", async () => {
      const invoice = await createCollectableInvoice();
      const event = eventFor(accountOf(invoice));
      const paymentIntent = noEffect();

      expect(await handleFamilyCollectionEvent(event, { now: EVENT_NOW, handlers: { paymentIntent } })).toBe("processed");
      // Un reenvío una hora después: ya está procesado.
      expect(await handleFamilyCollectionEvent(event, { now: minutesAfter(60), handlers: { paymentIntent } })).toBe(
        "duplicate"
      );
      expect(paymentIntent).toHaveBeenCalledTimes(1);
      const rows = await inboxRows(event.eventId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "processed", attempts: 1, lastError: null });
      expect(iso(rows[0]!.processedAt)).toBe(EVENT_NOW.toISOString());

      // Dos entregas a la vez del mismo evento: una sola lo procesa. La otra
      // ve la fila en curso (in_progress → 503) o ya procesada (duplicate),
      // según cuándo llegue; nunca llama al manejador.
      const twice = eventFor(accountOf(invoice));
      const concurrent = noEffect();
      const outcomes = await Promise.all([
        handleFamilyCollectionEvent(twice, { now: EVENT_NOW, handlers: { paymentIntent: concurrent } }),
        handleFamilyCollectionEvent(twice, { now: EVENT_NOW, handlers: { paymentIntent: concurrent } }),
      ]);
      expect(outcomes.filter((outcome) => outcome === "processed")).toHaveLength(1);
      expect(["duplicate", "in_progress"]).toContain(outcomes.find((outcome) => outcome !== "processed"));
      expect(concurrent).toHaveBeenCalledTimes(1);
      expect(await inboxRows(twice.eventId)).toHaveLength(1);
    }, 60_000);

    it("reenvío mientras otra entrega lo procesa → in_progress (503) sin fila nueva; terminado → duplicate", async () => {
      const invoice = await createCollectableInvoice();
      const event = eventFor(accountOf(invoice));
      // El primer manejador se queda esperando hasta que el reenvío haya llegado.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocking = vi.fn(async () => {
        entered();
        await gate;
        return { effectType: null, effectId: null };
      });
      const resent = noEffect();

      const first = handleFamilyCollectionEvent(event, { now: EVENT_NOW, handlers: { paymentIntent: blocking } });
      await started;
      expect(await handleFamilyCollectionEvent(event, { now: minutesAfter(1), handlers: { paymentIntent: resent } })).toBe(
        "in_progress"
      );
      const during = await inboxRows(event.eventId);
      expect(during).toHaveLength(1);
      expect(during[0]).toMatchObject({ status: "processing", attempts: 1 });

      release();
      expect(await first).toBe("processed");
      expect(await handleFamilyCollectionEvent(event, { now: minutesAfter(2), handlers: { paymentIntent: resent } })).toBe(
        "duplicate"
      );
      expect(blocking).toHaveBeenCalledTimes(1);
      expect(resent).not.toHaveBeenCalled();
      expect(await inboxRows(event.eventId)).toEqual([expect.objectContaining({ status: "processed", attempts: 1 })]);
    }, 60_000);

    it("manejador que lanza → fila failed con solo el código; el reenvío lo procesa", async () => {
      const invoice = await createCollectableInvoice();
      const event = eventFor(accountOf(invoice));
      const failure = Object.assign(new Error("La tarjeta de Tutor Disputa Prueba fue rechazada"), {
        type: "StripeCardError",
        code: "card_declined",
      });

      await expect(
        handleFamilyCollectionEvent(event, { now: EVENT_NOW, handlers: { paymentIntent: vi.fn().mockRejectedValue(failure) } })
      ).rejects.toBe(failure);
      const failed = await inboxRows(event.eventId);
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({ status: "failed", attempts: 1, lastError: "card_declined", processedAt: null });
      expect(JSON.stringify(failed)).not.toContain("Tutor");

      // Stripe reenvía (la ruta respondió 500): esta vez el manejador funciona.
      const effectId = randomUUID();
      const paymentIntent = vi.fn().mockResolvedValue({ effectType: "payment", effectId });
      expect(await handleFamilyCollectionEvent(event, { now: minutesAfter(1), handlers: { paymentIntent } })).toBe(
        "processed"
      );
      expect(paymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ inboxId: failed[0]!.id, eventId: event.eventId, organizationId: invoice.organizationId })
      );
      const processed = await inboxRows(event.eventId);
      expect(processed).toHaveLength(1);
      expect(processed[0]).toMatchObject({
        id: failed[0]!.id,
        status: "processed",
        attempts: 2,
        lastError: null,
        effectType: "payment",
        effectId,
      });
      expect(iso(processed[0]!.processedAt)).toBe(minutesAfter(1).toISOString());
    }, 60_000);

    it("el buzón guarda solo type, account, objectType, objectId y created", async () => {
      const invoice = await createCollectableInvoice();
      const event = eventFor(accountOf(invoice), {
        type: "refund.updated",
        objectType: "refund",
        objectId: `pyr_CI${randomUUID().replace(/-/g, "")}`,
      });
      const refund = noEffect();

      expect(await handleFamilyCollectionEvent(event, { now: EVENT_NOW, handlers: { refund } })).toBe("processed");
      expect(refund).toHaveBeenCalledTimes(1);
      const [row] = await inboxRows(event.eventId);
      const payload = row!.payload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(["account", "created", "objectId", "objectType", "type"]);
      expect(payload).toEqual({
        type: "refund.updated",
        account: accountOf(invoice),
        objectType: "refund",
        objectId: event.objectId,
        created: EVENT_CREATED,
      });
      expect(row).toMatchObject({
        organizationId: invoice.organizationId,
        processor: "stripe",
        environment: "sandbox",
        eventType: "refund.updated",
        sha: providerEventPayloadSha256(providerEventPayload(event)),
        signatureVerified: true,
      });
      expect(iso(row!.receivedAt)).toBe(EVENT_NOW.toISOString());
    }, 60_000);

    it("evento livemode true → ignored y sin fila en el buzón", async () => {
      const invoice = await createCollectableInvoice();
      const paymentIntent = noEffect();
      const live = eventFor(accountOf(invoice), { livemode: true });

      expect(await handleFamilyCollectionEvent(live, { now: EVENT_NOW, handlers: { paymentIntent } })).toBe("ignored");
      expect(await inboxRows(live.eventId)).toEqual([]);
      expect(paymentIntent).not.toHaveBeenCalled();
    }, 60_000);

    it("cuenta acct_ desconocida o de otro entorno → ignored y sin fila en el buzón", async () => {
      const invoice = await createCollectableInvoice();
      const short = invoice.organizationId.slice(0, 8);
      const liveAccount = `acct_CIlive${short}`;
      // La misma academia con una cuenta Live: los eventos de esa cuenta no cuentan.
      await db.execute(sql`
        insert into zaltyko.organization_payment_provider_accounts (
          id, organization_id, environment, provider_account_reference, status,
          card_payments_capability_status, sepa_debit_payments_capability_status, requirements_state
        ) values (
          ${randomUUID()}::uuid, ${invoice.organizationId}::uuid, 'live'::zaltyko.stripe_environment, ${liveAccount},
          'active'::zaltyko.organization_payment_account_status, 'active', 'active', 'none'
        )
      `);
      const paymentIntent = noEffect();

      for (const event of [eventFor(`acct_CIunknown${short}`), eventFor(liveAccount)]) {
        expect(await handleFamilyCollectionEvent(event, { now: EVENT_NOW, handlers: { paymentIntent } })).toBe("ignored");
        expect(await inboxRows(event.eventId)).toEqual([]);
      }
      expect(paymentIntent).not.toHaveBeenCalled();
    }, 60_000);

    it("en curso hace menos de 5 min → in_progress; más de 5 min → se vuelve a reclamar; processed → duplicate; nunca cambia de academia", async () => {
      const invoice = await createCollectableInvoice();
      const event = eventFor(accountOf(invoice));
      const input = { organizationId: invoice.organizationId, event };

      const first = await claimProviderEvent({ ...input, now: EVENT_NOW });
      expect(first.claim).toBe("process");
      expect(await claimProviderEvent({ ...input, now: minutesAfter(4) })).toEqual({ claim: "in_progress", inboxId: first.inboxId });
      // La entrega anterior se cayó a mitad: pasados 5 minutos, el reenvío lo reclama.
      expect(await claimProviderEvent({ ...input, now: minutesAfter(6) })).toEqual({ claim: "process", inboxId: first.inboxId });
      // El mismo evt_ desde otra academia no se lleva la fila, aunque esté abandonada.
      const other = await createCollectableInvoice();
      expect(
        await claimProviderEvent({ organizationId: other.organizationId, event, now: minutesAfter(60) })
      ).toEqual({ claim: "duplicate", inboxId: first.inboxId });

      const rows = await inboxRows(event.eventId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ organizationId: invoice.organizationId, status: "processing", attempts: 2 });

      // Una vez processed, cualquier reenvío es duplicate.
      await finishProviderEvent({
        inboxId: first.inboxId,
        status: "processed",
        effectType: null,
        effectId: null,
        errorCode: null,
        now: minutesAfter(7),
      });
      expect(await claimProviderEvent({ ...input, now: minutesAfter(8) })).toEqual({ claim: "duplicate", inboxId: first.inboxId });
      expect(await claimProviderEvent({ ...input, now: minutesAfter(60) })).toEqual({ claim: "duplicate", inboxId: first.inboxId });
      expect((await inboxRows(event.eventId))[0]).toMatchObject({ status: "processed", attempts: 2 });
    }, 60_000);
  });

  it("la candidata deja la base igual al deshacerla", async () => {
    expect(createdOrganizations.length).toBeGreaterThan(0);
    // La vuelta atrás comentada de la propia candidata, sin cambiar una letra.
    await rollBackEvents();
    expect(await schemaFingerprint()).toEqual(beforeEvents);
    expect(await familyCollectionStorageShape()).toBe("phase3");
    expect(await isFamilyCollectionStorageAvailable()).toBe(true);
    expect(await isFamilyCollectionEventsStorageAvailable()).toBe(false);

    // Y retirado lo que instaló la suite, la base queda como estaba al empezar.
    await removeInstalled();
    expect(await schemaFingerprint()).toEqual(original);
    expect(await familyCollectionStorageShape()).toBe(shapes.initial);
    expect(await remainingFixtureRows()).toEqual({
      events: 0, payments: 0, charges: 0, invoices: 0, authorizations: 0, accounts: 0,
      families: 0, people: 0, members: 0, locations: 0, users: 0,
    });
    if (familyPaymentMethodsInstalledHere) expect(await authorizationsComment()).toBe(savedAuthorizationsComment);
  }, 60_000);
});
