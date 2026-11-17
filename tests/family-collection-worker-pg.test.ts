import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { runFamilyCollection } from "@/modules/family-collection/application/family-collection-service";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { addLocalDays, localCalendarDate } from "@/modules/family-collection/domain/collection-plan";
import type { CollectionError, PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import {
  createFamilyCollectionStore,
  type FamilyCollectionStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import type { FamilyCollectionGateway } from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";

/**
 * Proceso diario del cobro automático (Fase 3) sobre PostgreSQL desechable de
 * GitHub, con Stripe simulado: bloqueos, índice de un intento abierto por
 * factura, libro real (pago `provider` y reparto) y reanudación tras una
 * caída. Instala las candidatas que falten (Fases 1, 2 y 3) y al terminar
 * borra todas las filas que creó (en orden de claves foráneas) y retira solo
 * lo que instaló. Quedan las academias y sus sedes, como en las demás suites:
 * el historial de plan y la auditoría son solo de añadir y apuntan a ellas.
 * Cada ejecución se limita a las academias de esta suite (`organizationIds`,
 * opción solo para tests). Nunca en un proyecto enlazado ni con credenciales
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

const SHA = "b".repeat(64);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const compact = () => randomUUID().replace(/-/g, "").slice(0, 20);

/**
 * Stripe simulado con memoria de los cobros creados. `confirm` decide el
 * resultado de cada confirmación; un `pi_…` que no creó lanza como un error de
 * red (cobros de otras pruebas que la ejecución encuentre de paso). Como la
 * API, cada cobro dice cuánto se cobró: un cobro hecho, el importe con el que
 * se creó (salvo que la prueba diga otro); los demás, nada. Siempre en euros.
 */
function fakeStripe(
  options: {
    confirm?: (paymentIntentId: string, call: number) => PaymentIntentSnapshot | CollectionError;
    onCreate?: () => Promise<void>;
  } = {}
) {
  const intents = new Map<string, PaymentIntentSnapshot>();
  /** Importe con el que se creó cada cobro. */
  const amounts = new Map<string, number>();
  const withAmount = (snapshot: PaymentIntentSnapshot): PaymentIntentSnapshot => ({
    amountReceivedCents: snapshot.status === "succeeded" ? (amounts.get(snapshot.id) ?? null) : 0,
    currency: "EUR",
    ...snapshot,
  });
  let confirmations = 0;
  const unknown = () => Object.assign(new Error("unknown payment"), { type: "StripeConnectionError" });
  const gateway = {
    createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(async (input) => {
      await options.onCreate?.();
      const created: PaymentIntentSnapshot = {
        id: `pi_CI${compact()}`,
        status: "requires_confirmation",
        lastErrorCode: null,
        lastDeclineCode: null,
      };
      amounts.set(created.id, input.amountCents);
      intents.set(created.id, created);
      return withAmount(created);
    }),
    confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(async (input) => {
      if (!intents.has(input.paymentIntentId)) throw unknown();
      confirmations += 1;
      const raw: PaymentIntentSnapshot | CollectionError = options.confirm
        ? options.confirm(input.paymentIntentId, confirmations)
        : { id: input.paymentIntentId, status: "succeeded", lastErrorCode: null, lastDeclineCode: null };
      const result: PaymentIntentSnapshot | CollectionError =
        "paymentIntent" in raw
          ? { ...raw, paymentIntent: raw.paymentIntent ? withAmount(raw.paymentIntent) : null }
          : withAmount(raw);
      const stored = "paymentIntent" in result ? result.paymentIntent : result;
      if (stored) intents.set(input.paymentIntentId, stored);
      return result;
    }),
    retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async (input) => {
      const stored = intents.get(input.paymentIntentId);
      if (!stored) throw unknown();
      return withAmount(stored);
    }),
    findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async () => null),
    cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(async () => "canceled"),
  };
  return { gateway, intents };
}

describeDisposablePg("proceso diario del cobro automático en Postgres desechable", () => {
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];
  let connectOnboardingInstalledHere = false;
  let familyPaymentMethodsInstalledHere = false;
  let candidateInstalledHere = false;

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
    vi.stubEnv("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED", "true");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (!disposablePgEnabled) return;
    // Todas las filas de la suite, en orden de claves foráneas. La auditoría
    // es solo de añadir (y apunta a las sedes), así que sedes y academias quedan.
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
    for (const userId of createdUsers) {
      await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
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
   * Academia con plan de pago por contrato, cuenta conectada lista, familia
   * con pagador vigente, método activo (tarjeta o domiciliación) y su Customer,
   * preferencia automática y una factura mensual emitida con cuotas
   * automáticas vencidas hace `dueDaysAgo` días (por defecto dos: dentro de la
   * ventana de cobro con un día de margen aunque la prueba cruce la
   * medianoche local).
   */
  async function createCollectableInvoice(input: {
    kind?: "card" | "sepa_debit";
    amounts?: number[];
    accountSyncedAt?: Date;
    dueDaysAgo?: number;
  } = {}) {
    const kind = input.kind ?? "card";
    const amounts = input.amounts ?? [4500];
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
    const short = compact();
    const now = new Date();

    await db.execute(sql`
      insert into zaltyko.organizations (id, name, status, default_timezone, default_currency)
      values (${organizationId}::uuid, ${`CI Cobro diario ${short}`}, 'active'::zaltyko.organization_status, 'Europe/Madrid', 'EUR')
    `);
    createdOrganizations.push(organizationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (${locationId}::uuid, ${organizationId}::uuid, ${`cd-${short}`}, 'Sede CI', 'Europe/Madrid')
    `);
    await db.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-collection-run-${userId}@example.invalid`})`);
    createdUsers.push(userId);
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
      values (${guardianId}::uuid, ${organizationId}::uuid, 'Tutor', 'Cobro Diario')
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
        'active'::zaltyko.organization_payment_account_status, 'active', 'active', 'none',
        ${(input.accountSyncedAt ?? now).toISOString()}::timestamptz
      )
    `);
    await db.execute(sql`
      insert into zaltyko.family_payment_authorizations (
        id, organization_id, family_id, family_payer_id, payment_provider_account_id, status,
        provider_setup_reference, payment_method_reference, mandate_reference, payment_method_kind,
        consent_version, consent_evidence_reference, consent_evidence_sha256, consented_at, consented_by_guardian_id
      ) values (
        ${authorizationId}::uuid, ${organizationId}::uuid, ${familyId}::uuid, ${payerId}::uuid, ${accountRowId}::uuid,
        'active'::zaltyko.payment_authorization_status, ${`seti_CI${short}`}, ${`pm_CI${short}`},
        ${kind === "sepa_debit" ? `mandate_CI${short}` : null}, ${kind},
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
        ${kind}, ${`cus_CI${short}`}, ${`seti_CI${short}`},
        'borrador-2026-11-16', ${SHA}, ${new Date(now.getTime() - DAY).toISOString()}::timestamptz, 'completed', ${authorizationId}::uuid
      )
    `);
    await db.execute(sql`
      insert into zaltyko.family_collection_preferences (organization_id, family_id, requested_mode, entitlement_revision, updated_by_member_id)
      select ${organizationId}::uuid, ${familyId}::uuid, 'automatic', e.revision, ${memberId}::uuid
        from zaltyko.organization_entitlements e
       where e.organization_id = ${organizationId}::uuid
    `);

    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const dueAt = new Date(now.getTime() - (input.dueDaysAgo ?? 2) * DAY).toISOString();
    await db.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, family_payer_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values (
        ${invoiceId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${familyId}::uuid, ${payerId}::uuid,
        ${`MENSUAL-CI-${short}`}, 'issued', 'EUR', ${total}, now(), ${dueAt}::timestamptz, ${`ci-run-inv-${invoiceId}`}
      )
    `);
    const chargeIds: string[] = [];
    for (const amount of amounts) {
      const lineId = randomUUID();
      const chargeId = randomUUID();
      chargeIds.push(chargeId);
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
          ${amount}, 'EUR', ${dueAt}::timestamptz, '2026-11-01'::date, '2026-11-30'::date, ${`ci-run-charge-${chargeId}`}
        )
      `);
    }
    return {
      organizationId,
      locationId,
      userId,
      familyId,
      payerId,
      accountRowId,
      authorizationId,
      invoiceId,
      chargeIds,
      total,
      mandate: kind === "sepa_debit" ? `mandate_CI${short}` : null,
    };
  }

  type Fixture = Awaited<ReturnType<typeof createCollectableInvoice>>;

  /** Relectura simulada de la cuenta: deja la última lectura en el instante de la ejecución. */
  function refresher(now: Date) {
    return async (accountRowId: string) => {
      await db.execute(sql`
        update zaltyko.organization_payment_provider_accounts
           set last_synced_at = ${now.toISOString()}::timestamptz
         where id = ${accountRowId}::uuid
      `);
    };
  }

  function run(
    now: Date,
    gateway: FamilyCollectionGateway,
    store: FamilyCollectionStore = createFamilyCollectionStore(),
    refreshAccount: (accountRowId: string) => Promise<unknown> = refresher(now)
  ) {
    // Solo las academias de esta suite: nunca datos de otras.
    return runFamilyCollection({ now, organizationIds: [...createdOrganizations] }, { store, gateway, refreshAccount });
  }

  /** Pago a mano de una cuota, como lo deja el libro (pago, reparto y estados). */
  async function manualPayment(fixture: Fixture, chargeId: string, amountCents: number, settles: boolean) {
    const paymentId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.payments (
        id, organization_id, location_id, family_id, family_payer_id, source, status, amount_cents, currency,
        manual_method, recorded_by_user_id, received_at, idempotency_key
      ) values (
        ${paymentId}::uuid, ${fixture.organizationId}::uuid, ${fixture.locationId}::uuid, ${fixture.familyId}::uuid,
        ${fixture.payerId}::uuid, 'manual', 'succeeded', ${amountCents}, 'EUR', 'cash', ${fixture.userId}::uuid,
        now(), ${`ci-run-manual-${paymentId}`}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.payment_allocations (organization_id, payment_id, charge_id, amount_cents, currency, allocated_at, idempotency_key)
      values (${fixture.organizationId}::uuid, ${paymentId}::uuid, ${chargeId}::uuid, ${amountCents}, 'EUR', now(), ${`ci-run-manual-alloc-${paymentId}`})
    `);
    await db.execute(sql`
      update zaltyko.charges set status = ${settles ? "paid" : "partially_paid"}::zaltyko.charge_status
       where organization_id = ${fixture.organizationId}::uuid and id = ${chargeId}::uuid
    `);
    await db.execute(sql`
      update zaltyko.invoices set status = ${settles ? "paid" : "partially_paid"}::zaltyko.invoice_status
       where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.invoiceId}::uuid
    `);
  }

  async function attempts(fixture: Fixture) {
    const result = await db.execute(sql`
      select attempt_number as "number", status, amount_cents::int as "amount",
             provider_payment_intent_reference as "intent", failure_code as "failure", decline_code as "decline",
             next_retry_at as "nextRetryAt", resume_count as "resumes", payment_id::text as "paymentId",
             allocation_status as "allocation"
        from zaltyko.family_collection_attempts
       where organization_id = ${fixture.organizationId}::uuid and invoice_id = ${fixture.invoiceId}::uuid
       order by attempt_number
    `);
    return result.rows as Array<{
      number: number;
      status: string;
      amount: number;
      intent: string | null;
      failure: string | null;
      decline: string | null;
      nextRetryAt: Date | string | null;
      resumes: number;
      paymentId: string | null;
      allocation: string | null;
    }>;
  }

  async function ledgerState(fixture: Fixture) {
    const charges = await db.execute(sql`
      select c.status::text as status
        from zaltyko.charges c
       where c.organization_id = ${fixture.organizationId}::uuid and c.invoice_id = ${fixture.invoiceId}::uuid
       order by c.id
    `);
    const invoice = await db.execute(sql`
      select status::text as status from zaltyko.invoices
       where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.invoiceId}::uuid
    `);
    const providerPayments = await db.execute(sql`
      select p.amount_cents::int as amount, p.environment::text as environment, p.provider_payment_id as intent,
             coalesce((select sum(pa.amount_cents) from zaltyko.payment_allocations pa
                        where pa.organization_id = p.organization_id and pa.payment_id = p.id), 0)::int as allocated
        from zaltyko.payments p
       where p.organization_id = ${fixture.organizationId}::uuid and p.source = 'provider'
    `);
    return {
      charges: (charges.rows as Array<{ status: string }>).map((row) => row.status),
      invoice: (invoice.rows[0] as { status: string }).status,
      providerPayments: providerPayments.rows as Array<{ amount: number; environment: string; intent: string; allocated: number }>,
    };
  }

  async function outboxCount(fixture: Fixture, eventName: string): Promise<number> {
    const result = await db.execute(sql`
      select count(*)::int as n from zaltyko.outbox_events
       where organization_id = ${fixture.organizationId}::uuid and event_name = ${eventName}
    `);
    return (result.rows[0] as { n: number }).n;
  }

  /** Llamadas a Stripe de la academia de la prueba (la ejecución recorre toda la base). */
  function callsFor<T extends { organizationId: string }>(calls: Array<[T]>, fixture: Fixture): Array<[T]> {
    return calls.filter(([input]) => input.organizationId === fixture.organizationId);
  }

  it("tarjeta cobrada: un cobro por el total, pago registrado y cuotas y factura pagadas", async () => {
    const fixture = await createCollectableInvoice({ amounts: [2500, 2000] });
    const { gateway } = fakeStripe();

    await run(new Date(), gateway);

    const created = callsFor(gateway.createPayment.mock.calls, fixture);
    expect(created).toHaveLength(1);
    expect(created[0][0]).toMatchObject({
      amountCents: 4500,
      currency: "EUR",
      kind: "card",
      description: "Cuota noviembre 2026",
      attempt: { invoiceId: fixture.invoiceId, attemptNumber: 1 },
    });
    const [attempt] = await attempts(fixture);
    expect(attempt).toMatchObject({ number: 1, status: "succeeded", amount: 4500, allocation: "allocated", resumes: 0 });
    expect(attempt.paymentId).not.toBeNull();
    expect(await ledgerState(fixture)).toEqual({
      charges: ["paid", "paid"],
      invoice: "paid",
      providerPayments: [{ amount: 4500, environment: "sandbox", intent: attempt.intent, allocated: 4500 }],
    });
    expect(await outboxCount(fixture, "family_collection.attempt_claimed")).toBe(1);
    expect(await outboxCount(fixture, "family_collection.attempt_succeeded")).toBe(1);
  });

  it("dos ejecuciones simultáneas: un solo intento y una sola creación en Stripe", async () => {
    // Cuenta sin releer: las dos ejecuciones se esperan en la relectura y
    // llegan a la vez a reclamar (carrera real, no secuencial).
    const fixture = await createCollectableInvoice({ accountSyncedAt: new Date(Date.now() - 2 * HOUR) });
    // El instante de la ejecución se toma DESPUÉS de crear la academia: su plan
    // (derecho de contrato) rige desde organizations.created_at, y con un `now`
    // anterior la puerta diría entitlement_not_effective (pasajero) y no se
    // reclamaría nada, que es lo correcto para un plan que aún no rige.
    const now = new Date();
    const { gateway } = fakeStripe();
    let entered = 0;
    let release: () => void = () => undefined;
    const bothInside = new Promise<void>((resolveBarrier) => {
      release = resolveBarrier;
    });
    const safety = setTimeout(() => release(), 10_000);
    const racingRefresh = async (accountRowId: string) => {
      if (accountRowId === fixture.accountRowId) {
        entered += 1;
        if (entered >= 2) release();
        await bothInside;
      }
      await refresher(now)(accountRowId);
    };

    const results = await Promise.all([
      run(now, gateway, createFamilyCollectionStore(), racingRefresh),
      run(now, gateway, createFamilyCollectionStore(), racingRefresh),
    ]);
    clearTimeout(safety);

    expect(entered).toBe(2);
    // Ningún otro motivo de omisión que «otra ejecución ya lo reclamó».
    expect(results.flatMap((result) => Object.keys(result.skipped)).filter((reason) => reason !== "concurrent")).toEqual([]);
    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(1);
    const rows = await attempts(fixture);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ number: 1, status: "succeeded" });
    expect(results.reduce((sum, result) => sum + (result.skipped.concurrent ?? 0), 0)).toBeGreaterThanOrEqual(1);
    expect((await ledgerState(fixture)).providerPayments).toHaveLength(1);
  });

  it("confirmado en Stripe, caída antes de registrar, reanudación a las 25 h: cero creaciones nuevas y pago registrado", async () => {
    const fixture = await createCollectableInvoice();
    const { gateway } = fakeStripe();
    const start = new Date();
    const crashing: FamilyCollectionStore = {
      ...createFamilyCollectionStore(),
      applyOutcome: async () => {
        throw new Error("caída simulada antes de registrar");
      },
    };

    await run(start, gateway, crashing);
    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(1);
    const [afterCrash] = await attempts(fixture);
    expect(afterCrash).toMatchObject({ status: "created", resumes: 0 });
    expect(afterCrash.intent).toMatch(/^pi_CI/);
    expect((await ledgerState(fixture)).providerPayments).toEqual([]);

    const later = new Date(start.getTime() + 25 * HOUR);
    const result = await run(later, gateway);

    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(1);
    expect(gateway.confirmPayment.mock.calls.filter(([input]) => input.paymentIntentId === afterCrash.intent)).toHaveLength(1);
    expect(result.resumed).toBeGreaterThanOrEqual(1);
    const [resumed] = await attempts(fixture);
    expect(resumed).toMatchObject({ status: "succeeded", intent: afterCrash.intent, resumes: 1, allocation: "allocated" });
    expect(await ledgerState(fixture)).toEqual({
      charges: ["paid"],
      invoice: "paid",
      providerPayments: [{ amount: 4500, environment: "sandbox", intent: afterCrash.intent, allocated: 4500 }],
    });
  });

  it("cuota pagada a mano después de reclamar: el cobro queda registrado y la academia lo revisa", async () => {
    const fixture = await createCollectableInvoice();
    const { gateway } = fakeStripe({
      // Entre reclamar y confirmar, la academia cobra la cuota en efectivo.
      onCreate: () => manualPayment(fixture, fixture.chargeIds[0], 4500, true),
    });

    await run(new Date(), gateway);

    const [attempt] = await attempts(fixture);
    expect(attempt).toMatchObject({ status: "succeeded", allocation: "needs_review" });
    const ledger = await ledgerState(fixture);
    // El dinero de Stripe está registrado aunque no quepa en la cuota.
    expect(ledger.providerPayments).toEqual([{ amount: 4500, environment: "sandbox", intent: attempt.intent, allocated: 0 }]);
    expect(ledger.charges).toEqual(["paid"]);
    expect(await outboxCount(fixture, "family_collection.needs_review")).toBe(1);
  });

  it("Stripe cobró otro importe: el pago no entra en el libro, el intento sigue abierto y la academia recibe un solo aviso", async () => {
    const fixture = await createCollectableInvoice();
    const { gateway } = fakeStripe({
      confirm: (paymentIntentId) => ({
        id: paymentIntentId,
        status: "succeeded",
        lastErrorCode: null,
        lastDeclineCode: null,
        amountReceivedCents: 4000,
        currency: "EUR",
      }),
    });
    const start = new Date();

    const first = await run(start, gateway);
    expect(first.skipped.amount_mismatch).toBeGreaterThanOrEqual(1);
    // Al día siguiente la reanudación relee el cobro y sigue sin registrarlo.
    await run(new Date(start.getTime() + 25 * HOUR), gateway);

    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(1);
    const [attempt] = await attempts(fixture);
    expect(attempt).toMatchObject({ status: "created", paymentId: null, allocation: null, failure: null });
    expect(await ledgerState(fixture)).toEqual({ charges: ["due"], invoice: "issued", providerPayments: [] });
    expect(await outboxCount(fixture, "family_collection.attempt_succeeded")).toBe(0);
    const notices = await db.execute(sql`
      select idempotency_key as "key", payload ->> 'reason' as "reason", payload ->> 'attemptId' as "attemptId",
             (payload ->> 'expectedAmountCents')::int as "expected", (payload ->> 'receivedAmountCents')::int as "received",
             payload ->> 'receivedCurrency' as "currency"
        from zaltyko.outbox_events
       where organization_id = ${fixture.organizationId}::uuid and event_name = 'family_collection.needs_review'
    `);
    const rows = notices.rows as Array<{ key: string; attemptId: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: "amount_mismatch", expected: 4500, received: 4000, currency: "EUR" });
    expect(rows[0].key).toBe(`family-collection:${rows[0].attemptId}:needs_review:amount_mismatch`);
  });

  it("pago parcial previo: solo se cobra el saldo", async () => {
    const fixture = await createCollectableInvoice();
    await manualPayment(fixture, fixture.chargeIds[0], 1500, false);
    const { gateway } = fakeStripe();

    await run(new Date(), gateway);

    const created = callsFor(gateway.createPayment.mock.calls, fixture);
    expect(created).toHaveLength(1);
    expect(created[0][0].amountCents).toBe(3000);
    const [attempt] = await attempts(fixture);
    expect(attempt).toMatchObject({ status: "succeeded", amount: 3000, allocation: "allocated" });
    expect(await ledgerState(fixture)).toMatchObject({ charges: ["paid"], invoice: "paid" });
  });

  it("autorización revocada o pagador cerrado antes del cobro: intento canceled y la cuota sigue abierta para cobrarla a mano", async () => {
    const revoked = await createCollectableInvoice();
    await db.execute(sql`
      update zaltyko.family_payment_authorizations
         set status = 'revoked'::zaltyko.payment_authorization_status, revoked_at = now()
       where id = ${revoked.authorizationId}::uuid
    `);
    const closed = await createCollectableInvoice();
    // «Ayer» en días civiles de la sede (restar 24 h falla el día del cambio de hora).
    const now = new Date();
    const yesterday = addLocalDays(localCalendarDate(now, "Europe/Madrid"), -1);
    await db.execute(sql`
      update zaltyko.family_payers set ends_on = ${yesterday}::date where id = ${closed.payerId}::uuid
    `);
    const { gateway } = fakeStripe();

    await run(now, gateway);

    expect(callsFor(gateway.createPayment.mock.calls, revoked)).toHaveLength(0);
    expect(callsFor(gateway.createPayment.mock.calls, closed)).toHaveLength(0);
    expect(await attempts(revoked)).toEqual([
      expect.objectContaining({ number: 1, status: "canceled", failure: "authorization_missing", intent: null }),
    ]);
    expect(await attempts(closed)).toEqual([
      expect.objectContaining({ number: 1, status: "canceled", failure: "payer_not_current", intent: null }),
    ]);
    for (const fixture of [revoked, closed]) {
      expect(await ledgerState(fixture)).toEqual({ charges: ["due"], invoice: "issued", providerPayments: [] });
      expect(await outboxCount(fixture, "family_collection.attempt_canceled")).toBe(1);
    }

    // Un intento final no se repite: la cuota ya es de cobro a mano.
    await run(new Date(), gateway);
    expect(await attempts(revoked)).toHaveLength(1);
    expect(await attempts(closed)).toHaveLength(1);
  });

  it("vencida hace 10 días y el motivo pasajero ya no está: nunca se cobra, intento canceled collection_window_expired", async () => {
    // Durante días un motivo pasajero (p. ej. el plan o la cuenta) impidió el
    // cobro; la cuota ya volvió a los recordatorios y pudo pagarse a mano.
    // Hoy la puerta dejaría pasar, pero la ventana de cobro ya acabó.
    const fixture = await createCollectableInvoice({ dueDaysAgo: 10 });
    const { gateway } = fakeStripe();

    await run(new Date(), gateway);

    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(0);
    expect(await attempts(fixture)).toEqual([
      expect.objectContaining({ number: 1, status: "canceled", failure: "collection_window_expired", intent: null }),
    ]);
    expect(await ledgerState(fixture)).toEqual({ charges: ["due"], invoice: "issued", providerPayments: [] });
    expect(await outboxCount(fixture, "family_collection.attempt_canceled")).toBe(1);

    // Final: otra ejecución no lo repite; la cuota se cobra a mano.
    await run(new Date(), gateway);
    expect(await attempts(fixture)).toHaveLength(1);
    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(0);
  });

  it("tarjeta rechazada: reintento el día local +3 y, si vuelve a fallar, fallo final", async () => {
    const fixture = await createCollectableInvoice();
    const declined = (paymentIntentId: string): CollectionError => ({
      type: "card_error",
      code: "card_declined",
      declineCode: "insufficient_funds",
      paymentIntent: {
        id: paymentIntentId,
        status: "requires_payment_method",
        lastErrorCode: "card_declined",
        lastDeclineCode: "insufficient_funds",
      },
    });
    const { gateway } = fakeStripe({ confirm: (paymentIntentId) => declined(paymentIntentId) });
    const start = new Date();

    await run(start, gateway);
    const [first] = await attempts(fixture);
    expect(first).toMatchObject({ status: "failed", failure: "card_declined", decline: "insufficient_funds" });
    expect(first.nextRetryAt).not.toBeNull();
    const retryAt = new Date(first.nextRetryAt as Date | string);
    // Las 00:00 locales del día +3 en la sede.
    const startLocal = localCalendarDate(start, "Europe/Madrid");
    expect(localCalendarDate(retryAt, "Europe/Madrid")).not.toBe(startLocal);
    // Entre 2 y 3 días después (± 1 h si hay cambio de hora en medio).
    expect(retryAt.getTime() - start.getTime()).toBeGreaterThan(2 * DAY - HOUR);
    expect(retryAt.getTime() - start.getTime()).toBeLessThanOrEqual(3 * DAY + HOUR);

    // El día antes del reintento no se intenta nada.
    await run(new Date(retryAt.getTime() - HOUR), gateway);
    expect(await attempts(fixture)).toHaveLength(1);

    // Llegado el día local, segundo intento; vuelve a fallar y ya no hay más.
    const result = await run(new Date(retryAt.getTime() + HOUR), gateway);
    const rows = await attempts(fixture);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ number: 2, status: "failed", decline: "insufficient_funds", nextRetryAt: null });
    expect(result.retried).toBeGreaterThanOrEqual(1);
    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(2);
    expect(await outboxCount(fixture, "family_collection.final_failure")).toBe(1);
    expect(await ledgerState(fixture)).toEqual({ charges: ["due"], invoice: "issued", providerPayments: [] });
  });

  it("domiciliación en curso: queda processing y la relectura del día siguiente la cierra", async () => {
    const fixture = await createCollectableInvoice({ kind: "sepa_debit" });
    const { gateway, intents } = fakeStripe({
      confirm: (paymentIntentId) => ({
        id: paymentIntentId,
        status: "processing",
        lastErrorCode: null,
        lastDeclineCode: null,
      }),
    });
    const start = new Date();

    await run(start, gateway);
    const confirms = gateway.confirmPayment.mock.calls.filter(([input]) => intents.has(input.paymentIntentId));
    expect(confirms[confirms.length - 1]?.[0].mandate).toBe(fixture.mandate);
    const [processing] = await attempts(fixture);
    expect(processing).toMatchObject({ status: "processing", allocation: null });
    expect((await ledgerState(fixture)).providerPayments).toEqual([]);

    // El banco liquida la domiciliación; la relectura diaria lo registra.
    intents.set(processing.intent as string, {
      id: processing.intent as string,
      status: "succeeded",
      lastErrorCode: null,
      lastDeclineCode: null,
    });
    const result = await run(new Date(start.getTime() + DAY), gateway);

    expect(result.reconciled).toBeGreaterThanOrEqual(1);
    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(1);
    const [settled] = await attempts(fixture);
    expect(settled).toMatchObject({ status: "succeeded", allocation: "allocated" });
    expect(await ledgerState(fixture)).toEqual({
      charges: ["paid"],
      invoice: "paid",
      providerPayments: [{ amount: 4500, environment: "sandbox", intent: processing.intent, allocated: 4500 }],
    });
  });
  it("red de seguridad: un intento abierto con las reanudaciones agotadas recibe un solo aviso", async () => {
    const fixture = await createCollectableInvoice();
    const inserted = await db.execute(sql`
      insert into zaltyko.family_collection_attempts (
        organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
        payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
        resume_count, claimed_at
      ) values (
        ${fixture.organizationId}::uuid, ${fixture.locationId}::uuid, ${fixture.invoiceId}::uuid, ${fixture.familyId}::uuid,
        ${fixture.payerId}::uuid, ${fixture.authorizationId}::uuid, ${fixture.accountRowId}::uuid, 1, 'card',
        ${fixture.total}, 'EUR', 'claimed', 3, ${new Date(Date.now() - 2 * DAY).toISOString()}::timestamptz
      )
      returning id::text as id
    `);
    const attemptId = (inserted.rows[0] as { id: string }).id;
    await db.execute(sql`
      insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
      values (${attemptId}::uuid, ${fixture.organizationId}::uuid, ${fixture.chargeIds[0]}::uuid, ${fixture.total})
    `);
    const { gateway } = fakeStripe();

    await run(new Date(), gateway);
    await run(new Date(), gateway);

    // Ni se reanuda (agotado) ni se cobra otra vez (intento abierto), pero la academia lo sabe.
    expect(callsFor(gateway.createPayment.mock.calls, fixture)).toHaveLength(0);
    expect(gateway.findPaymentByAttempt).not.toHaveBeenCalled();
    expect(await attempts(fixture)).toEqual([expect.objectContaining({ status: "claimed", resumes: 3 })]);
    const notices = await db.execute(sql`
      select idempotency_key as "key" from zaltyko.outbox_events
       where organization_id = ${fixture.organizationId}::uuid and event_name = 'family_collection.needs_review'
    `);
    expect(notices.rows).toEqual([{ key: `family-collection:${attemptId}:needs_review:resume_exhausted` }]);
  });

  /** Intento escrito a mano (con su reparto) en un estado abierto válido para la candidata. */
  async function insertOpenAttempt(
    fixture: Fixture,
    input: { status: "created" | "processing"; resumeCount: number; claimedAt: Date; updatedAt: string }
  ): Promise<{ attemptId: string; paymentIntentId: string }> {
    const paymentIntentId = `pi_CI${compact()}`;
    const inserted = await db.execute(sql`
      insert into zaltyko.family_collection_attempts (
        organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
        payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency, status,
        provider_payment_intent_reference, resume_count, claimed_at, updated_at
      ) values (
        ${fixture.organizationId}::uuid, ${fixture.locationId}::uuid, ${fixture.invoiceId}::uuid, ${fixture.familyId}::uuid,
        ${fixture.payerId}::uuid, ${fixture.authorizationId}::uuid, ${fixture.accountRowId}::uuid, 1, 'card',
        ${fixture.total}, 'EUR', ${input.status}, ${paymentIntentId}, ${input.resumeCount},
        ${input.claimedAt.toISOString()}::timestamptz, ${input.updatedAt}::timestamptz
      )
      returning id::text as id
    `);
    const attemptId = (inserted.rows[0] as { id: string }).id;
    await db.execute(sql`
      insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
      values (${attemptId}::uuid, ${fixture.organizationId}::uuid, ${fixture.chargeIds[0]}::uuid, ${fixture.total})
    `);
    return { attemptId, paymentIntentId };
  }

  async function resumeState(attemptId: string, previous: string) {
    const result = await db.execute(sql`
      select resume_count as "resumes", (updated_at = ${previous}::timestamptz) as "untouched"
        from zaltyko.family_collection_attempts
       where id = ${attemptId}::uuid
    `);
    return result.rows[0] as { resumes: number; untouched: boolean };
  }

  /**
   * Quita un intento escrito a mano (y su reparto) al terminar un test: un
   * intento abierto que se quedara en la base lo reanudaría el test siguiente,
   * y los tests dependerían del orden.
   */
  async function removeAttempt(fixture: Fixture, attemptId: string): Promise<void> {
    await db.execute(sql`
      delete from zaltyko.family_collection_attempt_charges
       where organization_id = ${fixture.organizationId}::uuid and attempt_id = ${attemptId}::uuid
    `);
    await db.execute(sql`
      delete from zaltyko.family_collection_attempts
       where organization_id = ${fixture.organizationId}::uuid and id = ${attemptId}::uuid
    `);
  }

  it("reanudación devuelta: una toma sin procesar recupera su reanudación y su updated_at exacto, una sola vez", async () => {
    const fixture = await createCollectableInvoice();
    // Con microsegundos: la devolución no debe redondearlos.
    const previous = "2026-11-10 08:00:00.123456+00";
    const now = new Date("2026-11-17T09:00:00.000Z");
    const { attemptId } = await insertOpenAttempt(fixture, {
      status: "created",
      resumeCount: 1,
      claimedAt: new Date("2026-11-10T07:00:00.000Z"),
      updatedAt: previous,
    });
    const store = createFamilyCollectionStore();
    const claim = () =>
      store.claimResumable({
        staleBefore: new Date(now.getTime() - 15 * 60 * 1000),
        after: null,
        limit: 10,
        now,
        scope: [fixture.organizationId],
      });

    try {
      const taken = await claim();
      expect(taken).toEqual([
        expect.objectContaining({ id: attemptId, status: "created", resumeCount: 2, resumeClaim: expect.objectContaining({ takenAt: now }) }),
      ]);
      expect(await resumeState(attemptId, previous)).toEqual({ resumes: 2, untouched: false });

      expect(await store.releaseResume(taken[0])).toBe(true);
      expect(await resumeState(attemptId, previous)).toEqual({ resumes: 1, untouched: true });
      // Devolverla otra vez no resta nada.
      expect(await store.releaseResume(taken[0])).toBe(false);
      expect(await resumeState(attemptId, previous)).toEqual({ resumes: 1, untouched: true });

      // Si otro proceso lo tocó después de la toma, no se devuelve nada.
      const again = await claim();
      expect(again).toHaveLength(1);
      await db.execute(sql`
        update zaltyko.family_collection_attempts
           set updated_at = ${new Date(now.getTime() + 60_000).toISOString()}::timestamptz
         where id = ${attemptId}::uuid
      `);
      expect(await store.releaseResume(again[0])).toBe(false);
      expect((await resumeState(attemptId, previous)).resumes).toBe(2);
    } finally {
      // El intento sigue `created`: se quita para que ninguna otra ejecución lo reanude.
      await removeAttempt(fixture, attemptId);
    }
    expect(await attempts(fixture)).toEqual([]);
  });

  it("en curso hace más de 15 días y Stripe no deja leerlo: un solo aviso processing_unreadable y el intento sigue en curso", async () => {
    const fixture = await createCollectableInvoice({ kind: "sepa_debit" });
    const now = new Date();
    const { attemptId } = await insertOpenAttempt(fixture, {
      status: "processing",
      resumeCount: 0,
      claimedAt: new Date(now.getTime() - 16 * DAY),
      updatedAt: new Date(now.getTime() - 16 * DAY).toISOString(),
    });
    const { gateway } = fakeStripe();
    // La academia desconectó su cuenta: stripe-node lanza StripePermissionError (account_invalid).
    gateway.retrievePayment.mockImplementation(async () => {
      throw Object.assign(new Error("sin acceso a la cuenta"), {
        type: "StripePermissionError",
        rawType: "invalid_request_error",
        code: "account_invalid",
        statusCode: 403,
      });
    });

    const first = await run(now, gateway);
    await run(now, gateway);

    expect(first.skipped.stripe_unreadable).toBeGreaterThanOrEqual(1);
    expect(await attempts(fixture)).toEqual([expect.objectContaining({ status: "processing", paymentId: null })]);
    const notices = await db.execute(sql`
      select idempotency_key as "key", payload ->> 'reason' as "reason" from zaltyko.outbox_events
       where organization_id = ${fixture.organizationId}::uuid and event_name = 'family_collection.needs_review'
    `);
    expect(notices.rows).toEqual([
      { key: `family-collection:${attemptId}:needs_review:processing_unreadable`, reason: "processing_unreadable" },
    ]);
    expect((await ledgerState(fixture)).providerPayments).toEqual([]);
  });
});
