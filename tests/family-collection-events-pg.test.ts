import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { recordProviderRefund } from "@/modules/billing/application/ledger-service";
import {
  ATTEMPT_EFFECT_TYPE,
  AUTHORIZATION_EFFECT_TYPE,
  handleFamilyCollectionEvent,
  processMandateEvent,
  processPaymentIntentEvent,
  processPaymentMethodEvent,
  processSetupIntentEvent,
  type ProviderEventHandlerInput,
} from "@/modules/family-collection/application/family-collection-events";
import {
  DISPUTE_EFFECT_TYPE,
  processDisputeEvent,
} from "@/modules/family-collection/application/family-collection-disputes";
import {
  processChargeRefundEvent,
  processRefundEvent,
  REFUND_EFFECT_TYPE,
  REFUND_REVIEW_EFFECT_TYPE,
} from "@/modules/family-collection/application/family-collection-refunds";
import { runFamilyCollection } from "@/modules/family-collection/application/family-collection-service";
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
import { RETURNED_FEE_LINE_TYPE, returnedFeeInvoiceKey } from "@/modules/family-collection/domain/dispute-effect";
import type { PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import {
  providerRefundIdempotencyKey,
  providerRefundReference,
  REFUND_UNALLOCATED_REASON,
  REFUNDED_NOTICE_REASON,
} from "@/modules/family-collection/domain/refund-split";
import {
  createFamilyCollectionRefundStore,
  createFamilyCollectionStore,
  NEEDS_REVIEW_EVENT,
  DUPLICATE_COLLECTION_REASON,
  LATE_SUCCESS_ELSEWHERE_CODE,
  LATE_SUCCESS_PENDING_REASON,
  LATE_SUCCESS_SIBLING_IN_FLIGHT,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  claimProviderEvent,
  finishProviderEvent,
  providerEventPayloadSha256,
} from "@/modules/family-collection/infrastructure/provider-event-inbox";
import type {
  ChargeRefundSnapshot,
  ChargeRefundsSnapshot,
  DisputeSnapshot,
  FamilyCollectionDisputeGateway,
  FamilyCollectionGateway,
  FamilyCollectionRefundGateway,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import type {
  FamilyPaymentGateway,
  FamilyPaymentMethodReads,
} from "@/modules/family-payment-methods/infrastructure/stripe-family-gateway";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import { findConnectAccountByReference } from "@/modules/payments-connect/infrastructure/connect-account-store";

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

  /**
   * Academia con sede, familia, pagador, cuenta conectada, autorización y
   * factura con una cuota. `registry`: dónde se anotan la academia y el
   * usuario para borrarlos (por defecto, los de la suite); `collectionMode`:
   * modo de cobro de la cuota (por defecto el de la base, manual).
   */
  async function createCollectableInvoice(
    options: {
      registry?: { organizations: string[]; users: string[] };
      collectionMode?: "manual" | "automatic";
    } = {}
  ) {
    const registry = options.registry ?? { organizations: createdOrganizations, users: createdUsers };
    const collectionMode = options.collectionMode ?? "manual";
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
    registry.organizations.push(organizationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (${locationId}::uuid, ${organizationId}::uuid, ${`fce-${short}`}, 'Sede CI', 'Europe/Madrid')
    `);
    await db.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-family-collection-events-${userId}@example.invalid`})`);
    registry.users.push(userId);
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
        status, amount_cents, currency, due_at, service_period_start, service_period_end, idempotency_key,
        collection_mode
      ) values (
        ${chargeId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${invoiceId}::uuid, ${lineId}::uuid,
        ${familyId}::uuid, ${payerId}::uuid, 'due'::zaltyko.charge_status,
        4500, 'EUR', ${CLAIMED_AT}::timestamptz, '2026-11-01'::date, '2026-11-28'::date, ${`ci-fce-charge-${chargeId}`},
        ${collectionMode}::zaltyko.family_collection_mode
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

    // La base devuelve la fecha como Date o como texto de PostgreSQL ("2026-11-20 10:00:00+00").
    const iso = (value: unknown) =>
      value instanceof Date ? value.toISOString() : typeof value === "string" ? new Date(value).toISOString() : value;

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
      expect(first).toMatchObject({ claim: "process", attempts: 1 });
      expect(await claimProviderEvent({ ...input, now: minutesAfter(4) })).toEqual({
        claim: "in_progress",
        inboxId: first.inboxId,
        attempts: 1,
      });
      // La entrega anterior se cayó a mitad: pasados 5 minutos, el reenvío lo reclama.
      expect(await claimProviderEvent({ ...input, now: minutesAfter(6) })).toEqual({
        claim: "process",
        inboxId: first.inboxId,
        attempts: 2,
      });
      // El mismo evt_ desde otra academia no se lleva la fila, aunque esté abandonada.
      const other = await createCollectableInvoice();
      expect(
        await claimProviderEvent({ organizationId: other.organizationId, event, now: minutesAfter(60) })
      ).toEqual({ claim: "other_organization", inboxId: first.inboxId, attempts: 2 });

      const rows = await inboxRows(event.eventId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ organizationId: invoice.organizationId, status: "processing", attempts: 2 });

      // Cercado: la primera entrega (attempts 1) llega tarde y no pisa a la segunda.
      expect(
        await finishProviderEvent({
          inboxId: first.inboxId,
          attempts: 1,
          status: "failed",
          effectType: null,
          effectId: null,
          errorCode: "card_declined",
          now: minutesAfter(7),
        })
      ).toBe(false);
      expect((await inboxRows(event.eventId))[0]).toMatchObject({ status: "processing", attempts: 2 });

      // Una vez processed por la entrega vigente, cualquier reenvío es duplicate.
      expect(
        await finishProviderEvent({
          inboxId: first.inboxId,
          attempts: 2,
          status: "processed",
          effectType: null,
          effectId: null,
          errorCode: null,
          now: minutesAfter(7),
        })
      ).toBe(true);
      // Y un cierre tardío de la vieja tampoco deshace el processed.
      expect(
        await finishProviderEvent({
          inboxId: first.inboxId,
          attempts: 1,
          status: "failed",
          effectType: null,
          effectId: null,
          errorCode: "card_declined",
          now: minutesAfter(9),
        })
      ).toBe(false);
      expect(await claimProviderEvent({ ...input, now: minutesAfter(8) })).toEqual({
        claim: "duplicate",
        inboxId: first.inboxId,
        attempts: 2,
      });
      expect(await claimProviderEvent({ ...input, now: minutesAfter(60) })).toEqual({
        claim: "duplicate",
        inboxId: first.inboxId,
        attempts: 2,
      });
      expect((await inboxRows(event.eventId))[0]).toMatchObject({ status: "processed", attempts: 2 });
    }, 60_000);
  });

  describe("eventos de cobro por el camino de la relectura (Tarea 3)", () => {
    const EVENT_NOW = new Date("2026-11-20T10:00:00.000Z");
    const EVENT_CREATED = 1_795_168_795;
    const minutesAfter = (minutes: number) => new Date(EVENT_NOW.getTime() + minutes * 60 * 1000);
    /** Lo que Stripe dice haber cobrado cuando la cuota (45 €) salió entera. */
    const received = { amountCents: 4500, currency: "EUR" };
    /**
     * Academias de este bloque, aparte de las de la suite: aquí se registran
     * cobros de verdad y su auditoría (solo de añadir) apunta a las sedes, así
     * que sedes y academias se quedan (como en family-collection-worker-pg) y
     * el resto se borra al terminar el bloque, antes de deshacer la candidata.
     */
    const registry = { organizations: [] as string[], users: [] as string[] };

    beforeEach(() => {
      vi.stubEnv("ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "true");
      vi.stubEnv("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED", "false");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_ci_synthetic");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    afterAll(async () => {
      if (!disposablePgEnabled || registry.organizations.length === 0) return;
      const organizations = registry.organizations.join(",");
      for (const table of [
        "family_collection_attempt_charges",
        "family_collection_attempts",
        "payment_provider_events",
        "payment_allocations",
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
      ]) {
        if (!(await tableExists(table))) continue;
        await db.execute(sql`
          delete from ${sql.identifier("zaltyko")}.${sql.identifier(table)}
           where organization_id = any(string_to_array(${organizations}, ',')::uuid[])
        `);
      }
      for (const userId of registry.users) {
        await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
      }
    });

    const accountOf = (invoice: Invoice) => `acct_CI${invoice.organizationId.slice(0, 8)}`;
    /** Referencias `pi_…` de la factura (solo letras y números tras el prefijo, como las de Stripe). */
    const intentOf = (invoice: Invoice, name: string) => `pi_CI${invoice.invoiceId.replace(/-/g, "").slice(0, 16)}${name}`;

    function intent(id: string, status: string): PaymentIntentSnapshot {
      return {
        id,
        status,
        lastErrorCode: null,
        lastDeclineCode: null,
        amountReceivedCents: status === "succeeded" ? received.amountCents : 0,
        currency: received.currency,
        attemptIdFromMetadata: null,
      };
    }

    /**
     * Stripe simulado de una cuenta: relee los cobros de `intents` y solo
     * cancela los que aún no se cobraron. `beforeRetrieve` permite parar una
     * lectura (carreras). Un evento nunca crea ni confirma.
     */
    function fakeStripe(
      connectedAccount: string,
      intents: Record<string, PaymentIntentSnapshot>,
      beforeRetrieve: () => Promise<void> = async () => undefined
    ) {
      const missing = () =>
        Object.assign(new Error("CI: cobro inexistente"), { type: "StripeInvalidRequestError", code: "resource_missing" });
      const gateway = {
        createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(async () => {
          throw new Error("Un evento nunca crea un cobro");
        }),
        confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(async () => {
          throw new Error("Un evento nunca confirma un cobro");
        }),
        retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async (input) => {
          await beforeRetrieve();
          const found = intents[input.paymentIntentId];
          if (!found || input.connectedAccount !== connectedAccount) throw missing();
          return { ...found };
        }),
        findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async () => null),
        cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(async (input) => {
          const found = intents[input.paymentIntentId];
          if (!found || input.connectedAccount !== connectedAccount) throw missing();
          if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(found.status)) {
            found.status = "canceled";
            return "canceled";
          }
          return "not_cancelable";
        }),
      };
      return { gateway };
    }

    /**
     * Intento real de la factura con el estado pedido (45 €, tarjeta salvo
     * `kind`); devuelve su id. Con `allocate`, también su reparto: la cuota de
     * la factura entera (family_collection_attempt_charges), como lo deja
     * claimOrCancel, para que un cobro registrado se reparta de verdad.
     */
    async function insertAttempt(
      invoice: Invoice,
      input: {
        number: number;
        status: "claimed" | "created" | "processing" | "succeeded" | "failed" | "canceled";
        intent: string | null;
        nextRetryAt?: string | null;
        paymentId?: string | null;
        kind?: "card" | "sepa_debit";
        failureCode?: string;
        allocate?: boolean;
      }
    ) {
      const terminal = ["succeeded", "failed", "canceled"].includes(input.status);
      const failureCode =
        input.failureCode ??
        (input.status === "failed" ? "card_declined" : input.status === "canceled" ? "reviewed_unverifiable" : null);
      const result = await db.execute(sql`
        insert into zaltyko.family_collection_attempts (
          organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
          payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
          provider_payment_intent_reference, failure_code, next_retry_at, payment_id, allocation_status,
          claimed_at, completed_at
        ) values (
          ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.familyId}::uuid,
          ${invoice.payerId}::uuid, ${invoice.authorizationId}::uuid, ${invoice.accountId}::uuid, ${input.number},
          ${input.kind ?? "card"},
          4500, 'EUR', ${input.status}, ${input.intent}, ${failureCode}, ${input.nextRetryAt ?? null}::timestamptz,
          ${input.paymentId ?? null}::uuid, ${input.status === "succeeded" ? "allocated" : null},
          ${CLAIMED_AT}::timestamptz, ${terminal ? RECEIVED_AT : null}::timestamptz
        )
        returning id::text as id
      `);
      const attemptId = (result.rows[0] as { id: string }).id;
      if (input.allocate) {
        await db.execute(sql`
          insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
          values (${attemptId}::uuid, ${invoice.organizationId}::uuid, ${invoice.chargeId}::uuid, 4500)
        `);
      }
      return attemptId;
    }

    /** Pago de Stripe ya registrado en el libro (el de un intento cobrado). */
    async function insertProviderPayment(invoice: Invoice, paymentIntentId: string) {
      const paymentId = randomUUID();
      await db.execute(sql`
        insert into zaltyko.payments (
          id, organization_id, location_id, family_id, family_payer_id, status, amount_cents, currency,
          processor, environment, provider_payment_id, received_at, idempotency_key
        ) values (
          ${paymentId}::uuid, ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.familyId}::uuid,
          ${invoice.payerId}::uuid, 'succeeded', 4500, 'EUR', 'stripe', 'sandbox', ${paymentIntentId},
          ${RECEIVED_AT}::timestamptz, ${`ci-fce-pay-${paymentId}`}
        )
      `);
      return paymentId;
    }

    async function handlerInput(invoice: Invoice, paymentIntentId: string): Promise<ProviderEventHandlerInput> {
      const account = await findConnectAccountByReference(db, "test", accountOf(invoice));
      if (!account) throw new Error("CI: falta la cuenta conectada de la factura");
      return {
        organizationId: invoice.organizationId,
        account,
        objectId: paymentIntentId,
        now: EVENT_NOW,
        inboxId: randomUUID(),
        eventId: `evt_CI${randomUUID().replace(/-/g, "")}`,
      };
    }

    async function attemptRows(invoice: Invoice) {
      const result = await db.execute(sql`
        select id::text as "id", attempt_number as "number", status, failure_code as "failureCode",
               next_retry_at as "nextRetryAt", payment_id is not null as "hasPayment",
               provider_payment_intent_reference as "intent", allocation_status as "allocationStatus"
          from zaltyko.family_collection_attempts
         where organization_id = ${invoice.organizationId}::uuid and invoice_id = ${invoice.invoiceId}::uuid
         order by attempt_number
      `);
      return result.rows as Array<Record<string, unknown>>;
    }

    async function paymentIntentsRecorded(invoice: Invoice) {
      const result = await db.execute(sql`
        select provider_payment_id as "intent"
          from zaltyko.payments
         where organization_id = ${invoice.organizationId}::uuid
         order by provider_payment_id
      `);
      return (result.rows as Array<{ intent: string }>).map((row) => row.intent);
    }

    async function chargeStatus(invoice: Invoice) {
      const result = await db.execute(sql`
        select status::text as "status" from zaltyko.charges
         where organization_id = ${invoice.organizationId}::uuid and id = ${invoice.chargeId}::uuid
      `);
      return (result.rows[0] as { status: string }).status;
    }

    async function outboxPayload(organizationId: string, eventName: string, idempotencyKey: string) {
      const result = await db.execute(sql`
        select payload
          from zaltyko.outbox_events
         where organization_id = ${organizationId}::uuid
           and event_name = ${eventName}
           and idempotency_key = ${idempotencyKey}
      `);
      return (result.rows as Array<{ payload: Record<string, unknown> }>).map((row) => row.payload);
    }

    it("éxito tardío con un failed con reintento pendiente → next_retry_at a null y listDueInvoices ya no lo reclama", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      const lateIntent = intentOf(invoice, "late");
      const retryIntent = intentOf(invoice, "retry");
      const lateId = await insertAttempt(invoice, { number: 1, status: "failed", intent: lateIntent });
      const retryId = await insertAttempt(invoice, {
        number: 2,
        status: "failed",
        intent: retryIntent,
        nextRetryAt: "2026-11-21T23:00:00.000Z",
      });
      const store = createFamilyCollectionStore();
      const horizon = new Date("2026-11-25T00:00:00.000Z");
      const due = () => store.listDueInvoices({ after: null, limit: 10, horizon, scope: [invoice.organizationId] });
      // Antes: el reintento pendiente se reclamaría.
      expect(await due()).toEqual([{ invoiceId: invoice.invoiceId, organizationId: invoice.organizationId }]);

      const { gateway } = fakeStripe(accountOf(invoice), {
        [lateIntent]: intent(lateIntent, "succeeded"),
        [retryIntent]: intent(retryIntent, "canceled"),
      });
      const outcome = await processPaymentIntentEvent(await handlerInput(invoice, lateIntent), { store, gateway });

      expect(outcome.effect).toEqual({ effectType: ATTEMPT_EFFECT_TYPE, effectId: lateId });
      expect(outcome.result).toMatchObject({ collected: 1 });
      expect(await due()).toEqual([]);
      expect(await attemptRows(invoice)).toEqual([
        expect.objectContaining({ id: lateId, status: "succeeded", failureCode: null, nextRetryAt: null, hasPayment: true }),
        expect.objectContaining({ id: retryId, status: "failed", failureCode: "card_declined", nextRetryAt: null, hasPayment: false }),
      ]);
      expect(await paymentIntentsRecorded(invoice)).toEqual([lateIntent]);
      expect(
        await outboxPayload(
          invoice.organizationId,
          "family_collection.pending_retry_canceled",
          `family-collection:${lateId}:pending_retry_canceled`
        )
      ).toEqual([expect.objectContaining({ reason: "late_success", canceledRetryAttemptIds: [retryId] })]);
      expect(
        await outboxPayload(invoice.organizationId, "family_collection.attempt_succeeded", `family-collection:${lateId}:attempt_succeeded`)
      ).toEqual([expect.objectContaining({ late: true, previousStatus: "failed" })]);
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
    }, 60_000);

    it("éxito tardío con otro intento ya succeeded → aviso duplicate_collection y un solo pago, también al reenviarlo", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      const oldIntent = intentOf(invoice, "old");
      const paidIntent = intentOf(invoice, "paid");
      const oldId = await insertAttempt(invoice, { number: 1, status: "failed", intent: oldIntent });
      const paymentId = await insertProviderPayment(invoice, paidIntent);
      const paidId = await insertAttempt(invoice, { number: 2, status: "succeeded", intent: paidIntent, paymentId });
      const { gateway } = fakeStripe(accountOf(invoice), { [oldIntent]: intent(oldIntent, "succeeded") });

      for (const delivery of [1, 2]) {
        const outcome = await processPaymentIntentEvent(await handlerInput(invoice, oldIntent), { gateway });
        expect(outcome.effect, `entrega ${delivery}`).toEqual({ effectType: null, effectId: null });
        expect(outcome.result).toMatchObject({ collected: 0, skipped: { [DUPLICATE_COLLECTION_REASON]: 1 } });
      }

      expect(
        await outboxPayload(
          invoice.organizationId,
          "family_collection.needs_review",
          `family-collection:${oldId}:needs_review:${DUPLICATE_COLLECTION_REASON}`
        )
      ).toEqual([
        expect.objectContaining({ reason: DUPLICATE_COLLECTION_REASON, paymentIntentId: oldIntent, collectedAttemptId: paidId }),
      ]);
      expect(await paymentIntentsRecorded(invoice)).toEqual([paidIntent]);
      expect((await attemptRows(invoice)).map((row) => row.status)).toEqual(["failed", "succeeded"]);
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
    }, 60_000);

    it("éxito tardío con un hermano claimed sin pi_ → LATE_SUCCESS_SIBLING_IN_FLIGHT, evento failed y nada registrado; el reenvío cancela el hermano y registra", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      const lateIntent = intentOf(invoice, "late");
      const siblingIntent = intentOf(invoice, "sibling");
      const lateId = await insertAttempt(invoice, { number: 1, status: "failed", intent: lateIntent });
      const siblingId = await insertAttempt(invoice, { number: 2, status: "claimed", intent: null });
      const intents: Record<string, PaymentIntentSnapshot> = { [lateIntent]: intent(lateIntent, "succeeded") };
      const { gateway } = fakeStripe(accountOf(invoice), intents);

      // El almacén, con la factura bloqueada, tampoco deja registrarlo con un hermano abierto.
      await expect(
        createFamilyCollectionStore().applyOutcome({
          organizationId: invoice.organizationId,
          attemptId: lateId,
          outcome: { kind: "late_succeeded", paymentIntentId: lateIntent, received },
          environment: "test",
          now: EVENT_NOW,
        })
      ).rejects.toThrow(LATE_SUCCESS_SIBLING_IN_FLIGHT);

      const event: ConnectedAccountEvent = {
        eventId: `evt_CI${randomUUID().replace(/-/g, "")}`,
        type: "payment_intent.succeeded",
        accountId: accountOf(invoice),
        livemode: false,
        created: EVENT_CREATED,
        objectId: lateIntent,
        objectType: "payment_intent",
      };
      const handlers = {
        paymentIntent: async (input: ProviderEventHandlerInput) => (await processPaymentIntentEvent(input, { gateway })).effect,
      };
      await expect(handleFamilyCollectionEvent(event, { now: EVENT_NOW, handlers })).rejects.toThrow(
        LATE_SUCCESS_SIBLING_IN_FLIGHT
      );
      const failedRows = await db.execute(sql`
        select id::text as "id", status::text as "status", last_error as "lastError", attempts
          from zaltyko.payment_provider_events
         where provider_event_id = ${event.eventId}
      `);
      expect(failedRows.rows).toEqual([
        expect.objectContaining({ status: "failed", lastError: LATE_SUCCESS_SIBLING_IN_FLIGHT, attempts: 1 }),
      ]);
      expect(await paymentIntentsRecorded(invoice)).toEqual([]);
      expect((await attemptRows(invoice)).map((row) => row.status)).toEqual(["failed", "claimed"]);
      expect(gateway.cancelPayment).not.toHaveBeenCalled();

      // Mientras tanto el proceso diario creó el cobro del hermano y guardó su pi_.
      await db.execute(sql`
        update zaltyko.family_collection_attempts
           set status = 'created', provider_payment_intent_reference = ${siblingIntent}
         where id = ${siblingId}::uuid
      `);
      intents[siblingIntent] = intent(siblingIntent, "requires_confirmation");

      // Stripe reenvía el evento: se cancela el hermano y se registra el tardío.
      expect(await handleFamilyCollectionEvent(event, { now: minutesAfter(1), handlers })).toBe("processed");
      expect(gateway.cancelPayment).toHaveBeenCalledTimes(1);
      expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount: accountOf(invoice), paymentIntentId: siblingIntent });
      expect(intents[siblingIntent]!.status).toBe("canceled");
      expect(await attemptRows(invoice)).toEqual([
        expect.objectContaining({ id: lateId, status: "succeeded", hasPayment: true }),
        expect.objectContaining({ id: siblingId, status: "canceled", failureCode: LATE_SUCCESS_ELSEWHERE_CODE, intent: siblingIntent }),
      ]);
      expect(await paymentIntentsRecorded(invoice)).toEqual([lateIntent]);
      const processed = await db.execute(sql`
        select status::text as "status", attempts, last_error as "lastError",
               effect_type as "effectType", effect_id::text as "effectId"
          from zaltyko.payment_provider_events
         where provider_event_id = ${event.eventId}
      `);
      expect(processed.rows).toEqual([
        { status: "processed", attempts: 2, lastError: null, effectType: ATTEMPT_EFFECT_TYPE, effectId: lateId },
      ]);
    }, 60_000);

    /**
     * Cobro tardío del intento 1 con un intento 2 por domiciliación todavía en
     * el banco (Stripe no deja cancelarlo). Ambos con su reparto de la cuota.
     */
    async function lateWithSepaInBank() {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      const lateIntent = intentOf(invoice, "late");
      const sepaIntent = intentOf(invoice, "sepa");
      const lateId = await insertAttempt(invoice, { number: 1, status: "failed", intent: lateIntent, allocate: true });
      const sepaId = await insertAttempt(invoice, {
        number: 2,
        status: "processing",
        intent: sepaIntent,
        kind: "sepa_debit",
        allocate: true,
      });
      const intents: Record<string, PaymentIntentSnapshot> = {
        [lateIntent]: intent(lateIntent, "succeeded"),
        [sepaIntent]: intent(sepaIntent, "processing"),
      };
      const { gateway } = fakeStripe(accountOf(invoice), intents);
      const store = createFamilyCollectionStore();
      const event: ConnectedAccountEvent = {
        eventId: `evt_CI${randomUUID().replace(/-/g, "")}`,
        type: "payment_intent.succeeded",
        accountId: accountOf(invoice),
        livemode: false,
        created: EVENT_CREATED,
        objectId: lateIntent,
        objectType: "payment_intent",
      };
      const handlers = {
        paymentIntent: async (input: ProviderEventHandlerInput) =>
          (await processPaymentIntentEvent(input, { store, gateway })).effect,
      };

      // El evento: no se puede cancelar la domiciliación → espera duradera, evento procesado.
      expect(await handleFamilyCollectionEvent(event, { now: EVENT_NOW, handlers })).toBe("processed");
      const inbox = await db.execute(sql`
        select status::text as "status", last_error as "lastError", effect_type as "effectType", effect_id::text as "effectId"
          from zaltyko.payment_provider_events
         where provider_event_id = ${event.eventId}
      `);
      expect(inbox.rows).toEqual([
        { status: "processed", lastError: null, effectType: ATTEMPT_EFFECT_TYPE, effectId: lateId },
      ]);
      expect(
        await outboxPayload(
          invoice.organizationId,
          "family_collection.needs_review",
          `family-collection:${lateId}:needs_review:${LATE_SUCCESS_PENDING_REASON}`
        )
      ).toEqual([expect.objectContaining({ reason: LATE_SUCCESS_PENDING_REASON, attemptId: lateId })]);
      expect(await paymentIntentsRecorded(invoice)).toEqual([]);
      expect((await attemptRows(invoice)).map((row) => row.status)).toEqual(["failed", "processing"]);
      expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount: accountOf(invoice), paymentIntentId: sepaIntent });
      const pending = await store.listLateSuccessPending({ after: null, limit: 10, scope: [invoice.organizationId] });
      expect(pending.map((item) => item.id)).toEqual([lateId]);

      /** Pasada diaria un día después, solo de esta academia. */
      const daily = () =>
        runFamilyCollection(
          { now: minutesAfter(24 * 60), organizationIds: [invoice.organizationId] },
          { store, gateway, refreshAccount: async () => undefined }
        );
      return { invoice, lateIntent, sepaIntent, lateId, sepaId, intents, store, daily };
    }

    it("hermano SEPA en el banco → evento processed con la marca; el banco la rechaza → la relectura diaria registra el tardío y después lo reparte", async () => {
      const { invoice, lateIntent, sepaIntent, lateId, sepaId, intents, store, daily } = await lateWithSepaInBank();

      // Días después el banco rechaza la domiciliación.
      intents[sepaIntent] = { ...intent(sepaIntent, "requires_payment_method"), lastErrorCode: "insufficient_funds" };
      const result = await daily();

      // Paso 3: la domiciliación queda fallida; paso 4: el tardío se registra y se reparte.
      expect(result).toMatchObject({ failed: 1, collected: 1 });
      expect(result.skipped).toEqual({});
      expect(await attemptRows(invoice)).toEqual([
        expect.objectContaining({ id: lateId, status: "succeeded", hasPayment: true, allocationStatus: "allocated" }),
        expect.objectContaining({ id: sepaId, status: "failed", failureCode: "insufficient_funds", hasPayment: false }),
      ]);
      expect(await paymentIntentsRecorded(invoice)).toEqual([lateIntent]);
      expect(await chargeStatus(invoice)).toBe("paid");
      const allocations = await db.execute(sql`
        select pa.amount_cents::int as "amountCents"
          from zaltyko.payment_allocations pa
          join zaltyko.payments p on p.organization_id = pa.organization_id and p.id = pa.payment_id
         where pa.organization_id = ${invoice.organizationId}::uuid and p.provider_payment_id = ${lateIntent}
      `);
      expect(allocations.rows).toEqual([{ amountCents: 4500 }]);
      // Ya no está en espera: la pasada siguiente no lo vuelve a mirar.
      expect(await store.listLateSuccessPending({ after: null, limit: 10, scope: [invoice.organizationId] })).toEqual([]);
    }, 60_000);

    it("hermano SEPA en el banco → el banco la acepta → se registra la domiciliación y el tardío queda duplicate_collection", async () => {
      const { invoice, sepaIntent, lateId, sepaId, intents, store, daily } = await lateWithSepaInBank();

      intents[sepaIntent] = intent(sepaIntent, "succeeded");
      const result = await daily();

      expect(result).toMatchObject({ collected: 1, skipped: { [DUPLICATE_COLLECTION_REASON]: 1 } });
      expect(await attemptRows(invoice)).toEqual([
        expect.objectContaining({ id: lateId, status: "failed", hasPayment: false }),
        expect.objectContaining({ id: sepaId, status: "succeeded", hasPayment: true, allocationStatus: "allocated" }),
      ]);
      expect(await paymentIntentsRecorded(invoice)).toEqual([sepaIntent]);
      expect(
        await outboxPayload(
          invoice.organizationId,
          "family_collection.needs_review",
          `family-collection:${lateId}:needs_review:${DUPLICATE_COLLECTION_REASON}`
        )
      ).toEqual([expect.objectContaining({ reason: DUPLICATE_COLLECTION_REASON, collectedAttemptId: sepaId })]);
      expect(await store.listLateSuccessPending({ after: null, limit: 10, scope: [invoice.organizationId] })).toEqual([]);
    }, 60_000);

    it("tardío sobre una cuota ya pagada a mano → aviso duplicate_collection (D10), nada en el libro", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      const lateIntent = intentOf(invoice, "manual");
      await db.execute(sql`
        update zaltyko.charges set status = 'paid'::zaltyko.charge_status
         where organization_id = ${invoice.organizationId}::uuid and id = ${invoice.chargeId}::uuid
      `);
      const lateId = await insertAttempt(invoice, {
        number: 1,
        status: "canceled",
        intent: lateIntent,
        failureCode: "manual_payment",
        allocate: true,
      });
      const { gateway } = fakeStripe(accountOf(invoice), { [lateIntent]: intent(lateIntent, "succeeded") });

      const outcome = await processPaymentIntentEvent(await handlerInput(invoice, lateIntent), { gateway });

      expect(outcome.effect).toEqual({ effectType: null, effectId: null });
      expect(outcome.result).toMatchObject({ collected: 0, skipped: { [DUPLICATE_COLLECTION_REASON]: 1 } });
      expect(
        await outboxPayload(
          invoice.organizationId,
          "family_collection.needs_review",
          `family-collection:${lateId}:needs_review:${DUPLICATE_COLLECTION_REASON}`
        )
      ).toEqual([expect.objectContaining({ reason: DUPLICATE_COLLECTION_REASON, chargesAlreadyPaid: true })]);
      expect(await paymentIntentsRecorded(invoice)).toEqual([]);
      expect(await attemptRows(invoice)).toEqual([
        expect.objectContaining({ id: lateId, status: "canceled", failureCode: "manual_payment", hasPayment: false }),
      ]);
    }, 60_000);

    it("evento y proceso diario a la vez (pg) → un pago; el otro camino cuenta concurrent", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      const raceIntent = intentOf(invoice, "race");
      const attemptId = await insertAttempt(invoice, { number: 1, status: "processing", intent: raceIntent });
      // Los dos caminos leen el cobro a la vez y aplican a la vez.
      let entered = 0;
      let release: () => void = () => undefined;
      const bothInside = new Promise<void>((resolveBarrier) => {
        release = resolveBarrier;
      });
      const safety = setTimeout(() => release(), 10_000);
      const { gateway } = fakeStripe(accountOf(invoice), { [raceIntent]: intent(raceIntent, "succeeded") }, async () => {
        entered += 1;
        if (entered >= 2) release();
        await bothInside;
      });
      const input = await handlerInput(invoice, raceIntent);

      const [daily, event] = await Promise.all([
        runFamilyCollection(
          { now: EVENT_NOW, organizationIds: [invoice.organizationId] },
          { store: createFamilyCollectionStore(), gateway, refreshAccount: async () => undefined }
        ),
        processPaymentIntentEvent(input, { store: createFamilyCollectionStore(), gateway }),
      ]);
      clearTimeout(safety);

      expect(entered).toBe(2);
      expect(await paymentIntentsRecorded(invoice)).toEqual([raceIntent]);
      expect(await attemptRows(invoice)).toEqual([expect.objectContaining({ id: attemptId, status: "succeeded", hasPayment: true })]);
      const eventResult = event.result!;
      // Uno registra el pago; el otro llega tarde y solo cuenta `concurrent`.
      expect(daily.collected + eventResult.collected).toBe(1);
      expect((daily.skipped.concurrent ?? 0) + (eventResult.skipped.concurrent ?? 0)).toBe(1);
      expect([...Object.keys(daily.skipped), ...Object.keys(eventResult.skipped)].filter((reason) => reason !== "concurrent")).toEqual([]);
      expect(event.effect.effectId === attemptId).toBe(eventResult.collected === 1);
    }, 60_000);

    it("Tarea 4: el banco pide confirmar en el intento 3 → requires_action con su plazo y aviso a la familia en la misma transacción; pasado el plazo, cancelado y failed sin segundo aviso", async () => {
      // La recuperación exige también la bandera del cobro (y la forma phase4, ya instalada).
      vi.stubEnv("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED", "true");
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      await insertAttempt(invoice, { number: 1, status: "failed", intent: intentOf(invoice, "one") });
      // Reintento del intento 3 el 20-11 (00:00 en Madrid): ventana hasta el final del 23-11.
      await insertAttempt(invoice, {
        number: 2,
        status: "failed",
        intent: intentOf(invoice, "two"),
        nextRetryAt: "2026-11-19T23:00:00.000Z",
      });
      const thirdIntent = intentOf(invoice, "three");
      const thirdId = await insertAttempt(invoice, { number: 3, status: "created", intent: thirdIntent });
      const intents = { [thirdIntent]: intent(thirdIntent, "requires_action") };
      const { gateway } = fakeStripe(accountOf(invoice), intents);
      const input = await handlerInput(invoice, thirdIntent);

      const entered = await processPaymentIntentEvent(input, { store: createFamilyCollectionStore(), gateway });

      expect(entered.effect).toEqual({ effectType: ATTEMPT_EFFECT_TYPE, effectId: thirdId });
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      const stored = await db.execute(sql`
        select status, action_deadline_at as "deadline", completed_at as "completedAt"
          from zaltyko.family_collection_attempts
         where organization_id = ${invoice.organizationId}::uuid and id = ${thirdId}::uuid
      `);
      const row = stored.rows[0] as { status: string; deadline: Date | string; completedAt: unknown };
      expect(row.status).toBe("requires_action");
      expect(new Date(row.deadline).toISOString()).toBe("2026-11-23T22:59:59.999Z");
      expect(row.completedAt).toBeNull();
      const noticeKey = `family-collection:${thirdId}:family_failure_notice`;
      expect(await outboxPayload(invoice.organizationId, "family_collection.family_failure_notice", noticeKey)).toHaveLength(1);
      expect(
        await outboxPayload(
          invoice.organizationId,
          "family_collection.attempt_requires_action",
          `family-collection:${thirdId}:attempt_requires_action`
        )
      ).toEqual([expect.objectContaining({ attemptId: thirdId, actionDeadlineAt: "2026-11-23T22:59:59.999Z" })]);

      // La familia lo intenta antes del plazo y su banco lo rechaza: nada cambia.
      intents[thirdIntent] = intent(thirdIntent, "requires_payment_method");
      await processPaymentIntentEvent(
        { ...(await handlerInput(invoice, thirdIntent)), now: new Date("2026-11-23T20:00:00.000Z") },
        { store: createFamilyCollectionStore(), gateway }
      );
      expect((await attemptRows(invoice)).find((item) => item.id === thirdId)).toMatchObject({ status: "requires_action" });
      expect(gateway.cancelPayment).not.toHaveBeenCalled();

      // Pasado el plazo: se cancela en Stripe y se cierra failed authentication_required, sin reintento.
      await processPaymentIntentEvent(
        { ...(await handlerInput(invoice, thirdIntent)), now: new Date("2026-11-24T09:00:00.000Z") },
        { store: createFamilyCollectionStore(), gateway }
      );
      expect(gateway.cancelPayment).toHaveBeenCalledTimes(1);
      expect((await attemptRows(invoice)).find((item) => item.id === thirdId)).toMatchObject({
        status: "failed",
        failureCode: "authentication_required",
        nextRetryAt: null,
      });
      // Un solo aviso a la familia por intento.
      expect(await outboxPayload(invoice.organizationId, "family_collection.family_failure_notice", noticeKey)).toHaveLength(1);
      expect(await paymentIntentsRecorded(invoice)).toEqual([]);
    }, 60_000);

    it("N2: con un cobro tardío en espera, listDueInvoices no ofrece la factura y claimOrCancel no reclama el reintento", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      const lateId = await insertAttempt(invoice, {
        number: 1,
        status: "failed",
        intent: intentOf(invoice, "late"),
        nextRetryAt: "2026-11-19T23:00:00.000Z",
      });
      const store = createFamilyCollectionStore();
      const due = () =>
        store.listDueInvoices({
          after: null,
          limit: 10,
          horizon: new Date("2026-11-21T00:00:00.000Z"),
          scope: [invoice.organizationId],
        });
      expect((await due()).map((item) => item.invoiceId)).toEqual([invoice.invoiceId]);

      // El cobro tardío queda en espera (marca late_success_pending).
      await store.recordNotice({
        organizationId: invoice.organizationId,
        locationId: invoice.locationId,
        attemptId: lateId,
        invoiceId: invoice.invoiceId,
        reason: LATE_SUCCESS_PENDING_REASON,
        now: EVENT_NOW,
      });
      expect(await due()).toEqual([]);
      const decide = vi.fn(() => ({ action: "skip" as const, reason: "no_debe_llegar" }));
      await expect(
        store.claimOrCancel(
          {
            organizationId: invoice.organizationId,
            invoiceId: invoice.invoiceId,
            authorizationId: invoice.authorizationId,
            paymentProviderAccountId: invoice.accountId,
            paymentMethodKind: "card",
            now: EVENT_NOW,
          },
          decide
        )
      ).resolves.toEqual({ outcome: "skipped", reason: LATE_SUCCESS_PENDING_REASON });
      expect(decide).not.toHaveBeenCalled();
      expect(await attemptRows(invoice)).toHaveLength(1);

      // Con el aviso que cierra la espera (duplicate_collection), la factura vuelve a la lista.
      await store.recordNotice({
        organizationId: invoice.organizationId,
        locationId: invoice.locationId,
        attemptId: lateId,
        invoiceId: invoice.invoiceId,
        reason: DUPLICATE_COLLECTION_REASON,
        now: EVENT_NOW,
      });
      expect((await due()).map((item) => item.invoiceId)).toEqual([invoice.invoiceId]);
    }, 60_000);
  });

  describe("devoluciones hechas desde el panel de Stripe (Tarea 6)", () => {
    const EVENT_NOW = new Date("2026-12-06T10:00:00.000Z");
    const EVENT_CREATED = 1_796_551_200;
    const REFUNDED_AT = new Date("2026-12-06T09:30:00.000Z");
    const COLLECTED_AT = new Date("2026-12-01T08:05:00.000Z");
    /**
     * Academias de este bloque, aparte de las de la suite: aquí se registran
     * cobros y devoluciones de verdad y su auditoría (solo de añadir) apunta a
     * las sedes, así que sedes y academias se quedan y el resto se borra al
     * terminar el bloque, antes de deshacer la candidata.
     */
    const registry = { organizations: [] as string[], users: [] as string[] };

    beforeEach(() => {
      vi.stubEnv("ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "true");
      vi.stubEnv("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED", "false");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_ci_synthetic");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    afterAll(async () => {
      if (!disposablePgEnabled || registry.organizations.length === 0) return;
      const organizations = registry.organizations.join(",");
      for (const table of [
        // Tarea 7: las disputas apuntan al intento, al pago y al buzón; van primero.
        "family_collection_disputes",
        "refunds",
        "family_collection_attempt_charges",
        "family_collection_attempts",
        "payment_provider_events",
        "payment_allocations",
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
      ]) {
        if (!(await tableExists(table))) continue;
        await db.execute(sql`
          delete from ${sql.identifier("zaltyko")}.${sql.identifier(table)}
           where organization_id = any(string_to_array(${organizations}, ',')::uuid[])
        `);
      }
      for (const userId of registry.users) {
        await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
      }
    });

    const accountOf = (invoice: Invoice) => `acct_CI${invoice.organizationId.slice(0, 8)}`;
    /** Referencias de Stripe de la factura: prefijo y solo letras y números, como las de Stripe. */
    const refOf = (invoice: Invoice, prefix: "pi" | "ch" | "py" | "re" | "dp" | "du" | "evt", name: string) =>
      `${prefix}_CI${invoice.invoiceId.replace(/-/g, "").slice(0, 16)}${name}`;

    /**
     * Factura de dos cuotas de 35 € (noviembre y diciembre) cobrada entera
     * (70 €) por un intento real: applyOutcome registra el pago y lo reparte
     * como siempre. `split`:
     * - `both`: repartido en las dos cuotas, las dos pagadas;
     * - `partial`: la de diciembre ya estaba pagada (a mano) y solo se
     *   reparten 35 € en la de noviembre;
     * - `none`: el intento no tiene cuotas y el pago queda sin repartir.
     *
     * Tarea 7: `kind` (tarjeta por defecto, o domiciliación) y `late`: el
     * intento queda `failed` con su `pi_…` y sin registrar (Stripe lo cobró
     * tarde); lo registra el camino de los cobros.
     */
    async function collectedInvoice(
      split: "both" | "partial" | "none",
      options: { kind?: "card" | "sepa_debit"; late?: boolean } = {}
    ) {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      const secondLineId = randomUUID();
      const secondChargeId = randomUUID();
      await db.execute(sql`
        update zaltyko.invoice_lines set unit_amount_cents = 3500, amount_cents = 3500
         where organization_id = ${invoice.organizationId}::uuid and invoice_id = ${invoice.invoiceId}::uuid
      `);
      await db.execute(sql`
        update zaltyko.charges set amount_cents = 3500
         where organization_id = ${invoice.organizationId}::uuid and id = ${invoice.chargeId}::uuid
      `);
      await db.execute(sql`
        update zaltyko.invoices set total_amount_cents = 7000
         where organization_id = ${invoice.organizationId}::uuid and id = ${invoice.invoiceId}::uuid
      `);
      await db.execute(sql`
        insert into zaltyko.invoice_lines (
          id, organization_id, invoice_id, location_id, line_type, quantity,
          unit_amount_cents, amount_cents, currency, service_period_start, service_period_end
        ) values (
          ${secondLineId}::uuid, ${invoice.organizationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.locationId}::uuid,
          'ci_collection_fee', 1, 3500, 3500, 'EUR', '2026-12-01'::date, '2026-12-28'::date
        )
      `);
      await db.execute(sql`
        insert into zaltyko.charges (
          id, organization_id, location_id, invoice_id, invoice_line_id, family_id, family_payer_id,
          status, amount_cents, currency, due_at, service_period_start, service_period_end, idempotency_key,
          collection_mode
        ) values (
          ${secondChargeId}::uuid, ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.invoiceId}::uuid,
          ${secondLineId}::uuid, ${invoice.familyId}::uuid, ${invoice.payerId}::uuid,
          ${split === "partial" ? "paid" : "due"}::zaltyko.charge_status,
          3500, 'EUR', ${CLAIMED_AT}::timestamptz, '2026-12-01'::date, '2026-12-28'::date,
          ${`ci-fce-charge-${secondChargeId}`}, 'automatic'::zaltyko.family_collection_mode
        )
      `);
      const paymentIntentId = refOf(invoice, "pi", "paid");
      const inserted = await db.execute(sql`
        insert into zaltyko.family_collection_attempts (
          organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
          payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
          provider_payment_intent_reference, claimed_at
        ) values (
          ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.familyId}::uuid,
          ${invoice.payerId}::uuid, ${invoice.authorizationId}::uuid, ${invoice.accountId}::uuid, 1, ${options.kind ?? "card"},
          7000, 'EUR', 'created', ${paymentIntentId}, ${CLAIMED_AT}::timestamptz
        )
        returning id::text as id
      `);
      const attemptId = (inserted.rows[0] as { id: string }).id;
      if (split !== "none") {
        for (const chargeId of [invoice.chargeId, secondChargeId]) {
          await db.execute(sql`
            insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
            values (${attemptId}::uuid, ${invoice.organizationId}::uuid, ${chargeId}::uuid, 3500)
          `);
        }
      }
      const base = { invoice, attemptId, paymentIntentId, secondChargeId, chargeRef: refOf(invoice, "ch", "paid") };
      if (options.late) {
        // Cerrado en el libro como fallido; Stripe lo cobró tarde.
        await db.execute(sql`
          update zaltyko.family_collection_attempts
             set status = 'failed', failure_code = 'card_declined', completed_at = ${RECEIVED_AT}::timestamptz
           where organization_id = ${invoice.organizationId}::uuid and id = ${attemptId}::uuid
        `);
        return base;
      }
      const applied = await createFamilyCollectionStore().applyOutcome({
        organizationId: invoice.organizationId,
        attemptId,
        outcome: { kind: "succeeded", paymentIntentId, received: { amountCents: 7000, currency: "EUR" } },
        environment: "test",
        now: COLLECTED_AT,
      });
      expect(applied).toMatchObject({
        applied: true,
        status: "succeeded",
        allocationStatus: split === "both" ? "allocated" : "needs_review",
      });
      return base;
    }
    type Collected = Awaited<ReturnType<typeof collectedInvoice>>;

    function stripeRefund(id: string, amountCents: number, status = "succeeded", minute = 30): ChargeRefundSnapshot {
      return {
        id,
        status,
        amountCents,
        currency: "EUR",
        reasonCode: null,
        createdAt: new Date(REFUNDED_AT.getTime() + (minute - 30) * 60 * 1000),
      };
    }

    /** Stripe simulado de la cuenta: el cargo del cobro y sus devoluciones (se pueden cambiar entre entregas). */
    function fakeRefundStripe(collected: Collected, refunds: ChargeRefundSnapshot[]) {
      const connectedAccount = accountOf(collected.invoice);
      const state = { refunds };
      const gateway: FamilyCollectionRefundGateway = {
        retrieveChargeRefunds: vi.fn<FamilyCollectionRefundGateway["retrieveChargeRefunds"]>(async (request) => {
          if (request.connectedAccount !== connectedAccount || request.chargeId !== collected.chargeRef) {
            throw Object.assign(new Error("CI: cargo inexistente"), { type: "StripeInvalidRequestError", code: "resource_missing" });
          }
          const snapshot: ChargeRefundsSnapshot = {
            chargeId: collected.chargeRef,
            paymentIntentId: collected.paymentIntentId,
            refunds: state.refunds.map((entry) => ({ ...entry })),
          };
          return snapshot;
        }),
        retrieveRefundCharge: vi.fn<FamilyCollectionRefundGateway["retrieveRefundCharge"]>(async (request) =>
          request.connectedAccount === connectedAccount && state.refunds.some((entry) => entry.id === request.refundId)
            ? collected.chargeRef
            : null
        ),
        // Tarea 7: solo lo usa el cobro tardío al registrarse; los eventos de devolución nunca.
        retrievePaymentIntentRefunds: vi.fn<FamilyCollectionRefundGateway["retrievePaymentIntentRefunds"]>(async () => {
          throw new Error("Un evento de devolución no relee por el cobro");
        }),
      };
      return { gateway, state };
    }

    function chargeEvent(collected: Collected, name: string): ConnectedAccountEvent {
      return {
        eventId: refOf(collected.invoice, "evt", name),
        type: "charge.refunded",
        accountId: accountOf(collected.invoice),
        livemode: false,
        created: EVENT_CREATED,
        objectId: collected.chargeRef,
        objectType: "charge",
      };
    }

    function refundEvent(collected: Collected, name: string, refundId: string): ConnectedAccountEvent {
      return {
        eventId: refOf(collected.invoice, "evt", name),
        type: "refund.updated",
        accountId: accountOf(collected.invoice),
        livemode: false,
        created: EVENT_CREATED,
        objectId: refundId,
        objectType: "refund",
      };
    }

    /** Una entrega por la ruta de verdad (buzón incluido), con Stripe simulado. */
    function deliver(event: ConnectedAccountEvent, gateway: FamilyCollectionRefundGateway) {
      return handleFamilyCollectionEvent(event, {
        now: EVENT_NOW,
        handlers: {
          charge: (handlerInput) => processChargeRefundEvent(handlerInput, { gateway }),
          refund: (handlerInput) => processRefundEvent(handlerInput, { gateway }),
        },
      });
    }

    async function inboxRow(eventId: string) {
      const result = await db.execute(sql`
        select id::text as "id", status::text as "status", effect_type as "effectType", effect_id::text as "effectId",
               last_error as "lastError"
          from zaltyko.payment_provider_events
         where provider_event_id = ${eventId}
      `);
      return result.rows[0] as Record<string, unknown> | undefined;
    }

    async function refundRows(collected: Collected) {
      const result = await db.execute(sql`
        select r.id::text as "id", r.provider_refund_id as "reference", r.idempotency_key as "key",
               r.amount_cents::int as "amountCents", r.payment_allocation_id::text as "allocationId",
               pa.charge_id::text as "chargeId", r.reason_code as "reasonCode", r.status::text as "status",
               r.processor, r.environment::text as "environment", r.provider_event_id::text as "providerEventId"
          from zaltyko.refunds r
          join zaltyko.payment_allocations pa
            on pa.organization_id = r.organization_id and pa.id = r.payment_allocation_id
          join zaltyko.charges c
            on c.organization_id = pa.organization_id and c.id = pa.charge_id
         where r.organization_id = ${collected.invoice.organizationId}::uuid
         order by r.refunded_at, c.service_period_start
      `);
      return result.rows as Array<Record<string, unknown>>;
    }

    /** Pago, repartos y cuotas: lo que nunca debe cambiar salvo el estado del pago. */
    async function ledgerState(collected: Collected) {
      const result = await db.execute(sql`
        select
          (select status::text from zaltyko.payments
            where organization_id = ${collected.invoice.organizationId}::uuid) as "paymentStatus",
          (select count(*)::int from zaltyko.payments
            where organization_id = ${collected.invoice.organizationId}::uuid) as "payments",
          (select coalesce(sum(amount_cents), 0)::int from zaltyko.payment_allocations
            where organization_id = ${collected.invoice.organizationId}::uuid) as "allocatedCents",
          (select string_agg(status::text, ',' order by service_period_start) from zaltyko.charges
            where organization_id = ${collected.invoice.organizationId}::uuid) as "chargeStatuses",
          (select status from zaltyko.family_collection_attempts
            where organization_id = ${collected.invoice.organizationId}::uuid and id = ${collected.attemptId}::uuid) as "attemptStatus"
      `);
      return result.rows[0] as Record<string, unknown>;
    }

    async function outboxPayloads(organizationId: string, eventName: string, idempotencyKey: string) {
      const result = await db.execute(sql`
        select payload
          from zaltyko.outbox_events
         where organization_id = ${organizationId}::uuid
           and event_name = ${eventName}
           and idempotency_key = ${idempotencyKey}
      `);
      return (result.rows as Array<{ payload: Record<string, unknown> }>).map((row) => row.payload);
    }

    async function allocationOf(collected: Collected, chargeId: string) {
      const result = await db.execute(sql`
        select id::text as "id" from zaltyko.payment_allocations
         where organization_id = ${collected.invoice.organizationId}::uuid and charge_id = ${chargeId}::uuid
      `);
      return (result.rows[0] as { id: string }).id;
    }

    const noticeKey = (collected: Collected, reason: string, refundId: string) =>
      `family-collection:${collected.attemptId}:needs_review:${reason}:${refundId}`;

    it("devolución total por evento → dos filas en refunds y pago refunded; cuotas siguen pagadas", async () => {
      const collected = await collectedInvoice("both");
      const refundId = refOf(collected.invoice, "re", "total");
      const { gateway } = fakeRefundStripe(collected, [stripeRefund(refundId, 7000)]);
      const before = await ledgerState(collected);
      expect(before).toMatchObject({ paymentStatus: "succeeded", allocatedCents: 7000, chargeStatuses: "paid,paid" });

      const event = chargeEvent(collected, "total");
      expect(await deliver(event, gateway)).toBe("processed");

      const rows = await refundRows(collected);
      const inbox = await inboxRow(event.eventId);
      expect(rows).toEqual([
        expect.objectContaining({ chargeId: collected.invoice.chargeId, amountCents: 3500 }),
        expect.objectContaining({ chargeId: collected.secondChargeId, amountCents: 3500 }),
      ]);
      for (const row of rows) {
        expect(row).toMatchObject({
          reference: providerRefundReference(refundId, String(row.allocationId)),
          key: providerRefundIdempotencyKey(refundId, String(row.allocationId)),
          reasonCode: "requested_by_academy",
          status: "succeeded",
          processor: "stripe",
          environment: "sandbox",
          providerEventId: inbox?.id,
        });
        expect(
          await outboxPayloads(collected.invoice.organizationId, "payment.refunded", String(row.key))
        ).toEqual([expect.objectContaining({ refundId: row.id, amountCents: 3500, currency: "EUR" })]);
      }
      // D1: el pago queda refunded, pero nada se borra: mismos repartos y las cuotas siguen pagadas.
      expect(await ledgerState(collected)).toEqual({
        ...before,
        paymentStatus: "refunded",
      });
      expect(inbox).toMatchObject({ status: "processed", effectType: REFUND_EFFECT_TYPE, effectId: rows[0].id });
      expect(
        await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, REFUNDED_NOTICE_REASON, refundId))
      ).toEqual([
        expect.objectContaining({ reason: REFUNDED_NOTICE_REASON, providerRefundReference: refundId, amountCents: 7000 }),
      ]);
    }, 60_000);

    it("mismo evento o charge.refunded repetido → ninguna fila nueva", async () => {
      const collected = await collectedInvoice("both");
      const refundId = refOf(collected.invoice, "re", "again");
      const { gateway } = fakeRefundStripe(collected, [stripeRefund(refundId, 3500)]);

      const event = chargeEvent(collected, "first");
      expect(await deliver(event, gateway)).toBe("processed");
      // El mismo evt_: el buzón lo da por hecho sin llamar al manejador.
      expect(await deliver(event, gateway)).toBe("duplicate");
      // Otro charge.refunded del mismo cargo: se relee y no hay nada nuevo.
      const repeated = chargeEvent(collected, "second");
      expect(await deliver(repeated, gateway)).toBe("processed");

      expect(await refundRows(collected)).toHaveLength(1);
      expect(await inboxRow(repeated.eventId)).toMatchObject({ status: "processed", effectType: null, effectId: null });
      expect((await ledgerState(collected)).paymentStatus).toBe("partially_refunded");
    }, 60_000);

    it("devolución pending → nada; luego refund.updated succeeded → filas", async () => {
      const collected = await collectedInvoice("both");
      const refundId = refOf(collected.invoice, "re", "pending");
      const { gateway, state } = fakeRefundStripe(collected, [stripeRefund(refundId, 3500, "pending")]);

      const created = refundEvent(collected, "created", refundId);
      expect(await deliver({ ...created, type: "refund.created" }, gateway)).toBe("processed");
      expect(await refundRows(collected)).toEqual([]);
      expect(await inboxRow(created.eventId)).toMatchObject({ status: "processed", effectType: null });

      state.refunds = [stripeRefund(refundId, 3500, "succeeded")];
      const updated = refundEvent(collected, "updated", refundId);
      expect(await deliver(updated, gateway)).toBe("processed");
      const rows = await refundRows(collected);
      expect(rows).toEqual([expect.objectContaining({ chargeId: collected.invoice.chargeId, amountCents: 3500 })]);
      expect(await inboxRow(updated.eventId)).toMatchObject({ effectType: REFUND_EFFECT_TYPE, effectId: rows[0].id });
      expect((await ledgerState(collected)).chargeStatuses).toBe("paid,paid");
    }, 60_000);

    it("cobro sin repartir → aviso refund_unallocated, ninguna fila y evento processed (200)", async () => {
      const collected = await collectedInvoice("none");
      const refundId = refOf(collected.invoice, "re", "unallocated");
      const { gateway } = fakeRefundStripe(collected, [stripeRefund(refundId, 3500)]);
      const before = await ledgerState(collected);
      expect(before).toMatchObject({ paymentStatus: "succeeded", allocatedCents: 0 });

      const event = chargeEvent(collected, "unallocated");
      expect(await deliver(event, gateway)).toBe("processed");

      expect(await refundRows(collected)).toEqual([]);
      expect(await ledgerState(collected)).toEqual(before);
      expect(await inboxRow(event.eventId)).toMatchObject({
        status: "processed",
        effectType: REFUND_REVIEW_EFFECT_TYPE,
        effectId: collected.attemptId,
        lastError: null,
      });
      expect(
        await outboxPayloads(
          collected.invoice.organizationId,
          NEEDS_REVIEW_EVENT,
          noticeKey(collected, REFUND_UNALLOCATED_REASON, refundId)
        )
      ).toEqual([
        expect.objectContaining({ reason: REFUND_UNALLOCATED_REASON, providerRefundReference: refundId, amountCents: 3500 }),
      ]);
      // Sin filas, tampoco el aviso informativo `refunded` (la transacción se deshizo entera).
      expect(
        await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, REFUNDED_NOTICE_REASON, refundId))
      ).toEqual([]);
    }, 60_000);

    it("pago repartido solo en parte y devolución mayor que lo repartido → ninguna fila, aviso una vez, evento processed", async () => {
      const collected = await collectedInvoice("partial");
      const refundId = refOf(collected.invoice, "re", "partial");
      const { gateway } = fakeRefundStripe(collected, [stripeRefund(refundId, 5000)]);
      const before = await ledgerState(collected);
      expect(before).toMatchObject({ allocatedCents: 3500 });

      for (const name of ["partial1", "partial2"]) {
        const event = chargeEvent(collected, name);
        expect(await deliver(event, gateway), name).toBe("processed");
        expect(await inboxRow(event.eventId), name).toMatchObject({ status: "processed", effectType: REFUND_REVIEW_EFFECT_TYPE });
      }

      expect(await refundRows(collected)).toEqual([]);
      expect(await ledgerState(collected)).toEqual(before);
      expect(
        await outboxPayloads(
          collected.invoice.organizationId,
          NEEDS_REVIEW_EVENT,
          noticeKey(collected, REFUND_UNALLOCATED_REASON, refundId)
        )
      ).toHaveLength(1);
    }, 60_000);

    it("Tarea M (punto 6): la pasada diaria lista el cobro con refund_unallocated mientras su re_ no tenga filas, y deja de listarlo después", async () => {
      const collected = await collectedInvoice("partial");
      const refundId = refOf(collected.invoice, "re", "relist");
      const { gateway } = fakeRefundStripe(collected, [stripeRefund(refundId, 5000)]);
      expect(await deliver(chargeEvent(collected, "relist"), gateway)).toBe("processed");

      const store = createFamilyCollectionStore();
      const scope = [collected.invoice.organizationId];
      const thirtyDaysBefore = new Date(EVENT_NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
      const listed = await store.listUnallocatedRefundAttempts({ after: null, limit: 10, scope, since: thirtyDaysBefore });
      expect(listed.map((item) => [item.id, item.status])).toEqual([[collected.attemptId, "succeeded"]]);
      // Aviso más antiguo que el plazo de relectura: ya no se relee.
      expect(
        await store.listUnallocatedRefundAttempts({
          after: null,
          limit: 10,
          scope,
          since: new Date(EVENT_NOW.getTime() + 60 * 1000),
        })
      ).toEqual([]);

      // La devolución ya cabe y se anota (lo que haría la relectura diaria): deja de salir.
      expect(
        await createFamilyCollectionRefundStore().recordAttemptRefunds({
          organizationId: collected.invoice.organizationId,
          attemptId: collected.attemptId,
          paymentIntentId: collected.paymentIntentId,
          refund: { id: refundId, amountCents: 3500, currency: "EUR", reasonCode: "requested_by_customer", refundedAt: REFUNDED_AT },
          providerEventId: null,
          environment: "test",
          now: EVENT_NOW,
        })
      ).toMatchObject({ outcome: "recorded" });
      expect(await store.listUnallocatedRefundAttempts({ after: null, limit: 10, scope, since: thirtyDaysBefore })).toEqual([]);
    }, 60_000);

    it("un re_ en dos cuotas → dos filas con claves refund:re_…:{allocationId} distintas, sin 23505; una segunda devolución también avisa", async () => {
      const collected = await collectedInvoice("both");
      const first = refOf(collected.invoice, "re", "split");
      const second = refOf(collected.invoice, "re", "rest");
      const { gateway, state } = fakeRefundStripe(collected, [stripeRefund(first, 5000)]);
      const olderAllocation = await allocationOf(collected, collected.invoice.chargeId);
      const newerAllocation = await allocationOf(collected, collected.secondChargeId);

      expect(await deliver(refundEvent(collected, "split", first), gateway)).toBe("processed");
      expect((await refundRows(collected)).map((row) => [row.key, row.amountCents])).toEqual([
        [`refund:${first}:${olderAllocation}`, 3500],
        [`refund:${first}:${newerAllocation}`, 1500],
      ]);
      expect((await ledgerState(collected)).paymentStatus).toBe("partially_refunded");

      // Lo que queda (20 €) en la cuota más nueva, con su propio aviso (C13).
      state.refunds = [stripeRefund(first, 5000), stripeRefund(second, 2000, "succeeded", 45)];
      expect(await deliver(chargeEvent(collected, "rest"), gateway)).toBe("processed");
      expect((await refundRows(collected)).map((row) => [row.key, row.amountCents])).toEqual([
        [`refund:${first}:${olderAllocation}`, 3500],
        [`refund:${first}:${newerAllocation}`, 1500],
        [`refund:${second}:${newerAllocation}`, 2000],
      ]);
      expect(await ledgerState(collected)).toMatchObject({ paymentStatus: "refunded", chargeStatuses: "paid,paid" });
      for (const refundId of [first, second]) {
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, REFUNDED_NOTICE_REASON, refundId)),
          refundId
        ).toHaveLength(1);
      }
    }, 60_000);

    it("mismo re_ reenviado → ninguna fila nueva (idempotencia por clave y por referencia)", async () => {
      const collected = await collectedInvoice("both");
      const refundId = refOf(collected.invoice, "re", "resent");
      const { gateway } = fakeRefundStripe(collected, [stripeRefund(refundId, 3500)]);

      for (const name of ["resent1", "resent2"]) {
        expect(await deliver(refundEvent(collected, name, refundId), gateway), name).toBe("processed");
      }
      const rows = await refundRows(collected);
      expect(rows).toHaveLength(1);
      const inboxId = String(rows[0].providerEventId);

      // El almacén directamente con el mismo re_: ya anotado, nada nuevo.
      const store = createFamilyCollectionRefundStore();
      expect(
        await store.recordAttemptRefunds({
          organizationId: collected.invoice.organizationId,
          attemptId: collected.attemptId,
          paymentIntentId: collected.paymentIntentId,
          refund: { id: refundId, amountCents: 3500, currency: "EUR", reasonCode: "requested_by_academy", refundedAt: REFUNDED_AT },
          providerEventId: inboxId,
          environment: "test",
          now: EVENT_NOW,
        })
      ).toEqual({ outcome: "already_recorded" });

      // Y el libro con la misma referencia y la misma clave: devuelve la fila, sin 23505.
      const paymentRow = await db.execute(sql`
        select id::text as "id" from zaltyko.payments where organization_id = ${collected.invoice.organizationId}::uuid
      `);
      const again = await db.transaction((tx) =>
        recordProviderRefund(tx, {
          organizationId: collected.invoice.organizationId,
          paymentId: (paymentRow.rows[0] as { id: string }).id,
          paymentAllocationId: String(rows[0].allocationId),
          amountCents: 3500,
          currency: "EUR",
          processor: "stripe",
          environment: "sandbox",
          providerRefundId: String(rows[0].reference),
          reasonCode: "requested_by_academy",
          refundedAt: REFUNDED_AT,
          providerEventId: inboxId,
          idempotencyKey: String(rows[0].key),
        })
      );
      expect(again).toEqual({ refundId: rows[0].id, created: false, paymentStatus: "partially_refunded" });
      expect(await refundRows(collected)).toHaveLength(1);
    }, 60_000);

    describe("disputas y devoluciones del banco en domiciliación (Tarea 7)", () => {
      /** Plazo para responder: fin del 24-12 en Madrid. */
      const EVIDENCE_DUE = new Date("2026-12-24T22:59:59.000Z");
      const OPENED = new Date("2026-12-05T09:00:00.000Z");
      const TS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
      const at = (column: string) => sql.raw(`to_char(${column} at time zone 'UTC', ${TS})`);

      type DisputeKind = "card" | "sepa_debit";

      /** La disputa tal como la relee Stripe (por defecto, de tarjeta y abierta, por el cobro entero). */
      function stripeDispute(
        collected: Collected,
        id: string,
        overrides: Partial<DisputeSnapshot> & { kind?: DisputeKind } = {}
      ): DisputeSnapshot {
        const { kind = "card", ...rest } = overrides;
        return {
          id,
          chargeId: kind === "sepa_debit" ? refOf(collected.invoice, "py", "paid") : collected.chargeRef,
          paymentIntentId: collected.paymentIntentId,
          status: kind === "sepa_debit" ? "lost" : "needs_response",
          reasonCode: kind === "sepa_debit" ? "debit_not_authorized" : "fraudulent",
          amountCents: 7000,
          currency: "EUR",
          evidenceDueAt: kind === "sepa_debit" ? null : EVIDENCE_DUE,
          fundsWithdrawn: true,
          paymentMethodKind: kind,
          createdAt: OPENED,
          ...rest,
        };
      }

      /** Stripe simulado de la cuenta: la disputa (se puede cambiar entre entregas). */
      function fakeDisputeStripe(collected: Collected, dispute: DisputeSnapshot) {
        const connectedAccount = accountOf(collected.invoice);
        const state = { dispute };
        const gateway: FamilyCollectionDisputeGateway = {
          retrieveDispute: vi.fn<FamilyCollectionDisputeGateway["retrieveDispute"]>(async (request) => {
            if (request.connectedAccount !== connectedAccount || request.disputeId !== state.dispute.id) {
              throw Object.assign(new Error("CI: disputa inexistente"), {
                type: "StripeInvalidRequestError",
                code: "resource_missing",
              });
            }
            return { ...state.dispute };
          }),
        };
        return { gateway, state };
      }

      function disputeEvent(
        collected: Collected,
        name: string,
        disputeId: string,
        type = "charge.dispute.created"
      ): ConnectedAccountEvent {
        return {
          eventId: refOf(collected.invoice, "evt", name),
          type,
          accountId: accountOf(collected.invoice),
          livemode: false,
          created: EVENT_CREATED,
          objectId: disputeId,
          objectType: "dispute",
        };
      }

      /** Una entrega por la ruta de verdad (buzón incluido), con Stripe simulado. */
      function deliverDispute(
        event: ConnectedAccountEvent,
        gateway: FamilyCollectionDisputeGateway,
        recordCollection?: (input: ProviderEventHandlerInput) => Promise<unknown>
      ) {
        return handleFamilyCollectionEvent(event, {
          now: EVENT_NOW,
          handlers: {
            dispute: (handlerInput) => processDisputeEvent(handlerInput, { gateway, recordCollection }),
          },
        });
      }

      async function disputeRows(collected: Collected) {
        const result = await db.execute(sql`
          select d.id::text as "id", d.provider_dispute_reference as "reference",
                 d.provider_charge_reference as "chargeReference", d.status as "status",
                 d.amount_cents::int as "amountCents", d.reason_code as "reasonCode",
                 d.funds_withdrawn as "fundsWithdrawn", d.attempt_id::text as "attemptId",
                 d.payment_id::text as "paymentId", d.last_provider_event_id::text as "lastEventId",
                 ${at("d.evidence_due_at")} as "evidenceDueAt", ${at("d.opened_at")} as "openedAt",
                 ${at("d.closed_at")} as "closedAt", ${at("d.reversed_at")} as "reversedAt"
            from zaltyko.family_collection_disputes d
           where d.organization_id = ${collected.invoice.organizationId}::uuid
           order by d.opened_at, d.id
        `);
        return result.rows as Array<Record<string, unknown>>;
      }

      async function paymentIdOf(collected: Collected) {
        const result = await db.execute(sql`
          select id::text as "id" from zaltyko.payments
           where organization_id = ${collected.invoice.organizationId}::uuid
        `);
        return (result.rows[0] as { id: string }).id;
      }

      /** Facturas de la academia que no son la original (la cuota nueva de D2). */
      async function returnedInvoices(collected: Collected) {
        const result = await db.execute(sql`
          select i.id::text as "id", i.reference as "reference", i.status::text as "status",
                 i.family_id::text as "familyId", i.family_payer_id::text as "familyPayerId",
                 i.location_id::text as "locationId", i.total_amount_cents::int as "totalCents",
                 ${at("i.due_at")} as "dueAt",
                 (select string_agg(l.line_type || ':' || l.amount_cents || ':' || l.service_period_start::text
                                    || '..' || l.service_period_end::text, ',' order by l.service_period_start)
                    from zaltyko.invoice_lines l
                   where l.organization_id = i.organization_id and l.invoice_id = i.id) as "lines",
                 (select string_agg(c.collection_mode::text || ':' || c.status::text || ':' || c.amount_cents, ','
                                    order by c.service_period_start)
                    from zaltyko.charges c
                   where c.organization_id = i.organization_id and c.invoice_id = i.id) as "charges"
            from zaltyko.invoices i
           where i.organization_id = ${collected.invoice.organizationId}::uuid
             and i.id <> ${collected.invoice.invoiceId}::uuid
           order by i.reference
        `);
        return result.rows as Array<Record<string, unknown>>;
      }

      it("disputa de tarjeta abierta → fila track, cuota pagada, aviso con fecha", async () => {
        const collected = await collectedInvoice("both");
        const disputeId = refOf(collected.invoice, "dp", "open");
        const { gateway } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId));
        const before = await ledgerState(collected);

        const event = disputeEvent(collected, "open", disputeId);
        expect(await deliverDispute(event, gateway)).toBe("processed");

        const inbox = await inboxRow(event.eventId);
        const disputes = await disputeRows(collected);
        expect(disputes).toEqual([
          {
            id: expect.any(String),
            reference: disputeId,
            chargeReference: collected.chargeRef,
            status: "needs_response",
            amountCents: 7000,
            reasonCode: "fraudulent",
            fundsWithdrawn: true,
            attemptId: collected.attemptId,
            paymentId: await paymentIdOf(collected),
            lastEventId: inbox?.id,
            evidenceDueAt: EVIDENCE_DUE.toISOString(),
            openedAt: OPENED.toISOString(),
            closedAt: null,
            reversedAt: null,
          },
        ]);
        // D4: la cuota sigue pagada; nada en el libro.
        expect(await refundRows(collected)).toEqual([]);
        expect(await ledgerState(collected)).toEqual(before);
        expect(await returnedInvoices(collected)).toEqual([]);
        expect(inbox).toMatchObject({ status: "processed", effectType: DISPUTE_EFFECT_TYPE, effectId: disputes[0]?.id });
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "dispute_opened", disputeId))
        ).toEqual([
          expect.objectContaining({
            reason: "dispute_opened",
            providerDisputeReference: disputeId,
            amountCents: 7000,
            currency: "EUR",
            evidenceDueAt: EVIDENCE_DUE.toISOString(),
          }),
        ]);
      }, 60_000);

      it("disputa ganada → close y sin filas en refunds", async () => {
        const collected = await collectedInvoice("both");
        const disputeId = refOf(collected.invoice, "dp", "won");
        const { gateway, state } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId));
        const before = await ledgerState(collected);

        expect(await deliverDispute(disputeEvent(collected, "wonopen", disputeId), gateway)).toBe("processed");
        state.dispute = stripeDispute(collected, disputeId, { status: "won", fundsWithdrawn: false, evidenceDueAt: null });
        const closed = disputeEvent(collected, "wonclosed", disputeId, "charge.dispute.closed");
        expect(await deliverDispute(closed, gateway)).toBe("processed");

        expect(await disputeRows(collected)).toEqual([
          expect.objectContaining({
            status: "won",
            fundsWithdrawn: false,
            evidenceDueAt: null,
            closedAt: EVENT_NOW.toISOString(),
            reversedAt: null,
            lastEventId: (await inboxRow(closed.eventId))?.id,
          }),
        ]);
        expect(await refundRows(collected)).toEqual([]);
        expect(await ledgerState(collected)).toEqual(before);
        for (const reason of ["dispute_opened", "dispute_won"]) {
          expect(
            await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, reason, disputeId)),
            reason
          ).toHaveLength(1);
        }
      }, 60_000);

      it("disputa perdida → filas dispute_lost por reparto y reversed_at; repetir el evento no duplica", async () => {
        const collected = await collectedInvoice("both");
        const disputeId = refOf(collected.invoice, "dp", "lost");
        const { gateway } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId, { status: "lost" }));
        const olderAllocation = await allocationOf(collected, collected.invoice.chargeId);
        const newerAllocation = await allocationOf(collected, collected.secondChargeId);

        const closed = disputeEvent(collected, "lost", disputeId, "charge.dispute.closed");
        expect(await deliverDispute(closed, gateway)).toBe("processed");
        // El mismo evt_ → duplicate; otro evento de la misma disputa → se relee y no hay nada nuevo.
        expect(await deliverDispute(closed, gateway)).toBe("duplicate");
        const again = disputeEvent(collected, "lostagain", disputeId, "charge.dispute.funds_withdrawn");
        expect(await deliverDispute(again, gateway)).toBe("processed");

        const inbox = await inboxRow(closed.eventId);
        const rows = await refundRows(collected);
        expect(rows.map((row) => [row.reference, row.key, row.amountCents, row.reasonCode, row.providerEventId])).toEqual([
          [providerRefundReference(disputeId, olderAllocation), `refund:${disputeId}:${olderAllocation}`, 3500, "dispute_lost", inbox?.id],
          [providerRefundReference(disputeId, newerAllocation), `refund:${disputeId}:${newerAllocation}`, 3500, "dispute_lost", inbox?.id],
        ]);
        for (const row of rows) {
          expect(await outboxPayloads(collected.invoice.organizationId, "payment.refunded", String(row.key))).toHaveLength(1);
        }
        const disputes = await disputeRows(collected);
        expect(disputes).toEqual([
          expect.objectContaining({ status: "lost", closedAt: EVENT_NOW.toISOString(), reversedAt: EVENT_NOW.toISOString() }),
        ]);
        // Nunca se borra ni se cambia un pago: el pago queda refunded y las cuotas siguen pagadas.
        expect(await ledgerState(collected)).toMatchObject({ paymentStatus: "refunded", allocatedCents: 7000, chargeStatuses: "paid,paid" });
        expect(inbox).toMatchObject({ effectType: DISPUTE_EFFECT_TYPE, effectId: disputes[0]?.id });
        expect(await inboxRow(again.eventId)).toMatchObject({ status: "processed", effectType: DISPUTE_EFFECT_TYPE });
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "dispute_lost", disputeId))
        ).toHaveLength(1);
      }, 60_000);

      it("C15: disputa de tarjeta perdida → filas dispute_lost, aviso y ninguna cuota nueva (D3)", async () => {
        const collected = await collectedInvoice("both");
        const disputeId = refOf(collected.invoice, "dp", "nodebt");
        const { gateway } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId, { status: "lost" }));

        expect(await deliverDispute(disputeEvent(collected, "nodebt", disputeId, "charge.dispute.closed"), gateway)).toBe(
          "processed"
        );

        expect((await refundRows(collected)).map((row) => row.reasonCode)).toEqual(["dispute_lost", "dispute_lost"]);
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "dispute_lost", disputeId))
        ).toEqual([expect.not.objectContaining({ returnedInvoiceId: expect.anything() })]);
        // Ninguna factura nueva ni la clave de la cuota devuelta.
        expect(await returnedInvoices(collected)).toEqual([]);
        expect(
          await outboxPayloads(collected.invoice.organizationId, "invoice.issued", returnedFeeInvoiceKey(disputeId))
        ).toEqual([]);
      }, 60_000);

      it("domiciliación disputada → sepa_returned al crearse", async () => {
        const collected = await collectedInvoice("both", { kind: "sepa_debit" });
        const disputeId = refOf(collected.invoice, "du", "created");
        // Recién abierta en Stripe, todavía sin cerrar: una domiciliación no se puede recurrir.
        const { gateway } = fakeDisputeStripe(
          collected,
          stripeDispute(collected, disputeId, { kind: "sepa_debit", status: "needs_response" })
        );

        expect(await deliverDispute(disputeEvent(collected, "sepacreated", disputeId), gateway)).toBe("processed");

        expect((await refundRows(collected)).map((row) => [row.reasonCode, row.amountCents])).toEqual([
          ["sepa_returned", 3500],
          ["sepa_returned", 3500],
        ]);
        expect(await disputeRows(collected)).toEqual([
          expect.objectContaining({
            status: "needs_response",
            chargeReference: refOf(collected.invoice, "py", "paid"),
            closedAt: null,
            reversedAt: EVENT_NOW.toISOString(),
          }),
        ]);
        const [returned] = await returnedInvoices(collected);
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "sepa_returned", disputeId))
        ).toEqual([
          expect.objectContaining({ reason: "sepa_returned", amountCents: 7000, returnedInvoiceId: returned?.id }),
        ]);
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "dispute_opened", disputeId))
        ).toEqual([]);
      }, 60_000);

      it("D2-A: devolución SEPA crea una cuota manual pendiente una sola vez", async () => {
        const collected = await collectedInvoice("both", { kind: "sepa_debit" });
        const disputeId = refOf(collected.invoice, "du", "returned");
        const { gateway, state } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId, { kind: "sepa_debit" }));

        expect(await deliverDispute(disputeEvent(collected, "returned1", disputeId), gateway)).toBe("processed");
        // Otros eventos de la misma devolución, en cualquier orden: nada nuevo.
        state.dispute = stripeDispute(collected, disputeId, { kind: "sepa_debit", fundsWithdrawn: true });
        for (const [name, type] of [
          ["returned2", "charge.dispute.funds_withdrawn"],
          ["returned3", "charge.dispute.closed"],
          ["returned4", "charge.dispute.updated"],
        ] as const) {
          expect(await deliverDispute(disputeEvent(collected, name, disputeId, type), gateway), name).toBe("processed");
        }

        // La cuota nueva: misma familia, persona pagadora y sede; a mano, pendiente y vencida ya; una línea por cuota devuelta.
        expect(await returnedInvoices(collected)).toEqual([
          {
            id: expect.any(String),
            reference: `DEVUELTA-${disputeId}`,
            status: "issued",
            familyId: collected.invoice.familyId,
            familyPayerId: collected.invoice.payerId,
            locationId: collected.invoice.locationId,
            totalCents: 7000,
            dueAt: EVENT_NOW.toISOString(),
            lines: `${RETURNED_FEE_LINE_TYPE}:3500:2026-11-01..2026-11-28,${RETURNED_FEE_LINE_TYPE}:3500:2026-12-01..2026-12-28`,
            charges: "manual:due:3500,manual:due:3500",
          },
        ]);
        expect(
          await outboxPayloads(collected.invoice.organizationId, "invoice.issued", returnedFeeInvoiceKey(disputeId))
        ).toHaveLength(1);
        // Las filas sepa_returned, una vez; la cuota original sigue pagada.
        expect(await refundRows(collected)).toHaveLength(2);
        expect(await ledgerState(collected)).toMatchObject({ paymentStatus: "refunded", payments: 1 });
        expect(
          (
            await db.execute(sql`
              select string_agg(status::text, ',' order by service_period_start) as "statuses"
                from zaltyko.charges
               where organization_id = ${collected.invoice.organizationId}::uuid
                 and invoice_id = ${collected.invoice.invoiceId}::uuid
            `)
          ).rows[0]
        ).toEqual({ statuses: "paid,paid" });
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "sepa_returned", disputeId))
        ).toHaveLength(1);
      }, 60_000);

      it("disputa perdida tras una devolución parcial previa (70 €, devuelto 35 €, disputa de 70 €) → disputa guardada, ninguna fila en refunds, aviso dispute_unallocated, evento processed", async () => {
        const collected = await collectedInvoice("both");
        const refundId = refOf(collected.invoice, "re", "beforedispute");
        expect(
          await createFamilyCollectionRefundStore().recordAttemptRefunds({
            organizationId: collected.invoice.organizationId,
            attemptId: collected.attemptId,
            paymentIntentId: collected.paymentIntentId,
            refund: { id: refundId, amountCents: 3500, currency: "EUR", reasonCode: "requested_by_academy", refundedAt: REFUNDED_AT },
            providerEventId: null,
            environment: "test",
            now: REFUNDED_AT,
          })
        ).toMatchObject({ outcome: "recorded" });
        const disputeId = refOf(collected.invoice, "dp", "toomuch");
        const { gateway } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId, { status: "lost" }));
        const before = await ledgerState(collected);

        for (const name of ["toomuch1", "toomuch2"]) {
          const event = disputeEvent(collected, name, disputeId, "charge.dispute.closed");
          expect(await deliverDispute(event, gateway), name).toBe("processed");
          expect(await inboxRow(event.eventId), name).toMatchObject({
            status: "processed",
            effectType: DISPUTE_EFFECT_TYPE,
            lastError: null,
          });
        }

        // Solo la devolución anterior: la disputa no escribe nada.
        expect((await refundRows(collected)).map((row) => row.reasonCode)).toEqual(["requested_by_academy"]);
        expect(await ledgerState(collected)).toEqual(before);
        expect(await disputeRows(collected)).toEqual([
          expect.objectContaining({ status: "lost", closedAt: EVENT_NOW.toISOString(), reversedAt: null }),
        ]);
        expect(
          await outboxPayloads(
            collected.invoice.organizationId,
            NEEDS_REVIEW_EVENT,
            noticeKey(collected, "dispute_unallocated", disputeId)
          )
        ).toEqual([expect.objectContaining({ reason: "dispute_unallocated", amountCents: 7000 })]);
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "dispute_lost", disputeId))
        ).toEqual([]);
      }, 60_000);

      it("C14: disputa perdida de 35 € tras una devolución de 35 € → una fila dispute_lost por lo que queda", async () => {
        const collected = await collectedInvoice("both");
        const refundId = refOf(collected.invoice, "re", "half");
        await createFamilyCollectionRefundStore().recordAttemptRefunds({
          organizationId: collected.invoice.organizationId,
          attemptId: collected.attemptId,
          paymentIntentId: collected.paymentIntentId,
          refund: { id: refundId, amountCents: 3500, currency: "EUR", reasonCode: "requested_by_academy", refundedAt: REFUNDED_AT },
          providerEventId: null,
          environment: "test",
          now: REFUNDED_AT,
        });
        const disputeId = refOf(collected.invoice, "dp", "rest");
        const { gateway } = fakeDisputeStripe(
          collected,
          stripeDispute(collected, disputeId, { status: "lost", amountCents: 3500 })
        );
        const newerAllocation = await allocationOf(collected, collected.secondChargeId);

        expect(await deliverDispute(disputeEvent(collected, "rest", disputeId, "charge.dispute.closed"), gateway)).toBe(
          "processed"
        );

        expect((await refundRows(collected)).map((row) => [row.reasonCode, row.key, row.amountCents])).toEqual([
          ["requested_by_academy", `refund:${refundId}:${await allocationOf(collected, collected.invoice.chargeId)}`, 3500],
          ["dispute_lost", `refund:${disputeId}:${newerAllocation}`, 3500],
        ]);
        expect(await ledgerState(collected)).toMatchObject({ paymentStatus: "refunded", chargeStatuses: "paid,paid" });
        expect(await disputeRows(collected)).toEqual([expect.objectContaining({ reversedAt: EVENT_NOW.toISOString() })]);
      }, 60_000);

      it("disputa perdida en dos cuotas → claves refund:dp_…:{allocationId} distintas, sin 23505", async () => {
        const collected = await collectedInvoice("both");
        const disputeId = refOf(collected.invoice, "dp", "split");
        const { gateway } = fakeDisputeStripe(
          collected,
          stripeDispute(collected, disputeId, { status: "lost", amountCents: 5000 })
        );
        const olderAllocation = await allocationOf(collected, collected.invoice.chargeId);
        const newerAllocation = await allocationOf(collected, collected.secondChargeId);

        const event = disputeEvent(collected, "split", disputeId, "charge.dispute.closed");
        expect(await deliverDispute(event, gateway)).toBe("processed");
        expect(await inboxRow(event.eventId)).toMatchObject({ status: "processed", lastError: null });

        expect((await refundRows(collected)).map((row) => [row.key, row.amountCents])).toEqual([
          [`refund:${disputeId}:${olderAllocation}`, 3500],
          [`refund:${disputeId}:${newerAllocation}`, 1500],
        ]);
        expect((await ledgerState(collected)).paymentStatus).toBe("partially_refunded");
      }, 60_000);

      it("perdida y después ganada (funds_reinstated) → las filas se quedan, sin borrar nada, y aviso dispute_reinstated", async () => {
        const collected = await collectedInvoice("both");
        const disputeId = refOf(collected.invoice, "dp", "reinstated");
        const { gateway, state } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId, { status: "lost" }));

        expect(await deliverDispute(disputeEvent(collected, "relost", disputeId, "charge.dispute.closed"), gateway)).toBe(
          "processed"
        );
        const rowsAfterLoss = await refundRows(collected);
        expect(rowsAfterLoss).toHaveLength(2);

        state.dispute = stripeDispute(collected, disputeId, { status: "won", fundsWithdrawn: false, evidenceDueAt: null });
        expect(
          await deliverDispute(disputeEvent(collected, "reinstated", disputeId, "charge.dispute.funds_reinstated"), gateway)
        ).toBe("processed");

        // Nada se deshace: mismas filas, el pago sigue refunded; la academia lo revisa en su panel de Stripe.
        expect(await refundRows(collected)).toEqual(rowsAfterLoss);
        expect((await ledgerState(collected)).paymentStatus).toBe("refunded");
        expect(await disputeRows(collected)).toEqual([
          expect.objectContaining({ status: "won", fundsWithdrawn: false, reversedAt: EVENT_NOW.toISOString() }),
        ]);
        for (const [reason, count] of [
          ["dispute_lost", 1],
          ["dispute_reinstated", 1],
          ["dispute_won", 0],
        ] as const) {
          expect(
            await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, reason, disputeId)),
            reason
          ).toHaveLength(count);
        }
      }, 60_000);

      it("orden de llegada: closed (perdida) antes que created, y una lectura atrasada → una sola reversión y la disputa sigue cerrada", async () => {
        const collected = await collectedInvoice("both");
        const disputeId = refOf(collected.invoice, "dp", "order");
        const { gateway, state } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId, { status: "lost" }));

        expect(await deliverDispute(disputeEvent(collected, "order1", disputeId, "charge.dispute.closed"), gateway)).toBe(
          "processed"
        );
        // Llega tarde el created: Stripe ya dice perdida.
        expect(await deliverDispute(disputeEvent(collected, "order2", disputeId), gateway)).toBe("processed");
        // Una lectura atrasada (Stripe aún decía abierta) no la reabre ni escribe de más.
        state.dispute = stripeDispute(collected, disputeId, { status: "needs_response" });
        expect(await deliverDispute(disputeEvent(collected, "order3", disputeId, "charge.dispute.updated"), gateway)).toBe(
          "processed"
        );

        expect(await refundRows(collected)).toHaveLength(2);
        expect(await disputeRows(collected)).toEqual([
          expect.objectContaining({ status: "lost", closedAt: EVENT_NOW.toISOString(), reversedAt: EVENT_NOW.toISOString() }),
        ]);
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "dispute_opened", disputeId))
        ).toEqual([]);
        expect(
          await outboxPayloads(collected.invoice.organizationId, NEEDS_REVIEW_EVENT, noticeKey(collected, "dispute_lost", disputeId))
        ).toHaveLength(1);
      }, 60_000);

      it("disputa de un cobro que el libro tenía cerrado (cobro tardío) → primero se registra el pago y después se guarda la disputa", async () => {
        const collected = await collectedInvoice("both", { late: true });
        const disputeId = refOf(collected.invoice, "dp", "late");
        const { gateway } = fakeDisputeStripe(collected, stripeDispute(collected, disputeId));
        const connectedAccount = accountOf(collected.invoice);
        // Stripe simulado del cobro: lo cobró tarde, entero. Un evento nunca crea, confirma ni cancela.
        const never = (name: string) => async () => {
          throw new Error(`Una disputa no ${name} un cobro`);
        };
        const paymentGateway: FamilyCollectionGateway = {
          createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(never("crea")),
          confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(never("confirma")),
          cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(never("cancela")),
          findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async () => null),
          retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async (request) => {
            if (request.connectedAccount !== connectedAccount || request.paymentIntentId !== collected.paymentIntentId) {
              throw Object.assign(new Error("CI: cobro inexistente"), { type: "StripeInvalidRequestError", code: "resource_missing" });
            }
            return {
              id: collected.paymentIntentId,
              status: "succeeded",
              lastErrorCode: null,
              lastDeclineCode: null,
              amountReceivedCents: 7000,
              currency: "EUR",
              attemptIdFromMetadata: null,
            };
          }),
        };
        expect((await ledgerState(collected)).attemptStatus).toBe("failed");

        const event = disputeEvent(collected, "late", disputeId);
        expect(
          await deliverDispute(event, gateway, (input) => processPaymentIntentEvent(input, { gateway: paymentGateway }))
        ).toBe("processed");

        expect(await ledgerState(collected)).toMatchObject({
          attemptStatus: "succeeded",
          payments: 1,
          paymentStatus: "succeeded",
          chargeStatuses: "paid,paid",
        });
        expect(await disputeRows(collected)).toEqual([
          expect.objectContaining({
            status: "needs_response",
            attemptId: collected.attemptId,
            paymentId: await paymentIdOf(collected),
            reversedAt: null,
          }),
        ]);
        expect(await inboxRow(event.eventId)).toMatchObject({ status: "processed", effectType: DISPUTE_EFFECT_TYPE });
      }, 60_000);
    });
  });

  describe("cambios del método de pago en Stripe (Tarea 8)", () => {
    const EVENT_NOW = new Date("2026-11-20T10:00:00.000Z");
    const EVENT_CREATED = 1_795_168_795;
    const SHA = "c".repeat(64);
    /**
     * Academias de este bloque, aparte de las de la suite: la revocación y la
     * activación dejan auditoría (solo de añadir), así que las academias se
     * quedan y el resto se borra al terminar el bloque, antes de deshacer la
     * candidata.
     */
    const registry = { organizations: [] as string[], users: [] as string[] };

    beforeEach(() => {
      vi.stubEnv("ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "true");
      vi.stubEnv("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED", "false");
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "true");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_ci_synthetic");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    afterAll(async () => {
      if (!disposablePgEnabled || registry.organizations.length === 0) return;
      const organizations = registry.organizations.join(",");
      for (const table of [
        "family_collection_attempt_charges",
        "family_collection_attempts",
        "payment_provider_events",
        "payments",
        "charges",
        "invoice_lines",
        "invoices",
        "family_payment_setup_attempts",
        "family_payment_authorizations",
        "organization_payment_provider_accounts",
        "family_payers",
        "family_guardians",
        "guardians",
        "people",
        "families",
        "organization_members",
      ]) {
        if (!(await tableExists(table))) continue;
        await db.execute(sql`
          delete from ${sql.identifier("zaltyko")}.${sql.identifier(table)}
           where organization_id = any(string_to_array(${organizations}, ',')::uuid[])
        `);
      }
      for (const userId of registry.users) {
        await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
      }
    });

    const shortOf = (invoice: Invoice) => invoice.organizationId.slice(0, 8);
    const accountOf = (invoice: Invoice) => `acct_CI${shortOf(invoice)}`;
    /** El pm_ y la orden de la autorización de createCollectableInvoice. */
    const methodOf = (invoice: Invoice) => `pm_CI${shortOf(invoice)}`;
    const mandateOf = (invoice: Invoice) => `mandate_CI${shortOf(invoice)}`;

    /** La autorización de la factura, activa con su evidencia (y su orden si es domiciliación). */
    async function activateAuthorization(invoice: Invoice, kind: "card" | "sepa_debit") {
      await db.execute(sql`
        update zaltyko.family_payment_authorizations a
           set status = 'active'::zaltyko.payment_authorization_status,
               payment_method_kind = ${kind},
               mandate_reference = ${kind === "sepa_debit" ? mandateOf(invoice) : null},
               consent_version = 'borrador-2026-11-16',
               consent_evidence_reference = ${`attempt:${shortOf(invoice)}`},
               consent_evidence_sha256 = ${SHA},
               consented_at = ${CLAIMED_AT}::timestamptz,
               consented_by_guardian_id = fp.guardian_id
          from zaltyko.family_payers fp
         where a.organization_id = ${invoice.organizationId}::uuid
           and a.id = ${invoice.authorizationId}::uuid
           and fp.organization_id = a.organization_id
           and fp.id = a.family_payer_id
      `);
    }

    /** Intento de cobro ya creado en Stripe (su dinero puede moverse): un evento del método no lo toca. */
    async function insertCreatedAttempt(invoice: Invoice, paymentIntentId: string) {
      const result = await db.execute(sql`
        insert into zaltyko.family_collection_attempts (
          organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
          payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
          provider_payment_intent_reference, claimed_at
        ) values (
          ${invoice.organizationId}::uuid, ${invoice.locationId}::uuid, ${invoice.invoiceId}::uuid, ${invoice.familyId}::uuid,
          ${invoice.payerId}::uuid, ${invoice.authorizationId}::uuid, ${invoice.accountId}::uuid, 1, 'card',
          4500, 'EUR', 'created', ${paymentIntentId}, ${CLAIMED_AT}::timestamptz
        )
        returning id::text as id
      `);
      return (result.rows[0] as { id: string }).id;
    }

    function methodEvent(
      invoice: Invoice,
      name: string,
      type: "payment_method.detached" | "mandate.updated" | "setup_intent.succeeded",
      objectId: string
    ): ConnectedAccountEvent {
      const objectType = type === "payment_method.detached" ? "payment_method" : type === "mandate.updated" ? "mandate" : "setup_intent";
      return {
        eventId: `evt_CI${invoice.organizationId.replace(/-/g, "").slice(0, 16)}${name}`,
        type,
        accountId: accountOf(invoice),
        livemode: false,
        created: EVENT_CREATED,
        objectId,
        objectType,
      };
    }

    /** Stripe simulado de la cuenta: el cliente de cada pm_ y el estado de cada orden (se pueden cambiar). */
    function fakeMethodStripe(
      invoice: Invoice,
      state: { customers?: Record<string, string | null>; mandates?: Record<string, string> }
    ) {
      const connectedAccount = accountOf(invoice);
      return {
        retrievePaymentMethod: vi.fn<FamilyPaymentMethodReads["retrievePaymentMethod"]>(async (request) => {
          if (request.connectedAccount !== connectedAccount) throw new Error("CI: otra cuenta");
          const customers = state.customers ?? {};
          if (!(request.paymentMethodId in customers)) return null;
          return { id: request.paymentMethodId, customer: customers[request.paymentMethodId] ?? null };
        }),
        retrieveMandate: vi.fn<FamilyPaymentMethodReads["retrieveMandate"]>(async (request) => {
          if (request.connectedAccount !== connectedAccount) throw new Error("CI: otra cuenta");
          const status = (state.mandates ?? {})[request.mandateId];
          return status ? { id: request.mandateId, status } : null;
        }),
      } satisfies FamilyPaymentMethodReads;
    }

    /** Una entrega por la ruta de verdad (buzón incluido), con Stripe simulado. */
    function deliverMethodEvent(
      event: ConnectedAccountEvent,
      gateways: { reads?: FamilyPaymentMethodReads; setup?: FamilyPaymentGateway }
    ) {
      return handleFamilyCollectionEvent(event, {
        now: EVENT_NOW,
        handlers: {
          paymentMethod: (input) => processPaymentMethodEvent(input, { gateway: gateways.reads }),
          mandate: (input) => processMandateEvent(input, { gateway: gateways.reads }),
          setupIntent: (input) => processSetupIntentEvent(input, { gateway: gateways.setup }),
        },
      });
    }

    async function authorizationRows(invoice: Invoice) {
      const result = await db.execute(sql`
        select id::text as "id", status::text as "status", revoked_at is not null as "hasRevokedAt",
               payment_method_reference as "paymentMethod", provider_setup_reference as "setupReference",
               consent_evidence_reference as "evidenceReference"
          from zaltyko.family_payment_authorizations
         where organization_id = ${invoice.organizationId}::uuid
         order by created_at, id
      `);
      return result.rows as Array<Record<string, unknown>>;
    }

    async function auditRows(invoice: Invoice, action: string) {
      const result = await db.execute(sql`
        select target_id::text as "targetId", actor_user_id::text as "actorUserId",
               metadata->>'actor' as "actor", metadata->>'reason' as "reason", metadata->>'job_key' as "jobKey"
          from zaltyko.audit_log
         where organization_id = ${invoice.organizationId}::uuid and action = ${action}
         order by created_at, id
      `);
      return result.rows as Array<Record<string, unknown>>;
    }

    async function inboxEffect(eventId: string) {
      const result = await db.execute(sql`
        select status::text as "status", effect_type as "effectType", effect_id::text as "effectId"
          from zaltyko.payment_provider_events
         where provider_event_id = ${eventId}
      `);
      return result.rows[0] as Record<string, unknown> | undefined;
    }

    /** Lo que ve el proceso diario al ir a cobrar la factura (solo autorizaciones activas). */
    async function collectableAuthorization(invoice: Invoice) {
      const context = await createFamilyCollectionStore().loadInvoiceContext({
        organizationId: invoice.organizationId,
        invoiceId: invoice.invoiceId,
        environment: "test",
        now: EVENT_NOW,
      });
      return context?.authorization?.id ?? null;
    }

    it("payment_method.detached de un pm_ activo → revoked; el siguiente cobro no sale y el intento en curso sigue igual", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      await activateAuthorization(invoice, "card");
      const inFlight = `pi_CI${invoice.invoiceId.replace(/-/g, "").slice(0, 16)}flight`;
      const attemptId = await insertCreatedAttempt(invoice, inFlight);
      expect(await collectableAuthorization(invoice)).toBe(invoice.authorizationId);

      const reads = fakeMethodStripe(invoice, { customers: { [methodOf(invoice)]: null } });
      const event = methodEvent(invoice, "detached", "payment_method.detached", methodOf(invoice));
      expect(await deliverMethodEvent(event, { reads })).toBe("processed");

      expect(reads.retrievePaymentMethod).toHaveBeenCalledWith({
        connectedAccount: accountOf(invoice),
        paymentMethodId: methodOf(invoice),
      });
      expect(await authorizationRows(invoice)).toEqual([
        expect.objectContaining({ id: invoice.authorizationId, status: "revoked", hasRevokedAt: true }),
      ]);
      expect(await auditRows(invoice, "family_payment_methods.authorization_revoked")).toEqual([
        {
          targetId: invoice.authorizationId,
          actorUserId: null,
          actor: "system",
          reason: "detached_in_stripe",
          jobKey: "zaltyko-family-collection",
        },
      ]);
      expect(await inboxEffect(event.eventId)).toEqual({
        status: "processed",
        effectType: AUTHORIZATION_EFFECT_TYPE,
        effectId: invoice.authorizationId,
      });
      // El siguiente cobro no sale: el proceso diario ya no ve autorización activa.
      expect(await collectableAuthorization(invoice)).toBeNull();
      // El intento en curso no se toca: su dinero pudo moverse y lo cierra lo que diga Stripe.
      const attempt = await db.execute(sql`
        select status, provider_payment_intent_reference as "intent", failure_code as "failureCode"
          from zaltyko.family_collection_attempts where id = ${attemptId}::uuid
      `);
      expect(attempt.rows).toEqual([{ status: "created", intent: inFlight, failureCode: null }]);

      // El mismo evento → duplicate; otro aviso del mismo pm_ → processed sin efecto ni otra auditoría.
      expect(await deliverMethodEvent(event, { reads })).toBe("duplicate");
      const again = methodEvent(invoice, "again", "payment_method.detached", methodOf(invoice));
      expect(await deliverMethodEvent(again, { reads })).toBe("processed");
      expect(await inboxEffect(again.eventId)).toEqual({ status: "processed", effectType: null, effectId: null });
      expect(await auditRows(invoice, "family_payment_methods.authorization_revoked")).toHaveLength(1);
      expect(reads.retrievePaymentMethod).toHaveBeenCalledTimes(1);
    }, 60_000);

    it("payment_method.detached de un pm_ que Stripe aún tiene ligado → none", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      await activateAuthorization(invoice, "card");
      const reads = fakeMethodStripe(invoice, { customers: { [methodOf(invoice)]: `cus_CI${shortOf(invoice)}` } });
      const event = methodEvent(invoice, "attached", "payment_method.detached", methodOf(invoice));

      expect(await deliverMethodEvent(event, { reads })).toBe("processed");
      expect(await inboxEffect(event.eventId)).toEqual({ status: "processed", effectType: null, effectId: null });
      expect(await authorizationRows(invoice)).toEqual([
        expect.objectContaining({ id: invoice.authorizationId, status: "active", hasRevokedAt: false }),
      ]);
      expect(await auditRows(invoice, "family_payment_methods.authorization_revoked")).toEqual([]);
      expect(await collectableAuthorization(invoice)).toBe(invoice.authorizationId);
    }, 60_000);

    it("mandate.updated inactive → domiciliación revocada; active → none", async () => {
      const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
      await activateAuthorization(invoice, "sepa_debit");
      const state = { mandates: { [mandateOf(invoice)]: "active" } };
      const reads = fakeMethodStripe(invoice, state);

      const stillActive = methodEvent(invoice, "active", "mandate.updated", mandateOf(invoice));
      expect(await deliverMethodEvent(stillActive, { reads })).toBe("processed");
      expect(await inboxEffect(stillActive.eventId)).toEqual({ status: "processed", effectType: null, effectId: null });
      expect(await authorizationRows(invoice)).toEqual([expect.objectContaining({ status: "active" })]);

      state.mandates[mandateOf(invoice)] = "inactive";
      const inactive = methodEvent(invoice, "inactive", "mandate.updated", mandateOf(invoice));
      expect(await deliverMethodEvent(inactive, { reads })).toBe("processed");
      expect(await inboxEffect(inactive.eventId)).toEqual({
        status: "processed",
        effectType: AUTHORIZATION_EFFECT_TYPE,
        effectId: invoice.authorizationId,
      });
      expect(await authorizationRows(invoice)).toEqual([
        expect.objectContaining({ status: "revoked", hasRevokedAt: true }),
      ]);
      expect(await auditRows(invoice, "family_payment_methods.authorization_revoked")).toEqual([
        expect.objectContaining({ actorUserId: null, actor: "system", reason: "mandate_inactive" }),
      ]);
      expect(await collectableAuthorization(invoice)).toBeNull();
      expect(reads.retrievePaymentMethod).not.toHaveBeenCalled();
    }, 60_000);

    describe("preparación terminada con el navegador cerrado (decisión 12 del ADR)", () => {
      /** Plan de pago en vigor antes de EVENT_NOW (sin reloj: la fecha es fija). */
      async function payingAcademy(invoice: Invoice) {
        await db.execute(sql`
          update zaltyko.organization_entitlements
             set plan_code = 'network', source = 'contract', source_reference = ${`contract:${invoice.organizationId}`},
                 effective_from = '2026-01-01T00:00:00.000Z'::timestamptz
           where organization_id = ${invoice.organizationId}::uuid
        `);
      }

      /** Intento de preparación abierto (o completado con su autorización) de la persona pagadora. */
      async function insertSetupAttempt(
        invoice: Invoice,
        setupReference: string,
        completed: { authorizationId: string } | null = null
      ) {
        const result = await db.execute(sql`
          insert into zaltyko.family_payment_setup_attempts (
            organization_id, family_id, family_payer_id, guardian_id, payment_provider_account_id,
            payment_method_kind, provider_customer_reference, provider_setup_reference,
            consent_version, consent_text_sha256, consented_at, status, authorization_id
          )
          select ${invoice.organizationId}::uuid, ${invoice.familyId}::uuid, fp.id, fp.guardian_id, ${invoice.accountId}::uuid,
                 'card', ${`cus_CI${shortOf(invoice)}`}, ${setupReference},
                 'borrador-2026-11-16', ${SHA}, ${CLAIMED_AT}::timestamptz,
                 ${completed ? "completed" : "open"}, ${completed?.authorizationId ?? null}::uuid
            from zaltyko.family_payers fp
           where fp.organization_id = ${invoice.organizationId}::uuid and fp.id = ${invoice.payerId}::uuid
          returning id::text as id
        `);
        return (result.rows[0] as { id: string }).id;
      }

      /** Stripe simulado: la preparación terminada con su pm_ nuevo. */
      function fakeSetupStripe(invoice: Invoice, setupReference: string, attemptId: string) {
        return {
          createCustomer: vi.fn<FamilyPaymentGateway["createCustomer"]>(async () => {
            throw new Error("Un aviso nunca crea un cliente");
          }),
          createSetupIntent: vi.fn<FamilyPaymentGateway["createSetupIntent"]>(async () => {
            throw new Error("Un aviso nunca crea una preparación");
          }),
          retrieveSetupIntent: vi.fn<FamilyPaymentGateway["retrieveSetupIntent"]>(async (request) => {
            if (request.connectedAccount !== accountOf(invoice) || request.setupIntentId !== setupReference) {
              throw Object.assign(new Error("CI: preparación inexistente"), {
                type: "StripeInvalidRequestError",
                code: "resource_missing",
              });
            }
            return {
              id: setupReference,
              status: "succeeded",
              customer: `cus_CI${shortOf(invoice)}`,
              paymentMethod: `pm_CInew${shortOf(invoice)}`,
              paymentMethodType: "card",
              mandate: null,
              metadataAttemptId: attemptId,
              hasLastSetupError: false,
            };
          }),
          detachPaymentMethod: vi.fn<FamilyPaymentGateway["detachPaymentMethod"]>(async () => undefined),
        } satisfies FamilyPaymentGateway;
      }

      it("setup_intent.succeeded con el navegador cerrado → autorización activa una sola vez", async () => {
        const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
        await payingAcademy(invoice);
        const setupReference = `seti_CInew${shortOf(invoice)}`;
        const attemptId = await insertSetupAttempt(invoice, setupReference);
        const setup = fakeSetupStripe(invoice, setupReference, attemptId);
        // Antes: la autorización de la factura está pendiente; nada que cobrar.
        expect(await collectableAuthorization(invoice)).toBeNull();

        const event = methodEvent(invoice, "setup", "setup_intent.succeeded", setupReference);
        expect(await deliverMethodEvent(event, { setup })).toBe("processed");

        const rows = await authorizationRows(invoice);
        const activated = rows.find((row) => row.setupReference === setupReference);
        expect(activated).toMatchObject({
          status: "active",
          paymentMethod: `pm_CInew${shortOf(invoice)}`,
          evidenceReference: `family_payment_setup_attempts:${attemptId}`,
        });
        expect(rows.filter((row) => row.status === "active")).toHaveLength(1);
        const completed = await db.execute(sql`
          select status, authorization_id::text as "authorizationId"
            from zaltyko.family_payment_setup_attempts where id = ${attemptId}::uuid
        `);
        expect(completed.rows).toEqual([{ status: "completed", authorizationId: activated?.id }]);
        expect(await inboxEffect(event.eventId)).toEqual({
          status: "processed",
          effectType: AUTHORIZATION_EFFECT_TYPE,
          effectId: activated?.id,
        });
        expect(await auditRows(invoice, "family_payment_methods.authorization_activated")).toEqual([
          { targetId: activated?.id, actorUserId: null, actor: "system", reason: null, jobKey: "zaltyko-family-collection" },
        ]);
        // El proceso diario ya puede cobrar con ella (y con su cliente).
        expect(await collectableAuthorization(invoice)).toBe(activated?.id);

        // Otro aviso de la misma preparación: ya completada → sin Stripe ni otra autorización.
        const again = methodEvent(invoice, "setupagain", "setup_intent.succeeded", setupReference);
        expect(await deliverMethodEvent(again, { setup })).toBe("processed");
        expect(await inboxEffect(again.eventId)).toEqual({ status: "processed", effectType: null, effectId: null });
        expect(setup.retrieveSetupIntent).toHaveBeenCalledTimes(1);
        expect((await authorizationRows(invoice)).filter((row) => row.status === "active")).toHaveLength(1);
        expect(await auditRows(invoice, "family_payment_methods.authorization_activated")).toHaveLength(1);
        expect(setup.detachPaymentMethod).not.toHaveBeenCalled();
      }, 60_000);

      it("dos avisos de la misma preparación a la vez → una sola autorización activa", async () => {
        const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
        await payingAcademy(invoice);
        const setupReference = `seti_CIrace${shortOf(invoice)}`;
        const attemptId = await insertSetupAttempt(invoice, setupReference);
        const setup = fakeSetupStripe(invoice, setupReference, attemptId);
        const account = await findConnectAccountByReference(db, "test", accountOf(invoice));
        if (!account) throw new Error("CI: falta la cuenta conectada de la factura");
        const input = (eventId: string): ProviderEventHandlerInput => ({
          organizationId: invoice.organizationId,
          account,
          objectId: setupReference,
          now: EVENT_NOW,
          inboxId: randomUUID(),
          eventId,
        });

        const effects = await Promise.all([
          processSetupIntentEvent(input("evt_CIrace1"), { gateway: setup }),
          processSetupIntentEvent(input("evt_CIrace2"), { gateway: setup }),
        ]);
        expect(effects.filter((effect) => effect.effectType === AUTHORIZATION_EFFECT_TYPE)).toHaveLength(1);
        expect(effects.filter((effect) => effect.effectType === null)).toHaveLength(1);
        expect((await authorizationRows(invoice)).filter((row) => row.status === "active")).toHaveLength(1);
        expect(await auditRows(invoice, "family_payment_methods.authorization_activated")).toHaveLength(1);
      }, 60_000);

      it("setup_intent.succeeded de una preparación ya completada → none", async () => {
        const invoice = await createCollectableInvoice({ registry, collectionMode: "automatic" });
        await payingAcademy(invoice);
        await activateAuthorization(invoice, "card");
        // La preparación que creó la autorización de la factura, ya completada (por el navegador).
        const setupReference = `seti_CI${shortOf(invoice)}`;
        const attemptId = await insertSetupAttempt(invoice, setupReference, { authorizationId: invoice.authorizationId });
        const setup = fakeSetupStripe(invoice, setupReference, attemptId);

        const event = methodEvent(invoice, "done", "setup_intent.succeeded", setupReference);
        expect(await deliverMethodEvent(event, { setup })).toBe("processed");
        expect(await inboxEffect(event.eventId)).toEqual({ status: "processed", effectType: null, effectId: null });
        expect(setup.retrieveSetupIntent).not.toHaveBeenCalled();
        expect(await authorizationRows(invoice)).toEqual([
          expect.objectContaining({ id: invoice.authorizationId, status: "active", hasRevokedAt: false }),
        ]);
        expect(await auditRows(invoice, "family_payment_methods.authorization_activated")).toEqual([]);
      }, 60_000);
    });
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
