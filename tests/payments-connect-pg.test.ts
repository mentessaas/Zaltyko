import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import {
  getConnectStatus,
  startConnectOnboarding,
  syncConnectAccountFromEvent,
} from "@/modules/payments-connect/application/connect-onboarding-service";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import type { ConnectAccountSnapshot } from "@/modules/payments-connect/domain/account-projection";
import type { ConnectAccountsGateway } from "@/modules/payments-connect/infrastructure/stripe-connect-gateway";

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

/**
 * Servicio de Conectar Stripe sobre la base real con Stripe simulado: carreras
 * al crear la cuenta, aislamiento entre academias y sincronización por evento.
 * Es autónomo: instala el candidato si el bloque anterior ya lo retiró y lo
 * retira al terminar.
 */
describeDisposablePg("servicio de Conectar Stripe en Postgres desechable", () => {
  const createdOrganizations: string[] = [];
  let installedHere = false;

  function accountReference(): string {
    return `acct_CI${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }

  function freshSnapshot(id: string): ConnectAccountSnapshot {
    return {
      id,
      closed: false,
      cardPaymentsStatus: null,
      sepaDebitPaymentsStatus: null,
      requirementEntries: [{ deadlineStatus: "currently_due", awaitingActionFrom: "user" }],
    };
  }

  function activeSnapshot(id: string): ConnectAccountSnapshot {
    return { id, closed: false, cardPaymentsStatus: "active", sepaDebitPaymentsStatus: "active", requirementEntries: [] };
  }

  /** Academia española con plan de pago por contrato y su owner. */
  async function createPaidAcademy(label: string): Promise<{ organizationId: string; ownerId: string }> {
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    await db.execute(sql`insert into auth.users (id, email) values (${ownerId}::uuid, ${`ci-connect-${ownerId}@example.invalid`})`);
    await db.execute(sql`
      insert into zaltyko.organizations (id, name, status, default_timezone, default_currency)
      values (${organizationId}::uuid, ${`CI Conectar ${label}`}, 'active'::zaltyko.organization_status, 'Europe/Madrid', 'EUR')
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
    createdOrganizations.push(organizationId);
    return { organizationId, ownerId };
  }

  /**
   * Stripe simulado. `createAccount` espera a que entren las dos peticiones
   * antes de responder, para que ambas lleguen a insertar sin ver la fila de
   * la otra (carrera real, no secuencial).
   */
  function racingGateway(accountIds: [string, string]) {
    let entered = 0;
    let release: () => void = () => undefined;
    const bothInside = new Promise<void>((resolveBarrier) => {
      release = resolveBarrier;
    });
    return {
      createAccount: vi.fn(async () => {
        const id = accountIds[Math.min(entered, 1)];
        entered += 1;
        if (entered >= 2) release();
        await bothInside;
        return freshSnapshot(id);
      }),
      retrieveAccount: vi.fn(async (id: string) => freshSnapshot(id)),
      createOnboardingLink: vi.fn(async (input: { accountId: string }) => ({
        url: `https://connect.stripe.test/setup/${input.accountId}`,
      })),
      parseAccountEvent: vi.fn(),
    } satisfies ConnectAccountsGateway;
  }

  function singleGateway(id: string, retrieved: ConnectAccountSnapshot = freshSnapshot(id)) {
    return {
      createAccount: vi.fn(async () => freshSnapshot(id)),
      retrieveAccount: vi.fn(async () => retrieved),
      createOnboardingLink: vi.fn(async () => ({ url: `https://connect.stripe.test/setup/${id}` })),
      parseAccountEvent: vi.fn(),
    } satisfies ConnectAccountsGateway;
  }

  async function accountRows(organizationId: string) {
    const result = await db.execute(sql`
      select provider_account_reference as "reference", status::text as "status", revision,
             requirements_state as "requirementsState", last_provider_event_reference as "eventReference"
        from zaltyko.organization_payment_provider_accounts
       where organization_id = ${organizationId}::uuid
    `);
    return result.rows as Array<{ reference: string; status: string; revision: number; requirementsState: string; eventReference: string | null }>;
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
      await db.execute(sql.raw(candidate()));
      installedHere = true;
    }
    vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_ci_connect_fake");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (!disposablePgEnabled) return;
    for (const organizationId of createdOrganizations) {
      await db.execute(sql`delete from zaltyko.organization_payment_provider_accounts where organization_id = ${organizationId}::uuid`);
    }
    if (installedHere) {
      await db.execute(sql`
        alter table zaltyko.organization_payment_provider_accounts
          drop column if exists sepa_debit_payments_capability_status,
          drop column if exists requirements_state
      `);
    }
  });

  it("dos altas simultáneas con la misma acct_ (idempotencia) dejan una sola fila", async () => {
    const academy = await createPaidAcademy("Misma cuenta");
    const reference = accountReference();
    const gateway = racingGateway([reference, reference]);
    const warn = vi.spyOn(logger, "warn");
    warn.mockClear();

    const input = { userId: academy.ownerId, organizationId: academy.organizationId };
    const results = await Promise.all([
      startConnectOnboarding(input, { gateway }),
      startConnectOnboarding(input, { gateway }),
    ]);

    expect(gateway.createAccount).toHaveBeenCalledTimes(2);
    // R8: Stripe recibe solo academia y entorno, los mismos datos que la clave.
    for (const call of gateway.createAccount.mock.calls as unknown as Array<[Record<string, unknown>]>) {
      expect(call[0]).toEqual({ organizationId: academy.organizationId, environment: "test" });
    }
    expect(results).toEqual([
      { url: `https://connect.stripe.test/setup/${reference}` },
      { url: `https://connect.stripe.test/setup/${reference}` },
    ]);
    const rows = await accountRows(academy.organizationId);
    expect(rows).toEqual([
      { reference, status: "onboarding", revision: 1, requirementsState: "user_action", eventReference: null },
    ]);
    expect(await auditCount(academy.organizationId, "payments_connect.account_created")).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    // La fila nace sin sincronizar: el primer refresco al volver de Stripe la lee.
    const synced = await db.execute(sql`
      select last_synced_at is null as "neverSynced"
        from zaltyko.organization_payment_provider_accounts
       where organization_id = ${academy.organizationId}::uuid
    `);
    expect(synced.rows).toEqual([{ neverSynced: true }]);
  });

  it("si Stripe devuelve acct_ distintas queda una fila y un aviso con las dos", async () => {
    const academy = await createPaidAcademy("Cuentas distintas");
    const first = accountReference();
    const second = accountReference();
    const gateway = racingGateway([first, second]);
    const warn = vi.spyOn(logger, "warn");
    warn.mockClear();

    const input = { userId: academy.ownerId, organizationId: academy.organizationId };
    const results = await Promise.all([
      startConnectOnboarding(input, { gateway }),
      startConnectOnboarding(input, { gateway }),
    ]);

    const rows = await accountRows(academy.organizationId);
    expect(rows).toHaveLength(1);
    const stored = rows[0].reference;
    expect([first, second]).toContain(stored);
    const discarded = stored === first ? second : first;
    // Las dos peticiones reciben el enlace de la cuenta guardada.
    expect(results).toEqual([
      { url: `https://connect.stripe.test/setup/${stored}` },
      { url: `https://connect.stripe.test/setup/${stored}` },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual({
      organizationId: academy.organizationId,
      storedAccountId: stored,
      discardedAccountId: discarded,
    });
    expect(await auditCount(academy.organizationId, "payments_connect.account_created")).toBe(1);
  });

  it("el owner de la academia B no ve ni crea la cuenta de A", async () => {
    const academyA = await createPaidAcademy("Aislamiento A");
    const academyB = await createPaidAcademy("Aislamiento B");
    const referenceA = accountReference();
    await startConnectOnboarding(
      { userId: academyA.ownerId, organizationId: academyA.organizationId },
      { gateway: singleGateway(referenceA) }
    );

    const intruder = singleGateway(accountReference());
    await expect(
      getConnectStatus({ userId: academyB.ownerId, organizationId: academyA.organizationId, refresh: true }, { gateway: intruder })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      startConnectOnboarding({ userId: academyB.ownerId, organizationId: academyA.organizationId }, { gateway: intruder })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(intruder.createAccount).not.toHaveBeenCalled();
    expect(intruder.retrieveAccount).not.toHaveBeenCalled();

    // B solo ve lo suyo: aún sin cuenta.
    expect(
      await getConnectStatus({ userId: academyB.ownerId, organizationId: academyB.organizationId, refresh: false }, { gateway: intruder })
    ).toEqual({ kind: "not_connected" });
    expect(
      await getConnectStatus({ userId: academyA.ownerId, organizationId: academyA.organizationId, refresh: false }, { gateway: intruder })
    ).toEqual({ kind: "needs_details", card: "pending", sepa: "pending", disabled: false });
    expect(await accountRows(academyB.organizationId)).toEqual([]);
  });

  it("el evento de la cuenta de A solo actualiza la fila de A y sube revision una vez", async () => {
    const academyA = await createPaidAcademy("Evento A");
    const academyB = await createPaidAcademy("Evento B");
    const referenceA = accountReference();
    const referenceB = accountReference();
    await startConnectOnboarding({ userId: academyA.ownerId, organizationId: academyA.organizationId }, { gateway: singleGateway(referenceA) });
    await startConnectOnboarding({ userId: academyB.ownerId, organizationId: academyB.organizationId }, { gateway: singleGateway(referenceB) });

    const gateway = singleGateway(referenceA, activeSnapshot(referenceA));
    const eventId = `evt_ci_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    expect(await syncConnectAccountFromEvent({ eventId, accountId: referenceA, livemode: false }, { gateway })).toBe("synced");
    // El mismo estado otra vez no cambia nada más que la hora de sincronización.
    expect(
      await syncConnectAccountFromEvent({ eventId: `${eventId}_bis`, accountId: referenceA, livemode: false }, { gateway })
    ).toBe("unchanged");
    expect(gateway.retrieveAccount).toHaveBeenCalledTimes(2);
    expect(gateway.retrieveAccount).toHaveBeenCalledWith(referenceA);

    expect(await accountRows(academyA.organizationId)).toEqual([
      { reference: referenceA, status: "active", revision: 2, requirementsState: "none", eventReference: eventId },
    ]);
    expect(await accountRows(academyB.organizationId)).toEqual([
      { reference: referenceB, status: "onboarding", revision: 1, requirementsState: "user_action", eventReference: null },
    ]);
    expect(await auditCount(academyA.organizationId, "payments_connect.account_synced")).toBe(1);
    expect(await auditCount(academyB.organizationId, "payments_connect.account_synced")).toBe(0);

    // Una acct_ que no está en la tabla se ignora sin escribir.
    const unknown = singleGateway(accountReference());
    expect(
      await syncConnectAccountFromEvent({ eventId: `${eventId}_x`, accountId: accountReference(), livemode: false }, { gateway: unknown })
    ).toBe("ignored");
    expect(unknown.retrieveAccount).not.toHaveBeenCalled();
  });
});
