import assert from "node:assert/strict";

import { Pool } from "pg";

import {
  allocatePayment,
  issueInvoice,
  processLocalSandboxProviderEvent,
  reconcileFinancialPeriod,
} from "@/modules/billing/application/ledger-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

const ID = {
  org: "10000000-0000-0000-0000-000000000001",
  location: "10000000-0000-0000-0000-000000000011",
  ownerUser: "10000000-0000-0000-0000-000000000101",
  ownerMember: "10000000-0000-0000-0000-000000000201",
  family: "10000000-0000-0000-0000-000000000601",
  payer: "10000000-0000-0000-0000-000000000631",
  multiOrg: "20000000-0000-0000-0000-000000000001",
  multiNorth: "20000000-0000-0000-0000-000000000011",
  multiManagerUser: "20000000-0000-0000-0000-000000000102",
  multiManagerMember: "20000000-0000-0000-0000-000000000202",
  multiFamily: "20000000-0000-0000-0000-000000000601",
  multiPayer: "20000000-0000-0000-0000-000000000631",
};

const owner = { userId: ID.ownerUser, memberId: ID.ownerMember };
const manager = {
  userId: ID.multiManagerUser,
  memberId: ID.multiManagerMember,
};

async function count(table: string, where = "true"): Promise<number> {
  const result = await pool.query(
    `select count(*)::int as count from ${table} where ${where}`
  );
  return Number(result.rows[0].count);
}

async function expectOperationalError(
  operation: () => Promise<unknown>,
  code: OperationalError["code"]
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert(error instanceof OperationalError);
    assert.equal(error.code, code);
    return true;
  });
}

async function main(): Promise<void> {
  const now = new Date();
  const serviceDate = now.toISOString().slice(0, 10);
  const dueAt = new Date(now.getTime() + 86_400_000).toISOString();

  await expectOperationalError(
    () =>
      issueInvoice({
        organizationId: ID.multiOrg,
        locationId: ID.multiNorth,
        familyId: ID.multiFamily,
        familyPayerId: ID.multiPayer,
        reference: "SYNTH-MANAGER-DENIED",
        currency: "EUR",
        dueAt,
        lines: [
          {
            lineType: "membership",
            quantity: 1,
            unitAmountCents: 10000,
            servicePeriodStart: serviceDate,
            servicePeriodEnd: serviceDate,
          },
        ],
        idempotencyKey: "ledger-manager-denied",
        actor: manager,
      }),
    "FORBIDDEN"
  );

  const invoiceCommand = {
    organizationId: ID.org,
    locationId: ID.location,
    familyId: ID.family,
    familyPayerId: ID.payer,
    reference: "SYNTH-2026-LEDGER-001",
    currency: "EUR" as const,
    dueAt,
    lines: [
      {
        lineType: "membership",
        quantity: 1,
        unitAmountCents: 10000,
        servicePeriodStart: serviceDate,
        servicePeriodEnd: serviceDate,
      },
    ],
    idempotencyKey: "ledger-invoice-001",
    actor: owner,
  };
  const invoice = await issueInvoice(invoiceCommand);
  const invoiceRetry = await issueInvoice(invoiceCommand);
  assert.equal(invoiceRetry.id, invoice.id);
  assert.equal(invoice.totalAmountCents, 10000);
  const chargeResult = await pool.query(
    "select id from zaltyko.charges where invoice_id = $1",
    [invoice.id]
  );
  const chargeId = String(chargeResult.rows[0].id);

  const failed = await processLocalSandboxProviderEvent({
    processor: "local",
    environment: "sandbox",
    providerEventId: "evt_synthetic_failed_001",
    signatureVerified: true,
    payload: {
      type: "payment.failed",
      organizationId: ID.org,
      locationId: ID.location,
      familyId: ID.family,
      familyPayerId: ID.payer,
      invoiceId: invoice.id,
      amountCents: 6000,
      currency: "EUR",
      providerAttemptId: "attempt_synthetic_failed_001",
      failureCode: "card_declined",
      attemptedAt: now.toISOString(),
    },
  });
  assert.equal(failed.status, "processed");

  const successCommand = {
    processor: "local" as const,
    environment: "sandbox" as const,
    providerEventId: "evt_synthetic_success_001",
    signatureVerified: true as const,
    payload: {
      type: "payment.succeeded" as const,
      organizationId: ID.org,
      locationId: ID.location,
      familyId: ID.family,
      familyPayerId: ID.payer,
      invoiceId: invoice.id,
      amountCents: 6000,
      currency: "EUR",
      providerAttemptId: "attempt_synthetic_success_001",
      providerPaymentId: "payment_synthetic_001",
      attemptedAt: now.toISOString(),
    },
  };
  const delivered = await Promise.all([
    processLocalSandboxProviderEvent(successCommand),
    processLocalSandboxProviderEvent(successCommand),
    processLocalSandboxProviderEvent(successCommand),
  ]);
  assert(delivered.every((event) => event.status === "processed"));
  assert.equal(
    await count(
      "zaltyko.payments",
      "provider_payment_id = 'payment_synthetic_001'"
    ),
    1
  );
  assert.equal(
    await count(
      "zaltyko.payment_attempts",
      "provider_attempt_id = 'attempt_synthetic_success_001'"
    ),
    1
  );
  await expectOperationalError(
    () =>
      processLocalSandboxProviderEvent({
        ...successCommand,
        payload: { ...successCommand.payload, amountCents: 5999 },
      }),
    "IDEMPOTENCY_CONFLICT"
  );

  const paymentResult = await pool.query(
    "select id from zaltyko.payments where provider_payment_id = $1",
    ["payment_synthetic_001"]
  );
  const paymentId = String(paymentResult.rows[0].id);
  const allocatedAt = new Date(now.getTime() + 1_000).toISOString();
  const allocation = await allocatePayment({
    organizationId: ID.org,
    paymentId,
    chargeId,
    amountCents: 6000,
    allocatedAt,
    idempotencyKey: "ledger-allocation-001",
    actor: owner,
  });
  assert.equal(allocation.amountCents, 6000);
  await expectOperationalError(
    () =>
      allocatePayment({
        organizationId: ID.org,
        paymentId,
        chargeId,
        amountCents: 1,
        allocatedAt,
        idempotencyKey: "ledger-allocation-overpay",
        actor: owner,
      }),
    "INSUFFICIENT_UNALLOCATED_PAYMENT"
  );

  const refund = await processLocalSandboxProviderEvent({
    processor: "local",
    environment: "sandbox",
    providerEventId: "evt_synthetic_refund_001",
    signatureVerified: true,
    payload: {
      type: "refund.succeeded",
      organizationId: ID.org,
      paymentId,
      paymentAllocationId: allocation.id,
      amountCents: 1000,
      currency: "EUR",
      providerRefundId: "refund_synthetic_001",
      reasonCode: "customer_request",
      refundedAt: new Date(now.getTime() + 2_000).toISOString(),
    },
  });
  assert.equal(refund.status, "processed");
  await expectOperationalError(
    () =>
      processLocalSandboxProviderEvent({
        processor: "local",
        environment: "sandbox",
        providerEventId: "evt_synthetic_refund_over_001",
        signatureVerified: true,
        payload: {
          type: "refund.succeeded",
          organizationId: ID.org,
          paymentId,
          paymentAllocationId: allocation.id,
          amountCents: 5001,
          currency: "EUR",
          providerRefundId: "refund_synthetic_over_001",
          reasonCode: "customer_request",
          refundedAt: new Date(now.getTime() + 3_000).toISOString(),
        },
      }),
    "REFUND_EXCEEDS_ALLOCATION"
  );

  const reconciliation = await reconcileFinancialPeriod({
    organizationId: ID.org,
    authorizationLocationId: ID.location,
    currency: "EUR",
    periodStart: serviceDate,
    periodEnd: serviceDate,
    sourceWatermark: new Date(now.getTime() + 4_000).toISOString(),
    idempotencyKey: "ledger-reconciliation-001",
    actor: owner,
  });
  assert.deepEqual(
    {
      expected: reconciliation.expectedCents,
      allocated: reconciliation.allocatedCents,
      refunded: reconciliation.refundedCents,
      net: reconciliation.netCollectedCents,
      outstanding: reconciliation.outstandingCents,
    },
    {
      expected: 10000,
      allocated: 6000,
      refunded: 1000,
      net: 5000,
      outstanding: 4000,
    }
  );

  const outboxCount = await count(
    "zaltyko.outbox_events",
    "event_name in ('invoice.issued','charge.due','payment.attempt_failed','payment.succeeded','payment.allocated','payment.refunded','financial.period_reconciled')"
  );
  const auditCount = await count(
    "zaltyko.audit_log",
    "action in ('invoice.issued','charge.due','payment.attempt_failed','payment.succeeded','payment.allocated','payment.refunded','financial.period_reconciled')"
  );
  assert.equal(outboxCount, 7);
  assert.equal(auditCount, 7);
  const unsafePayloads = await count(
    "zaltyko.outbox_events",
    "payload::text ~* '\"(email|phone|name|address|secret|token)\"'"
  );
  assert.equal(unsafePayloads, 0);

  console.log(
    JSON.stringify({
      status: "PASS",
      expectedCents: reconciliation.expectedCents,
      netCollectedCents: reconciliation.netCollectedCents,
      outstandingCents: reconciliation.outstandingCents,
      providerDeliveries: delivered.length,
      financialEffects:
        (await count("zaltyko.payments")) + (await count("zaltyko.refunds")),
      outbox: outboxCount,
      audit: auditCount,
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
