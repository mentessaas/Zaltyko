import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  allocatePayment,
  recordManualPayment,
  recordManualPaymentForCharge,
} from "@/modules/billing/application/ledger-service";
import {
  cancelAutomaticCollection,
  markAutomaticCollectionReviewed,
  type AcademyCollectionGateway,
} from "@/modules/family-collection/application/family-collection-academy-actions";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import type { PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import { createFamilyCollectionStore } from "@/modules/family-collection/infrastructure/family-collection-store";
import type { FamilyCollectionGateway } from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { loadReminderCandidates } from "@/modules/payment-reminders/application/candidates";
import { isPaymentRemindersStorageAvailable } from "@/modules/payment-reminders/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";

/**
 * Cobro automático (Fase 3), Tarea 7, sobre PostgreSQL desechable de GitHub,
 * con Stripe simulado: el pago manual frente a un cobro automático (409 o
 * cancelación del reintento, sin bloqueos mutuos por el orden único), las
 * acciones de la academia (cancelar y marcar como revisado) y la espera de
 * los recordatorios. Instala las candidatas que falten (Fases 1, 2 y 3 y la
 * de recordatorios) y al terminar borra las filas de sus academias (quedan
 * academias, sedes y usuarios, a los que apunta la auditoría) y retira solo
 * lo que instaló. Nunca en un proyecto enlazado ni con credenciales
 * externas.
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

/** Las candidatas de las Fases 2 y 3 abren su propia transacción: conexión propia. */
async function runOnOwnConnection(text: string): Promise<void> {
  const client = new Client({ connectionString: process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

const FLAG = "ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED";
const SHA = "b".repeat(64);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const compact = () => randomUUID().replace(/-/g, "").slice(0, 20);
const wait = (ms: number) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

/**
 * Stripe simulado: cada cobro con el estado que diga la prueba. Un cobro hecho
 * dice haber cobrado `receivedCents` en euros (por defecto, la cuota de 45 €).
 */
function fakeStripe(statuses: Record<string, string> = {}, receivedCents = 4500) {
  const snapshot = (id: string): PaymentIntentSnapshot => {
    const status = statuses[id] ?? "requires_confirmation";
    return {
      id,
      status,
      lastErrorCode: null,
      lastDeclineCode: null,
      amountReceivedCents: status === "succeeded" ? receivedCents : 0,
      currency: "EUR",
    };
  };
  return {
    createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(async () => {
      throw new Error("no se crea nada en estas pruebas");
    }),
    confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(async () => {
      throw new Error("no se confirma nada en estas pruebas");
    }),
    retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async (input) =>
      snapshot(input.paymentIntentId)
    ),
    findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async () => null),
    listPaymentsByAttempt: vi.fn<AcademyCollectionGateway["listPaymentsByAttempt"]>(async () => []),
    cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(async (input) => {
      statuses[input.paymentIntentId] = "canceled";
      return "canceled";
    }),
  };
}

describeDisposablePg("cobro automático frente al pago manual y la academia en Postgres desechable", () => {
  const createdOrganizations: string[] = [];
  let connectOnboardingInstalledHere = false;
  let familyPaymentMethodsInstalledHere = false;
  let candidateInstalledHere = false;
  let remindersInstalledHere = false;

  /** `delete` de una tabla de zaltyko acotado a las academias de la suite. */
  function deleteScoped(table: string) {
    // Lista como texto: Drizzle expandiría un array en una lista de parámetros.
    return db.execute(sql`
      delete from ${sql.identifier("zaltyko")}.${sql.identifier(table)}
       where organization_id = any(string_to_array(${createdOrganizations.join(",")}, ',')::uuid[])
    `);
  }

  beforeAll(async () => {
    assertDisposableTarget();
    if (!(await isConnectOnboardingStorageAvailable())) {
      await db.execute(sql.raw(readCandidate("20261116120000_connect_onboarding_candidate.sql")));
      connectOnboardingInstalledHere = true;
    }
    if (!(await isFamilyPaymentMethodsStorageAvailable())) {
      await runOnOwnConnection(readCandidate("20261116180000_family_payment_methods_candidate.sql"));
      familyPaymentMethodsInstalledHere = true;
    }
    if (!(await isFamilyCollectionStorageAvailable())) {
      await runOnOwnConnection(readCandidate("20261117120000_family_collection_candidate.sql"));
      candidateInstalledHere = true;
    }
    if (!(await isPaymentRemindersStorageAvailable(db))) {
      await db.execute(sql.raw(readCandidate("20261114120500_payment_reminders_candidate.sql")));
      remindersInstalledHere = true;
    }
    vi.stubEnv(FLAG, "true");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (!disposablePgEnabled) return;
    // Todas las filas de la suite, en orden de claves foráneas. La auditoría
    // es solo de añadir y apunta a las sedes y a las personas (los pagos
    // manuales y las acciones de la academia se auditan con quien los hizo),
    // así que sedes, academias y usuarios de prueba quedan.
    if (createdOrganizations.length > 0) {
      if (await isFamilyCollectionStorageAvailable()) {
        for (const table of [
          "family_collection_attempt_charges",
          "family_collection_attempts",
          "organization_collection_settings",
        ]) {
          await deleteScoped(table);
        }
      }
      for (const table of [
        "payment_allocations",
        "payments",
        "charges",
        "invoice_lines",
        "invoices",
        "family_collection_preferences",
        "family_payment_setup_attempts",
        "family_payment_authorizations",
        "organization_payment_provider_accounts",
        "outbox_events",
        "family_payers",
        "family_guardians",
        "guardians",
        "people",
        "families",
        "organization_members",
      ]) {
        await deleteScoped(table);
      }
    }
    if (remindersInstalledHere) {
      await db.execute(sql`drop table if exists zaltyko.payment_reminders`);
      await db.execute(sql`drop table if exists zaltyko.payment_reminder_settings`);
    }
    if (candidateInstalledHere) {
      await db.execute(sql`drop table if exists zaltyko.family_collection_attempt_charges`);
      await db.execute(sql`drop table if exists zaltyko.family_collection_attempts`);
      await db.execute(sql`drop table if exists zaltyko.organization_collection_settings`);
    }
    if (familyPaymentMethodsInstalledHere) {
      await db.execute(sql`drop table if exists zaltyko.family_payment_setup_attempts`);
      await db.execute(sql`alter table zaltyko.family_payment_authorizations drop column if exists payment_method_kind`);
    }
    if (connectOnboardingInstalledHere) {
      await db.execute(sql`
        alter table zaltyko.organization_payment_provider_accounts
          drop column if exists sepa_debit_payments_capability_status,
          drop column if exists requirements_state
      `);
    }
  });

  /**
   * Academia con plan de pago, cuenta conectada lista, familia con pagador
   * vigente, tarjeta activa y su Customer, preferencia automática y una
   * factura mensual emitida con una cuota automática vencida.
   */
  async function createFixture(input: { dueDaysAgo?: number; amount?: number } = {}) {
    const amount = input.amount ?? 4500;
    const organizationId = randomUUID();
    const locationId = randomUUID();
    const userId = randomUUID();
    const memberId = randomUUID();
    const familyId = randomUUID();
    const guardianId = randomUUID();
    const payerId = randomUUID();
    const accountRowId = randomUUID();
    const authorizationId = randomUUID();
    const invoiceId = randomUUID();
    const lineId = randomUUID();
    const chargeId = randomUUID();
    const short = compact();
    const now = new Date();

    await db.execute(sql`
      insert into zaltyko.organizations (id, name, status, default_timezone, default_currency)
      values (${organizationId}::uuid, ${`CI Acciones cobro ${short}`}, 'active'::zaltyko.organization_status, 'Europe/Madrid', 'EUR')
    `);
    createdOrganizations.push(organizationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (${locationId}::uuid, ${organizationId}::uuid, ${`aa-${short}`}, 'Sede CI', 'Europe/Madrid')
    `);
    await db.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-collection-actions-${userId}@example.invalid`})`);
    await db.execute(sql`
      insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
      values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'owner', 'active', 'all')
    `);
    await db.execute(sql`
      update zaltyko.organization_entitlements
         set plan_code = 'growth', source = 'contract', source_reference = ${`contract:${organizationId}`}
       where organization_id = ${organizationId}::uuid
    `);
    await db.execute(sql`insert into zaltyko.families (id, organization_id, is_active) values (${familyId}::uuid, ${organizationId}::uuid, true)`);
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (${guardianId}::uuid, ${organizationId}::uuid, 'Tutor', 'Acciones Cobro')
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
        card_payments_capability_status, sepa_debit_payments_capability_status, requirements_state, last_synced_at
      ) values (
        ${accountRowId}::uuid, ${organizationId}::uuid, 'test'::zaltyko.stripe_environment, ${`acct_CI${short}`},
        'active'::zaltyko.organization_payment_account_status, 'active', 'active', 'none', ${now.toISOString()}::timestamptz
      )
    `);
    await db.execute(sql`
      insert into zaltyko.family_payment_authorizations (
        id, organization_id, family_id, family_payer_id, payment_provider_account_id, status,
        provider_setup_reference, payment_method_reference, mandate_reference, payment_method_kind,
        consent_version, consent_evidence_reference, consent_evidence_sha256, consented_at, consented_by_guardian_id
      ) values (
        ${authorizationId}::uuid, ${organizationId}::uuid, ${familyId}::uuid, ${payerId}::uuid, ${accountRowId}::uuid,
        'active'::zaltyko.payment_authorization_status, ${`seti_CI${short}`}, ${`pm_CI${short}`}, null, 'card',
        'borrador-2026-11-16', ${`attempt:${short}`}, ${SHA}, ${new Date(now.getTime() - DAY).toISOString()}::timestamptz,
        ${guardianId}::uuid
      )
    `);
    await db.execute(sql`
      insert into zaltyko.family_payment_setup_attempts (
        organization_id, family_id, family_payer_id, guardian_id, payment_provider_account_id,
        payment_method_kind, provider_customer_reference, provider_setup_reference,
        consent_version, consent_text_sha256, consented_at, status, authorization_id
      ) values (
        ${organizationId}::uuid, ${familyId}::uuid, ${payerId}::uuid, ${guardianId}::uuid, ${accountRowId}::uuid,
        'card', ${`cus_CI${short}`}, ${`seti_CI${short}`},
        'borrador-2026-11-16', ${SHA}, ${new Date(now.getTime() - DAY).toISOString()}::timestamptz, 'completed', ${authorizationId}::uuid
      )
    `);

    const dueAt = new Date(now.getTime() - (input.dueDaysAgo ?? 3) * DAY).toISOString();
    await db.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, family_payer_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values (
        ${invoiceId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${familyId}::uuid, ${payerId}::uuid,
        ${`MENSUAL-CI-${short}`}, 'issued', 'EUR', ${amount}, now(), ${dueAt}::timestamptz, ${`ci-actions-inv-${invoiceId}`}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.invoice_lines (
        id, organization_id, invoice_id, location_id, line_type, quantity,
        unit_amount_cents, amount_cents, currency, service_period_start, service_period_end
      ) values (
        ${lineId}::uuid, ${organizationId}::uuid, ${invoiceId}::uuid, ${locationId}::uuid,
        'monthly_fee', 1, ${amount}, ${amount}, 'EUR', '2026-11-01'::date, '2026-11-30'::date
      )
    `);
    await db.execute(sql`
      insert into zaltyko.charges (
        id, organization_id, location_id, invoice_id, invoice_line_id, family_id, family_payer_id,
        collection_mode, status, amount_cents, currency, due_at, service_period_start, service_period_end, idempotency_key
      ) values (
        ${chargeId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${invoiceId}::uuid, ${lineId}::uuid,
        ${familyId}::uuid, ${payerId}::uuid, 'automatic', 'due'::zaltyko.charge_status,
        ${amount}, 'EUR', ${dueAt}::timestamptz, '2026-11-01'::date, '2026-11-30'::date, ${`ci-actions-charge-${chargeId}`}
      )
    `);
    return {
      organizationId,
      locationId,
      userId,
      memberId,
      familyId,
      payerId,
      accountRowId,
      authorizationId,
      invoiceId,
      chargeId,
      amount,
      connectedAccount: `acct_CI${short}`,
    };
  }

  type Fixture = Awaited<ReturnType<typeof createFixture>>;

  /** Intento de cobro escrito a mano con un estado válido para la candidata, con su reparto. */
  async function insertAttempt(
    fixture: Fixture,
    input: {
      status: "claimed" | "created" | "processing" | "failed" | "canceled";
      attemptNumber?: number;
      paymentIntentId?: string | null;
      nextRetryAt?: Date | null;
      resumeCount?: number;
      /** Último cambio (`updated_at`); por defecto, ahora. */
      updatedAt?: Date;
    }
  ): Promise<{ attemptId: string; paymentIntentId: string | null }> {
    const attemptId = randomUUID();
    const status = input.status;
    const paymentIntentId =
      input.paymentIntentId !== undefined
        ? input.paymentIntentId
        : status === "claimed"
          ? null
          : `pi_CI${compact()}`;
    const terminal = status === "failed" || status === "canceled";
    await db.execute(sql`
      insert into zaltyko.family_collection_attempts (
        id, organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
        payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
        provider_payment_intent_reference, failure_code, decline_code, next_retry_at, resume_count,
        claimed_at, completed_at, created_at, updated_at
      ) values (
        ${attemptId}::uuid, ${fixture.organizationId}::uuid, ${fixture.locationId}::uuid, ${fixture.invoiceId}::uuid,
        ${fixture.familyId}::uuid, ${fixture.payerId}::uuid, ${fixture.authorizationId}::uuid, ${fixture.accountRowId}::uuid,
        ${input.attemptNumber ?? 1}, 'card', ${fixture.amount}, 'EUR', ${status},
        ${paymentIntentId}, ${terminal ? "card_declined" : null}, ${terminal ? "insufficient_funds" : null},
        ${input.nextRetryAt ? input.nextRetryAt.toISOString() : null}::timestamptz, ${input.resumeCount ?? 0},
        coalesce(${input.updatedAt ? input.updatedAt.toISOString() : null}::timestamptz, now() - interval '1 hour'),
        ${terminal ? new Date().toISOString() : null}::timestamptz, now(),
        coalesce(${input.updatedAt ? input.updatedAt.toISOString() : null}::timestamptz, now())
      )
    `);
    await db.execute(sql`
      insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
      values (${attemptId}::uuid, ${fixture.organizationId}::uuid, ${fixture.chargeId}::uuid, ${fixture.amount})
    `);
    return { attemptId, paymentIntentId };
  }

  async function attemptRow(attemptId: string) {
    const result = await db.execute(sql`
      select status, failure_code as "failureCode", next_retry_at as "nextRetryAt",
             provider_payment_intent_reference as "intent", payment_id::text as "paymentId",
             completed_at as "completedAt"
        from zaltyko.family_collection_attempts
       where id = ${attemptId}::uuid
    `);
    return result.rows[0] as {
      status: string;
      failureCode: string | null;
      nextRetryAt: Date | string | null;
      intent: string | null;
      paymentId: string | null;
      completedAt: Date | string | null;
    };
  }

  async function chargeStatus(fixture: Fixture): Promise<string> {
    const result = await db.execute(sql`
      select status::text as status from zaltyko.charges
       where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.chargeId}::uuid
    `);
    return (result.rows[0] as { status: string }).status;
  }

  async function auditActions(fixture: Fixture, targetId: string) {
    const result = await db.execute(sql`
      select action, actor_user_id::text as "actorUserId", metadata
        from zaltyko.audit_log
       where organization_id = ${fixture.organizationId}::uuid and target_id = ${targetId}::uuid
       order by created_at
    `);
    return result.rows as Array<{ action: string; actorUserId: string | null; metadata: Record<string, unknown> }>;
  }

  async function outboxCount(fixture: Fixture, eventName: string): Promise<number> {
    const result = await db.execute(sql`
      select count(*)::int as n from zaltyko.outbox_events
       where organization_id = ${fixture.organizationId}::uuid and event_name = ${eventName}
    `);
    return (result.rows[0] as { n: number }).n;
  }

  function manualPayment(fixture: Fixture, key = `ci-manual-${compact()}`) {
    return recordManualPaymentForCharge({
      organizationId: fixture.organizationId,
      chargeId: fixture.chargeId,
      amountCents: fixture.amount,
      method: "cash",
      receivedAt: new Date().toISOString(),
      idempotencyKey: key,
      actor: { userId: fixture.userId, memberId: fixture.memberId },
    });
  }

  /**
   * El proceso diario reclamando un intento, con el orden único (academia →
   * cuotas → factura → intento), y la transacción abierta hasta `release()`.
   */
  async function holdWorkerClaim(fixture: Fixture, attemptNumber: number) {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolveRelease) => {
      release = resolveRelease;
    });
    let holding: () => void = () => undefined;
    const held = new Promise<void>((resolveHeld) => {
      holding = resolveHeld;
    });
    const safety = setTimeout(() => release(), 15_000);
    let holderPid = 0;
    const done = db
      .transaction(async (tx) => {
        const backend = await tx.execute(sql`select pg_backend_pid() as pid`);
        holderPid = Number((backend.rows[0] as { pid: unknown }).pid);
        await tx.execute(sql`select id from zaltyko.organizations where id = ${fixture.organizationId}::uuid for update`);
        await tx.execute(sql`
          select id from zaltyko.charges
           where organization_id = ${fixture.organizationId}::uuid and invoice_id = ${fixture.invoiceId}::uuid
           order by id for update
        `);
        await tx.execute(sql`
          select id from zaltyko.invoices
           where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.invoiceId}::uuid for update
        `);
        await tx.execute(sql`
          insert into zaltyko.family_collection_attempts (
            organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
            payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status
          ) values (
            ${fixture.organizationId}::uuid, ${fixture.locationId}::uuid, ${fixture.invoiceId}::uuid, ${fixture.familyId}::uuid,
            ${fixture.payerId}::uuid, ${fixture.authorizationId}::uuid, ${fixture.accountRowId}::uuid, ${attemptNumber}, 'card',
            ${fixture.amount}, 'EUR', 'claimed'
          )
        `);
        holding();
        await released;
      })
      .finally(() => clearTimeout(safety));
    await held;
    return { release: () => release(), done, pid: holderPid };
  }

  /**
   * Espera hasta ver en PostgreSQL otra sesión bloqueada en un cerrojo de fila
   * de la academia (`wait_event_type = 'Lock'`) por la transacción `holderPid`
   * de esta prueba (`pg_blocking_pids`), que tiene la fila de su academia: no
   * cuenta esperas de otras academias o suites. Prueba que la operación
   * concurrente de verdad esperó, en vez de suponerlo con un tiempo fijo.
   */
  async function waitForOrganizationLockWaiter(holderPid: number): Promise<boolean> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const result = await db.execute(sql`
        select count(*)::int as n
          from pg_stat_activity
         where datname = current_database()
           and pid <> pg_backend_pid()
           and wait_event_type = 'Lock'
           and query like '%from zaltyko.organizations%'
           and query like '%for update%'
           and ${holderPid}::int = any(pg_blocking_pids(pid))
      `);
      if ((result.rows[0] as { n: number }).n > 0) return true;
      await wait(50);
    }
    return false;
  }

  describe("pago manual frente al cobro automático", () => {
    it("un cobro reclamado que tiene los cerrojos: el pago manual espera y sale con 409, sin bloqueo mutuo", async () => {
      const fixture = await createFixture();
      const worker = await holdWorkerClaim(fixture, 1);
      const manual = manualPayment(fixture).then(
        () => null,
        (error: unknown) => error
      );
      // El pago manual de verdad espera el cerrojo de la academia.
      const waited = await waitForOrganizationLockWaiter(worker.pid);
      worker.release();
      await worker.done;

      expect(waited).toBe(true);
      expect(await manual).toMatchObject({ code: "AUTOMATIC_COLLECTION_IN_PROGRESS", status: 409 });
      expect(await chargeStatus(fixture)).toBe("due");
    });

    it("reclamar y pagar a mano a la vez: los dos terminan y solo gana uno", async () => {
      const store = createFamilyCollectionStore();
      for (let round = 0; round < 3; round += 1) {
        const fixture = await createFixture();
        const [claim, manual] = await Promise.allSettled([
          store.claimOrCancel(
            {
              organizationId: fixture.organizationId,
              invoiceId: fixture.invoiceId,
              authorizationId: fixture.authorizationId,
              paymentProviderAccountId: fixture.accountRowId,
              paymentMethodKind: "card",
              now: new Date(),
            },
            (snapshot) =>
              snapshot.history.openExists || snapshot.charges.some((charge) => charge.status !== "due")
                ? { action: "skip", reason: "settled" }
                : {
                    action: "claimed",
                    attemptNumber: 1,
                    amountCents: fixture.amount,
                    allocations: [{ chargeId: fixture.chargeId, amountCents: fixture.amount }],
                  }
          ),
          manualPayment(fixture),
        ]);
        expect(claim.status).toBe("fulfilled");
        const claimed = claim.status === "fulfilled" && claim.value.outcome === "claimed";
        if (claimed) {
          expect(manual).toMatchObject({ status: "rejected", reason: { code: "AUTOMATIC_COLLECTION_IN_PROGRESS" } });
          expect(await chargeStatus(fixture)).toBe("due");
        } else {
          expect(manual.status).toBe("fulfilled");
          expect(claim).toMatchObject({ status: "fulfilled", value: { outcome: "skipped", reason: "settled" } });
          expect(await chargeStatus(fixture)).toBe("paid");
        }
      }
    }, 60_000);

    it("con un reintento pendiente, el pago manual lo cancela en la misma transacción", async () => {
      const fixture = await createFixture();
      const { attemptId } = await insertAttempt(fixture, {
        status: "failed",
        nextRetryAt: new Date(Date.now() + 3 * DAY),
      });

      const { payment } = await manualPayment(fixture);

      expect(payment.status).toBe("succeeded");
      expect(await chargeStatus(fixture)).toBe("paid");
      expect(await attemptRow(attemptId)).toMatchObject({
        status: "canceled",
        failureCode: "manual_payment",
        nextRetryAt: null,
      });
      expect(await outboxCount(fixture, "family_collection.attempt_canceled")).toBe(1);
      expect(await auditActions(fixture, attemptId)).toEqual([
        expect.objectContaining({ action: "family_collection.attempt_canceled", actorUserId: fixture.userId }),
      ]);
    });

    it("el reparto de un pago ya registrado también se bloquea con un cobro en curso", async () => {
      const fixture = await createFixture();
      await insertAttempt(fixture, { status: "processing" });
      const payment = await recordManualPayment({
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        familyId: fixture.familyId,
        familyPayerId: fixture.payerId,
        amountCents: fixture.amount,
        currency: "EUR",
        method: "bank_transfer",
        receivedAt: new Date().toISOString(),
        idempotencyKey: `ci-unallocated-${compact()}`,
        actor: { userId: fixture.userId, memberId: fixture.memberId },
      });

      await expect(
        allocatePayment({
          organizationId: fixture.organizationId,
          paymentId: payment.id,
          chargeId: fixture.chargeId,
          amountCents: fixture.amount,
          allocatedAt: new Date().toISOString(),
          idempotencyKey: `ci-allocation-${compact()}`,
          actor: { userId: fixture.userId, memberId: fixture.memberId },
        })
      ).rejects.toMatchObject({ code: "AUTOMATIC_COLLECTION_IN_PROGRESS", status: 409 });
      expect(await chargeStatus(fixture)).toBe("due");
    });

    it("con la bandera apagada, un cobro en curso sigue bloqueando y un fallo final no", async () => {
      vi.stubEnv(FLAG, "false");
      try {
        const inFlight = await createFixture();
        await insertAttempt(inFlight, { status: "processing" });
        await expect(manualPayment(inFlight)).rejects.toMatchObject({ code: "AUTOMATIC_COLLECTION_IN_PROGRESS" });

        const final = await createFixture();
        const { attemptId } = await insertAttempt(final, { status: "failed", nextRetryAt: null });
        await expect(manualPayment(final)).resolves.toMatchObject({ payment: { status: "succeeded" } });
        expect(await attemptRow(attemptId)).toMatchObject({ status: "failed", failureCode: "card_declined" });
      } finally {
        vi.stubEnv(FLAG, "true");
      }
    });
  });

  describe("acciones de la academia", () => {
    it("cancelar un reintento mientras el proceso diario lo reclama: 409 para recargar y el intento nuevo sigue", async () => {
      const fixture = await createFixture();
      const { attemptId: failedId } = await insertAttempt(fixture, {
        status: "failed",
        nextRetryAt: new Date(Date.now() - DAY),
      });
      const gateway = fakeStripe();

      // El proceso diario reclama el reintento (intento 2) y todavía no ha confirmado.
      const worker = await holdWorkerClaim(fixture, 2);
      // La academia ve el reintento pendiente (el intento 2 aún no es visible)
      // y espera el cerrojo de la academia para cerrarlo.
      const cancel = cancelAutomaticCollection(
        { userId: fixture.userId, organizationId: fixture.organizationId, invoiceId: fixture.invoiceId },
        { gateway }
      ).then(
        () => null,
        (error: unknown) => error
      );
      const waited = await waitForOrganizationLockWaiter(worker.pid);
      worker.release();
      await worker.done;

      expect(waited).toBe(true);
      expect(await cancel).toMatchObject({
        code: "CONCURRENCY_RETRY",
        status: 409,
        message: "El cobro automático de esta cuota cambió o acaba de empezar. Recarga la página y vuelve a intentarlo.",
      });
      // Nada se cerró: el reintento sigue como estaba y el intento nuevo, reclamado.
      expect(await attemptRow(failedId)).toMatchObject({ status: "failed", failureCode: "card_declined" });
      expect((await attemptRow(failedId)).nextRetryAt).not.toBeNull();
      const claimed = await db.execute(sql`
        select status from zaltyko.family_collection_attempts
         where organization_id = ${fixture.organizationId}::uuid and invoice_id = ${fixture.invoiceId}::uuid
           and attempt_number = 2
      `);
      expect(claimed.rows).toEqual([{ status: "claimed" }]);
      expect(await auditActions(fixture, failedId)).toEqual([]);
    });

    it("cancelar un reintento pendiente lo cierra como canceled_by_academy, con auditoría de la persona", async () => {
      const fixture = await createFixture();
      const { attemptId } = await insertAttempt(fixture, {
        status: "failed",
        nextRetryAt: new Date(Date.now() + 3 * DAY),
      });
      const gateway = fakeStripe();

      await expect(
        cancelAutomaticCollection(
          { userId: fixture.userId, organizationId: fixture.organizationId, invoiceId: fixture.invoiceId },
          { gateway }
        )
      ).resolves.toEqual({ outcome: "canceled" });

      expect(await attemptRow(attemptId)).toMatchObject({
        status: "canceled",
        failureCode: "canceled_by_academy",
        nextRetryAt: null,
      });
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      const audit = await auditActions(fixture, attemptId);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: "family_collection.attempt_canceled",
        actorUserId: fixture.userId,
        metadata: { memberId: fixture.memberId },
      });
    });

    it("cancelar un cobro creado sin confirmar: primero se cancela en Stripe y después se cierra", async () => {
      const fixture = await createFixture();
      const { attemptId, paymentIntentId } = await insertAttempt(fixture, { status: "created" });
      const gateway = fakeStripe();

      await expect(
        cancelAutomaticCollection(
          { userId: fixture.userId, organizationId: fixture.organizationId, invoiceId: fixture.invoiceId },
          { gateway }
        )
      ).resolves.toEqual({ outcome: "canceled" });

      expect(gateway.cancelPayment).toHaveBeenCalledWith({
        connectedAccount: fixture.connectedAccount,
        paymentIntentId,
      });
      expect(await attemptRow(attemptId)).toMatchObject({
        status: "canceled",
        failureCode: "canceled_by_academy",
        intent: paymentIntentId,
      });
    });

    it("un cobro en curso en el banco no se puede cancelar", async () => {
      const fixture = await createFixture();
      const { attemptId } = await insertAttempt(fixture, { status: "processing" });
      const gateway = fakeStripe();

      await expect(
        cancelAutomaticCollection(
          { userId: fixture.userId, organizationId: fixture.organizationId, invoiceId: fixture.invoiceId },
          { gateway }
        )
      ).rejects.toMatchObject({ code: "AUTOMATIC_COLLECTION_PROCESSING", status: 409 });
      expect(gateway.retrievePayment).not.toHaveBeenCalled();
      expect(await attemptRow(attemptId)).toMatchObject({ status: "processing", completedAt: null });
    });

    it("marcar como revisado: solo con aviso o reanudaciones agotadas, y lo cierra como reviewed_by_academy", async () => {
      const fixture = await createFixture();
      const { attemptId, paymentIntentId } = await insertAttempt(fixture, { status: "created" });
      const gateway = fakeStripe();
      const input = {
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        invoiceId: fixture.invoiceId,
        checkedInStripe: true,
      };

      await expect(markAutomaticCollectionReviewed(input, { gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_REVIEW_NOT_NEEDED",
      });

      await createFamilyCollectionStore().recordNotice({
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        attemptId,
        invoiceId: fixture.invoiceId,
        reason: "idempotency_conflict",
        now: new Date(),
      });
      await expect(markAutomaticCollectionReviewed(input, { gateway })).resolves.toEqual({ outcome: "reviewed" });

      expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount: fixture.connectedAccount, paymentIntentId });
      expect(await attemptRow(attemptId)).toMatchObject({ status: "canceled", failureCode: "reviewed_by_academy" });
      expect(await auditActions(fixture, attemptId)).toEqual([
        expect.objectContaining({ action: "family_collection.attempt_reviewed", actorUserId: fixture.userId }),
      ]);
    });

    it("abierto más de 24 h sin aviso (el proceso diario dejó de pasar): marcar como revisado lee Stripe antes de cerrar", async () => {
      const input = (fixture: Fixture) => ({
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        invoiceId: fixture.invoiceId,
        checkedInStripe: true,
      });
      const stale = new Date(Date.now() - 25 * HOUR);

      // Sin dinero movido: se cancela en Stripe y se cierra como revisado.
      const quiet = await createFixture();
      const { attemptId: quietId, paymentIntentId: quietIntent } = await insertAttempt(quiet, {
        status: "created",
        updatedAt: stale,
      });
      const quietGateway = fakeStripe();
      await expect(markAutomaticCollectionReviewed(input(quiet), { gateway: quietGateway })).resolves.toEqual({
        outcome: "reviewed",
      });
      expect(quietGateway.retrievePayment).toHaveBeenCalled();
      expect(quietGateway.cancelPayment).toHaveBeenCalledWith({
        connectedAccount: quiet.connectedAccount,
        paymentIntentId: quietIntent,
      });
      expect(await attemptRow(quietId)).toMatchObject({ status: "canceled", failureCode: "reviewed_by_academy" });

      // El dinero ya salió: se registra el pago y el intento nunca se cierra sin él.
      const moved = await createFixture();
      const movedIntent = `pi_CI${compact()}`;
      const { attemptId: movedId } = await insertAttempt(moved, {
        status: "created",
        paymentIntentId: movedIntent,
        updatedAt: stale,
      });
      const movedGateway = fakeStripe({ [movedIntent]: "succeeded" });
      await expect(markAutomaticCollectionReviewed(input(moved), { gateway: movedGateway })).resolves.toEqual({
        outcome: "collected",
      });
      expect(movedGateway.cancelPayment).not.toHaveBeenCalled();
      expect((await attemptRow(movedId)).status).toBe("succeeded");
      expect(await chargeStatus(moved)).toBe("paid");
    });

    it("en curso hace más de 15 días y Stripe no deja leerlo (error permanente): 409 para soporte y el intento sigue en curso", async () => {
      const fixture = await createFixture();
      const { attemptId } = await insertAttempt(fixture, {
        status: "processing",
        // También fija claimed_at: reclamado hace 16 días, sin aviso.
        updatedAt: new Date(Date.now() - 16 * DAY),
      });
      const gateway = fakeStripe();
      gateway.retrievePayment.mockRejectedValue(
        Object.assign(new Error("sin acceso a la cuenta"), {
          type: "StripePermissionError",
          rawType: "invalid_request_error",
          code: "account_invalid",
          statusCode: 403,
        })
      );

      await expect(
        markAutomaticCollectionReviewed(
          {
            userId: fixture.userId,
            organizationId: fixture.organizationId,
            invoiceId: fixture.invoiceId,
            checkedInStripe: true,
          },
          { gateway }
        )
      ).rejects.toMatchObject({ code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT", status: 409 });
      expect(gateway.retrievePayment).toHaveBeenCalled();
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      expect(await attemptRow(attemptId)).toMatchObject({ status: "processing", completedAt: null, paymentId: null });
      expect(await auditActions(fixture, attemptId)).toEqual([]);
    });

    it("un cobro ya registrado con otro intento: cancelar manda a «Marcar como revisado», que sí lo cierra", async () => {
      const fixture = await createFixture();
      const paymentIntentId = `pi_CI${compact()}`;
      // El mismo cobro de Stripe, ya registrado en el libro para otro intento.
      await db.execute(sql`
        insert into zaltyko.payments (
          organization_id, location_id, family_id, family_payer_id, source, status, amount_cents, currency,
          processor, environment, provider_payment_id, received_at, idempotency_key
        ) values (
          ${fixture.organizationId}::uuid, ${fixture.locationId}::uuid, ${fixture.familyId}::uuid, ${fixture.payerId}::uuid,
          'provider', 'succeeded', ${fixture.amount}, 'EUR', 'stripe', 'sandbox', ${paymentIntentId}, now(),
          ${`family-collection:${randomUUID()}:${paymentIntentId}`}
        )
      `);
      const { attemptId } = await insertAttempt(fixture, { status: "created", paymentIntentId });
      const gateway = fakeStripe({ [paymentIntentId]: "succeeded" });
      const input = { userId: fixture.userId, organizationId: fixture.organizationId, invoiceId: fixture.invoiceId };

      await expect(cancelAutomaticCollection(input, { gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_REVIEW_REQUIRED",
        status: 409,
      });
      expect(await attemptRow(attemptId)).toMatchObject({ status: "created", completedAt: null });
      // El camino de registro dejó el aviso de revisión: «Marcar como revisado» está permitido.
      expect(await outboxCount(fixture, "family_collection.needs_review")).toBe(1);

      await expect(markAutomaticCollectionReviewed({ ...input, checkedInStripe: true }, { gateway })).resolves.toEqual({
        outcome: "reviewed",
      });
      expect(await attemptRow(attemptId)).toMatchObject({ status: "canceled", failureCode: "reviewed_by_academy" });
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
    });

    it("marcar como revisado con varios cobros en Stripe: si alguno salió, 409 y el intento sigue abierto", async () => {
      const fixture = await createFixture();
      const { attemptId } = await insertAttempt(fixture, { status: "claimed" });
      await createFamilyCollectionStore().recordNotice({
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        attemptId,
        invoiceId: fixture.invoiceId,
        reason: "multiple_payments",
        now: new Date(),
      });
      const first = `pi_CI${compact()}`;
      const second = `pi_CI${compact()}`;
      const gateway = fakeStripe({ [first]: "canceled", [second]: "succeeded" });
      gateway.listPaymentsByAttempt.mockResolvedValue([
        { id: first, status: "canceled", lastErrorCode: null, lastDeclineCode: null },
        { id: second, status: "succeeded", lastErrorCode: null, lastDeclineCode: null },
      ]);

      await expect(
        markAutomaticCollectionReviewed(
          {
            userId: fixture.userId,
            organizationId: fixture.organizationId,
            invoiceId: fixture.invoiceId,
            checkedInStripe: true,
          },
          { gateway }
        )
      ).rejects.toMatchObject({ code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT", status: 409 });
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      expect(await attemptRow(attemptId)).toMatchObject({ status: "claimed", completedAt: null });
    });

    it("Stripe cobró otro importe: ni cancelar ni marcar como revisado lo registran ni lo cierran; un solo aviso", async () => {
      const fixture = await createFixture();
      const paymentIntentId = `pi_CI${compact()}`;
      const { attemptId } = await insertAttempt(fixture, { status: "created", paymentIntentId });
      const gateway = fakeStripe({ [paymentIntentId]: "succeeded" }, 4000);
      const input = { userId: fixture.userId, organizationId: fixture.organizationId, invoiceId: fixture.invoiceId };

      await expect(cancelAutomaticCollection(input, { gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
        status: 409,
      });
      // El aviso deja «Marcar como revisado» a la vista, pero tampoco cierra nada.
      await expect(markAutomaticCollectionReviewed({ ...input, checkedInStripe: true }, { gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
        status: 409,
      });

      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      expect(await attemptRow(attemptId)).toMatchObject({ status: "created", completedAt: null, paymentId: null });
      expect(await chargeStatus(fixture)).toBe("due");
      expect(await outboxCount(fixture, "family_collection.needs_review")).toBe(1);
      const payments = await db.execute(sql`
        select count(*)::int as n from zaltyko.payments
         where organization_id = ${fixture.organizationId}::uuid and provider_payment_id = ${paymentIntentId}
      `);
      expect((payments.rows[0] as { n: number }).n).toBe(0);
    });

    it("marcar como revisado un cobro que sí salió en Stripe lo registra y nunca lo cierra", async () => {
      const fixture = await createFixture();
      const paymentIntentId = `pi_CI${compact()}`;
      const { attemptId } = await insertAttempt(fixture, { status: "created", paymentIntentId, resumeCount: 3 });
      const gateway = fakeStripe({ [paymentIntentId]: "succeeded" });

      await expect(
        markAutomaticCollectionReviewed(
          {
            userId: fixture.userId,
            organizationId: fixture.organizationId,
            invoiceId: fixture.invoiceId,
            checkedInStripe: true,
          },
          { gateway }
        )
      ).resolves.toEqual({ outcome: "collected" });

      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      const row = await attemptRow(attemptId);
      expect(row.status).toBe("succeeded");
      expect(row.paymentId).not.toBeNull();
      expect(await chargeStatus(fixture)).toBe("paid");
    });
  });

  describe("recordatorios de las cuotas automáticas", () => {
    async function holdOf(fixture: Fixture): Promise<boolean> {
      const [candidate] = await loadReminderCandidates(db, {
        organizationId: fixture.organizationId,
        locationIds: [fixture.locationId],
        limit: 10,
      });
      expect(candidate?.chargeId).toBe(fixture.chargeId);
      return candidate.automaticCollectionHold;
    }

    it("esperan mientras no haya un intento final y vuelven tras el fallo final o la cancelación", async () => {
      const claimed = await createFixture();
      await insertAttempt(claimed, { status: "claimed" });
      expect(await holdOf(claimed)).toBe(true);

      const retrying = await createFixture();
      await insertAttempt(retrying, { status: "failed", nextRetryAt: new Date(Date.now() + 3 * DAY) });
      expect(await holdOf(retrying)).toBe(true);

      const finalFailure = await createFixture();
      await insertAttempt(finalFailure, { status: "failed", nextRetryAt: null });
      expect(await holdOf(finalFailure)).toBe(false);

      const canceled = await createFixture();
      await insertAttempt(canceled, { status: "canceled", paymentIntentId: null });
      expect(await holdOf(canceled)).toBe(false);

      // Sin intento: espera hasta tres días después de la fecha de cobro.
      const recent = await createFixture({ dueDaysAgo: 1 });
      expect(await holdOf(recent)).toBe(true);
      const forgotten = await createFixture({ dueDaysAgo: 10 });
      expect(await holdOf(forgotten)).toBe(false);

      // Un reintento que nunca llegó: espera tres días desde su fecha y después vuelve.
      const staleRetry = await createFixture({ dueDaysAgo: 15 });
      await insertAttempt(staleRetry, { status: "failed", nextRetryAt: new Date(Date.now() - 6 * DAY) });
      expect(await holdOf(staleRetry)).toBe(false);
      const recentRetry = await createFixture({ dueDaysAgo: 15 });
      await insertAttempt(recentRetry, { status: "failed", nextRetryAt: new Date(Date.now() - DAY) });
      expect(await holdOf(recentRetry)).toBe(true);
    });

    it("con la bandera apagada: un cobro en marcha sigue reteniendo; el resto recibe recordatorios", async () => {
      const inFlight = await createFixture();
      await insertAttempt(inFlight, { status: "processing" });
      const claimed = await createFixture();
      await insertAttempt(claimed, { status: "claimed" });
      // Con la bandera apagada un reintento pendiente no saldrá: no retiene.
      const retrying = await createFixture();
      await insertAttempt(retrying, { status: "failed", nextRetryAt: new Date(Date.now() + 3 * DAY) });
      const fresh = await createFixture({ dueDaysAgo: 1 });
      vi.stubEnv(FLAG, "false");
      try {
        expect(await holdOf(inFlight)).toBe(true);
        expect(await holdOf(claimed)).toBe(true);
        expect(await holdOf(retrying)).toBe(false);
        expect(await holdOf(fresh)).toBe(false);
      } finally {
        vi.stubEnv(FLAG, "true");
      }
    });
  });

  describe("recordatorio de pago ya enviado (reminder_sent)", () => {
    async function insertReminder(fixture: Fixture, status: "pending" | "sent" | "failed") {
      await db.execute(sql`
        insert into zaltyko.payment_reminders (
          organization_id, charge_id, guardian_id, email_group_id, origin, status, outstanding_cents, currency, sent_at
        ) values (
          ${fixture.organizationId}::uuid, ${fixture.chargeId}::uuid, null, ${randomUUID()}::uuid, 'manual', ${status},
          ${fixture.amount}, 'EUR', ${status === "sent" ? new Date().toISOString() : null}::timestamptz
        )
      `);
    }

    /** Lo que ven el contexto (sin transacción) y la transacción de reclamar, ya con los bloqueos. */
    async function reminderSentOf(fixture: Fixture): Promise<{ context: boolean | undefined; locked: boolean | null }> {
      const store = createFamilyCollectionStore();
      const context = await store.loadInvoiceContext({
        organizationId: fixture.organizationId,
        invoiceId: fixture.invoiceId,
        environment: "test",
        now: new Date(),
      });
      let locked: boolean | null = null;
      const result = await store.claimOrCancel(
        {
          organizationId: fixture.organizationId,
          invoiceId: fixture.invoiceId,
          authorizationId: null,
          paymentProviderAccountId: null,
          paymentMethodKind: null,
          now: new Date(),
        },
        (snapshot) => {
          locked = snapshot.reminderSent;
          return { action: "skip", reason: "solo_lectura" };
        }
      );
      // Solo se mira: no se escribe ningún intento.
      expect(result).toEqual({ outcome: "skipped", reason: "solo_lectura" });
      return { context: context?.reminderSent, locked };
    }

    it("cuenta un recordatorio enviado o reservado de una cuota abierta; uno fallido no", async () => {
      const none = await createFixture();
      const sent = await createFixture();
      await insertReminder(sent, "sent");
      const pending = await createFixture();
      await insertReminder(pending, "pending");
      const failed = await createFixture();
      await insertReminder(failed, "failed");

      expect(await reminderSentOf(none)).toEqual({ context: false, locked: false });
      expect(await reminderSentOf(sent)).toEqual({ context: true, locked: true });
      expect(await reminderSentOf(pending)).toEqual({ context: true, locked: true });
      expect(await reminderSentOf(failed)).toEqual({ context: false, locked: false });
    });

    it("un recordatorio de una cuota que ya no está abierta no cuenta", async () => {
      const fixture = await createFixture();
      await insertReminder(fixture, "sent");
      await db.execute(sql`
        update zaltyko.charges set status = 'paid'::zaltyko.charge_status
         where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.chargeId}::uuid
      `);
      expect(await reminderSentOf(fixture)).toEqual({ context: false, locked: false });
    });
  });
});
