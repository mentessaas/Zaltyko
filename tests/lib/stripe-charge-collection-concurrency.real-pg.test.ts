/**
 * Test de EXCLUSIÓN MUTUA REAL bajo concurrencia (ZAL-6).
 *
 * Cierra la limitación documentada en
 * `tests/lib/stripe-charge-collection.integration.test.ts:248-264`: ese test
 * solo verifica el orden de `db.execute` (lock) y `select` en un mock. Aquí
 * exigimos la garantía de producto — bajo dos `collectCharge` simultáneos
 * sobre el MISMO cargo, `pg_advisory_xact_lock` debe serializarlos de forma
 * que solo UNO llame a `stripe.paymentIntents.create` (el otro ve el cargo
 * ya pagado y devuelve `NOT_COLLECTIBLE:paid`). Sin ese comportamiento, una
 * doble invocación por el cron + un webhook + el dueño corriendo a mano se
 * convierte en doble cobro real a la familia.
 *
 * Se ejecuta solo cuando `CHARGE_CONCURRENCY_TEST=1` y `DATABASE_URL`
 * apuntan a un Postgres real (lo pone `scripts/run-charge-concurrency-test.sh`).
 * Fuera de ese escenario se auto-skippea con guardas explícitas en cada
 * hook y test para no tocar `pnpm test` en CI ni workstations sin Postgres.
 *
 * Para la manipulación de fixtures (TRUNCATE/INSERT/UPDATE/SELECT) usamos un
 * `pg.Pool` propio en lugar del proxy `db`, porque la implementación actual
 * de `db` rompe la propagación del template `sql\`\`` en este contexto
 * específico. El código de producción sigue usando `db` vía Drizzle, así
 * que los `tx.execute` del lock y los `tx.select/update` del servicio
 * siguen pasando por el camino real.
 */

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

const ENABLED = process.env.CHARGE_CONCURRENCY_TEST === "1";
// `tests/setup.ts` sobreescribe `DATABASE_URL` con valores "test" al inicio
// de la suite. Usamos un nombre dedicado (CHARGE_CONCURRENCY_DATABASE_URL,
// lo pone `scripts/run-charge-concurrency-test.sh`) para apuntar al cluster
// efímero, y volcamos esa URL en `DATABASE_URL` ANTES de que `@/db` (vía
// `@/lib/env`) valide las env vars. Sin este volcado, el proxy `db` intenta
// conectar con `postgresql://test:test@localhost/test` y falla con
// "role test does not exist".
const DATABASE_URL = process.env.CHARGE_CONCURRENCY_DATABASE_URL ?? "";
if (ENABLED) {
  process.env.DATABASE_URL = DATABASE_URL;
}

const {
  resolvePayerCustomerForAthleteMock,
  releaseStripeDeferred,
  stripeCreateCalls,
  rejectStripeDeferred,
  stripeDeferred,
} = vi.hoisted(() => {
  const stripeDeferred: {
    current: null | {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    };
  } = { current: null };

  const stripeCreateCalls: Array<{ chargeId: string; idempotencyKey: string | undefined }> = [];

  return {
    resolvePayerCustomerForAthleteMock: vi.fn(),
    releaseStripeDeferred: (value: unknown) => {
      if (!stripeDeferred.current) {
        throw new Error("no deferred Stripe paymentIntent pending to release");
      }
      stripeDeferred.current.resolve(value);
      stripeDeferred.current = null;
    },
    rejectStripeDeferred: (reason: unknown) => {
      if (!stripeDeferred.current) {
        throw new Error("no deferred Stripe paymentIntent pending to reject");
      }
      stripeDeferred.current.reject(reason);
      stripeDeferred.current = null;
    },
    stripeCreateCalls,
    stripeDeferred,
  };
});

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({
    paymentIntents: {
      create: (payload: unknown, opts: unknown) => {
        const optsRecord = opts as { idempotencyKey?: string } | undefined;
        const metadata = (payload as { metadata?: { chargeId?: string } }).metadata;
        stripeCreateCalls.push({
          chargeId: metadata?.chargeId ?? "<unknown>",
          idempotencyKey: optsRecord?.idempotencyKey,
        });
        return new Promise((resolve, reject) => {
          stripeDeferred.current = { resolve, reject };
        });
      },
    },
    refunds: { create: vi.fn() },
  }),
}));

vi.mock("@/lib/stripe/connect-service", () => ({
  // El test no depende del onboarding real; devolvemos una cuenta Connect ya
  // conectada para que `collectCharge` pase el check de readiness.
  getConnectAccount: async () => ({
    id: "stripe_account_row_test",
    tenantId: "tenant_test",
    academyId: "academy_test",
    stripeAccountId: "acct_test",
    country: "ES",
    defaultCurrency: "eur",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    onboardingStatus: "enabled",
    lastSyncedAt: new Date(),
  }),
  isConnectReady: () => true,
}));

vi.mock("@/lib/stripe/family-customers-service", () => ({
  resolvePayerCustomerForAthlete: (...args: unknown[]) =>
    resolvePayerCustomerForAthleteMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
}));

// `tests/setup.ts` mockea `drizzle-orm` y `drizzle-orm/pg-core` para que los
// tests unitarios no necesiten Postgres. Este test SÍ usa Postgres real y
// necesita los builders reales para que `tx.execute(sql\`...\`)` ejecute el
// `pg_advisory_xact_lock` de verdad.
vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

import { db } from "@/db";
import { collectCharge } from "@/lib/stripe/charge-collection-service";
import { sql } from "drizzle-orm";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ACADEMY_ID = "22222222-2222-2222-2222-222222222222";
const ATHLETE_ID = "33333333-3333-3333-3333-333333333333";
const OWNER_ID = "44444444-4444-4444-4444-444444444444";
const CHARGE_ID = "55555555-5555-5555-5555-555555555555";

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

async function resetChargeFixture() {
  await pool.query(
    "TRUNCATE payment_attempts, charges, athletes, academies RESTART IDENTITY CASCADE",
  );
  await pool.query(
    "INSERT INTO academies (id, tenant_id, name, owner_id, academy_type) VALUES ($1, $2, $3, $4, $5)",
    [ACADEMY_ID, TENANT_ID, "Test Academy ZAL-6", OWNER_ID, "general"],
  );
  await pool.query(
    "INSERT INTO athletes (id, tenant_id, academy_id, name) VALUES ($1, $2, $3, $4)",
    [ATHLETE_ID, TENANT_ID, ACADEMY_ID, "Test Athlete ZAL-6"],
  );
  await pool.query(
    `INSERT INTO charges (id, tenant_id, academy_id, athlete_id, label,
       amount_cents, currency, period, status, attempt_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      CHARGE_ID,
      TENANT_ID,
      ACADEMY_ID,
      ATHLETE_ID,
      "Cuota ZAL-6",
      5000,
      "EUR",
      "2026-07",
      "pending",
      0,
    ],
  );
}

async function resetChargeToPending() {
  await pool.query(
    `UPDATE charges SET
       status = 'pending',
       stripe_payment_intent_id = NULL,
       stripe_charge_id = NULL,
       attempt_count = 0,
       paid_at = NULL,
       last_attempt_at = NULL,
       updated_at = now()
     WHERE id = $1`,
    [CHARGE_ID],
  );
  await pool.query("DELETE FROM payment_attempts WHERE charge_id = $1", [CHARGE_ID]);
}

async function fetchCharge() {
  const { rows } = await pool.query(
    "SELECT status, attempt_count, stripe_payment_intent_id FROM charges WHERE id = $1",
    [CHARGE_ID],
  );
  return rows[0];
}

async function countAttempts() {
  const { rows } = await pool.query(
    "SELECT status, COUNT(*)::int AS n FROM payment_attempts WHERE charge_id = $1 GROUP BY status",
    [CHARGE_ID],
  );
  return rows as Array<{ status: string; n: number }>;
}

describe("collectCharge concurrente contra Postgres real", () => {
  beforeAll(async () => {
    if (!ENABLED) return;
    await resetChargeFixture();
    resolvePayerCustomerForAthleteMock.mockResolvedValue({
      id: "family_customer_test",
      stripeCustomerId: "cus_test",
      defaultPaymentMethodId: "pm_test",
    });
    // Precalentamos el pool `@/db`: la primera vez que `db.transaction` se
    // ejecuta abre una conexión real al Postgres efímero. Si esa apertura
    // supera el `setTimeout(200)` de los tests, `collectCharge` no llega a
    // `paymentIntents.create` y el assert se vuelve flaky. Un `SELECT 1`
    // barato por adelantado elimina esa variabilidad.
    await db.execute(sql`select 1`);
  }, 30_000);

  afterAll(async () => {
    // El cluster efímero se destruye en el script bash. Aquí cerramos el
    // pool de fixtures para no dejar conexiones colgadas.
    try {
      await pool.end();
    } catch {
      // best-effort
    }
  }, 10_000);

  it.skipIf(!ENABLED)(
    "pg_advisory_xact_lock serializa dos collectCharge concurrentes (un solo paymentIntents.create)",
    async () => {
      expect(stripeCreateCalls).toHaveLength(0);

      // Arrancamos dos invocaciones simultáneas. La primera encolará el
      // lock por cargo y quedará bloqueada dentro del
      // `stripe.paymentIntents.create` gracias al deferred. La segunda
      // quedará bloqueada en el lock.
      const callA = collectCharge(CHARGE_ID);
      const callB = collectCharge(CHARGE_ID);

      // Margen para que ambas transacciones arrancasen y colgasen: callA
      // tiene el lock y espera al deferred; callB está bloqueada en el
      // lock. Si el lock no existiera, callB también llegaría a
      // paymentIntents.create y tendríamos 2 calls antes del release.
      await new Promise((r) => setTimeout(r, 200));
      expect(stripeCreateCalls).toHaveLength(1);
      expect(stripeCreateCalls[0].idempotencyKey).toBe(`charge_collect_${CHARGE_ID}_1`);

      // Liberamos el paymentIntent. callA termina, marca el cargo como
      // paid, commitea y libera el lock. callB entra, lee el cargo ya
      // pagado y devuelve NOT_COLLECTIBLE:paid sin volver a llamar a Stripe.
      releaseStripeDeferred({
        id: "pi_zal6_succeeded",
        status: "succeeded",
        latest_charge: "ch_zal6",
      });

      const [resultA, resultB] = await Promise.all([callA, callB]);

      expect(resultA).toEqual({
        ok: true,
        status: "paid",
        paymentIntentId: "pi_zal6_succeeded",
      });
      expect(resultB).toEqual({
        ok: false,
        status: "skipped",
        reason: "NOT_COLLECTIBLE:paid",
      });

      // Garantía dura: solo UN paymentIntent.create a pesar de la carrera.
      expect(stripeCreateCalls).toHaveLength(1);

      const chargeRow = await fetchCharge();
      expect(chargeRow.status).toBe("paid");
      expect(chargeRow.attempt_count).toBe(1);
      expect(chargeRow.stripe_payment_intent_id).toBe("pi_zal6_succeeded");

      const attempts = await countAttempts();
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toEqual({ status: "succeeded", n: 1 });

      // Las filas FK (academy/athlete) insertadas en beforeAll siguen ahí.
      const { rows: academyRows } = await pool.query(
        "SELECT 1 FROM academies WHERE id = $1",
        [ACADEMY_ID],
      );
      const { rows: athleteRows } = await pool.query(
        "SELECT 1 FROM athletes WHERE id = $1",
        [ATHLETE_ID],
      );
      expect(academyRows).toHaveLength(1);
      expect(athleteRows).toHaveLength(1);
    },
    30_000,
  );

  it.skipIf(!ENABLED)(
    "tras un fallo de Stripe el cargo queda cobrable y un segundo intento concurrente sigue siendo seguro",
    async () => {
      // Reiniciamos el cargo y el log de calls entre tests.
      await resetChargeToPending();
      stripeCreateCalls.length = 0;

      // Primer intento: Stripe rechaza. El servicio marca el cargo como
      // failed y registra un payment_attempt; sigue siendo cobrable.
      const callA = collectCharge(CHARGE_ID);
      await new Promise((r) => setTimeout(r, 150));
      rejectStripeDeferred({ code: "card_declined", message: "Your card was declined." });
      const resultA = await callA;
      expect(resultA.ok).toBe(false);
      if (resultA.ok) throw new Error("unreachable: resultA failed branch");
      expect(resultA.status).toBe("failed");

      // Segundo + tercer intento concurrentes. El lock debe seguir
      // serializando: una sola llamada efectiva a Stripe, la otra se salta.
      // Aquí callA ya cometió y liberó el lock antes de arrancar B y C, así
      // que UNA de B/C llega a `paymentIntents.create` antes del release
      // (total 2: la fallida de A + la ganadora de B/C). La perdedora sigue
      // bloqueada en `pg_advisory_xact_lock` hasta el `releaseStripeDeferred`
      // de más abajo.
      const callB = collectCharge(CHARGE_ID);
      const callC = collectCharge(CHARGE_ID);
      await new Promise((r) => setTimeout(r, 200));
      expect(stripeCreateCalls).toHaveLength(2);

      releaseStripeDeferred({
        id: "pi_zal6_retry",
        status: "succeeded",
        latest_charge: "ch_zal6_retry",
      });
      const [resultB, resultC] = await Promise.all([callB, callC]);

      // Exactamente uno cobró y el otro se saltó — nunca dos cobros.
      const paidCount = [resultB, resultC].filter((r) => r.status === "paid").length;
      const skippedCount = [resultB, resultC].filter(
        (r) => r.status === "skipped" && r.reason === "NOT_COLLECTIBLE:paid",
      ).length;
      expect(paidCount).toBe(1);
      expect(skippedCount).toBe(1);
      expect(stripeCreateCalls).toHaveLength(2);

      const chargeRow = await fetchCharge();
      expect(chargeRow.status).toBe("paid");
    },
    30_000,
  );
});
