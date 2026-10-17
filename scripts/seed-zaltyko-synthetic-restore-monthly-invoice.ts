import assert from "node:assert/strict";

import {
  getMonthlyInvoiceOptions,
  issueMonthlyInvoice,
} from "@/modules/billing/application/monthly-invoice-service";
import { recordManualPaymentForCharge } from "@/modules/billing/application/ledger-service";

const ids = {
  organization: "10000000-0000-4000-8000-000000000010",
  location: "10000000-0000-4000-8000-000000000020",
  ownerUser: "10000000-0000-4000-8000-000000000001",
  ownerMember: "10000000-0000-4000-8000-000000000030",
} as const;

const invoiceIdempotencyKey = "synthetic-restore-november-invoice-001";
const paymentIdempotencyKey = "synthetic-restore-november-payment-001";
const actor = { userId: ids.ownerUser, memberId: ids.ownerMember };

function requireLocalSourceUrl(value: string | undefined): void {
  assert.ok(value, "DATABASE_URL is required for the local fixture seeder");
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.username, "postgres");
  assert.equal(url.password, "");
  assert.equal(url.pathname, "/zaltyko_restore_source");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
}

async function main(): Promise<void> {
  requireLocalSourceUrl(process.env.DATABASE_URL);

  const options = await getMonthlyInvoiceOptions({
    organizationId: ids.organization,
    locationId: ids.location,
    servicePeriod: "2026-11",
    actor,
  });
  const eligibleFamilies = options.families.filter(
    (family) =>
      family.canIssue && family.lines.length > 0 && family.payers.length > 0
  );
  assert.equal(
    eligibleFamilies.length,
    1,
    "Expected exactly one eligible synthetic family for the November restore invoice"
  );

  const family = eligibleFamilies[0];
  assert.ok(family);
  assert.ok(family.quoteHash);
  assert(family.lines.every((line) => line.amountCents > 1));
  const payer =
    family.payers.find((candidate) => candidate.isPrimary) ?? family.payers[0];
  assert.ok(payer);
  const command = {
    organizationId: ids.organization,
    locationId: ids.location,
    familyId: family.familyId,
    familyPayerId: payer.familyPayerId,
    servicePeriod: "2026-11",
    dueDate: "2026-11-30",
    quoteHash: family.quoteHash,
    idempotencyKey: invoiceIdempotencyKey,
    actor,
  };

  const issued = await issueMonthlyInvoice(command);
  assert.equal(issued.replayed, false);
  assert.equal(issued.invoice.status, "issued");
  assert.equal(issued.charges.length, family.lines.length);
  const openCharge = issued.charges.find((charge) => charge.status === "due");
  assert.ok(
    openCharge,
    "The synthetic invoice must have an open manual charge"
  );

  await recordManualPaymentForCharge({
    organizationId: ids.organization,
    chargeId: openCharge.id,
    amountCents: 1,
    method: "bank_transfer",
    receivedAt: new Date().toISOString(),
    idempotencyKey: paymentIdempotencyKey,
    actor,
  });

  const finalState = await issueMonthlyInvoice(command);
  assert.equal(finalState.replayed, true);
  assert.equal(finalState.invoice.id, issued.invoice.id);
  assert.equal(finalState.invoice.status, "partially_paid");
  assert(
    finalState.charges.some((charge) => charge.status === "partially_paid"),
    "The service-recorded payment must leave a partially paid charge"
  );

  console.log(
    JSON.stringify({
      status: "PASS",
      fixture: "service-seeded November monthly invoice",
      invoiceIdempotencyKey,
      paymentIdempotencyKey,
      statusAfterPayment: finalState.invoice.status,
      totalAmountCents: finalState.invoice.totalAmountCents,
      lines: issued.lines.length,
      charges: finalState.charges.length,
      paymentAmountCents: 1,
    })
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
