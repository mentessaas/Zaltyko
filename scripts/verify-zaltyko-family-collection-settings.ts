import assert from "node:assert/strict";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  charges,
  familyCollectionPreferences,
  organizationEntitlements,
  outboxEvents,
} from "@/db/zaltyko-schema";
import {
  getFamilyCollectionPreference,
  getChargeCollectionModeSnapshot,
  saveFamilyCollectionPreference,
} from "@/modules/billing/application/family-collection-preferences";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-0000-0000-000000000001";
const otherOrganizationId = "20000000-0000-0000-0000-000000000001";
const familyId = "10000000-0000-0000-0000-000000000601";
const otherFamilyId = "20000000-0000-0000-0000-000000000601";
const ownerUserId = "10000000-0000-0000-0000-000000000101";
const managerUserId = "20000000-0000-0000-0000-000000000102";
const chargeId = "10000000-0000-0000-0000-000000000721";

async function setContractPlan(planCode: "free" | "starter" | "growth") {
  const now = new Date();
  await db
    .update(organizationEntitlements)
    .set({
      planCode,
      source: "contract",
      sourceReference: `synthetic-contract-${planCode}-${now.getTime()}`,
      subscriptionId: null,
      effectiveFrom: now,
      effectiveUntil:
        planCode === "free"
          ? null
          : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    })
    .where(eq(organizationEntitlements.organizationId, organizationId));
}

const isDisabled = (error: unknown) =>
  error instanceof OperationalError &&
  error.code === "FAMILY_AUTOMATIC_COLLECTION_DISABLED" &&
  error.status === 409;

/**
 * Preferencia de cobro por familia con el cobro automático CERRADO (bandera
 * ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED apagada, el valor por defecto):
 * todo sigue en manual y «automático» responde 409, tenga o no plan de pago.
 *
 * Actualizado en la Fase 3 (Tarea 4): las comprobaciones anteriores esperaban
 * un diseño previo (preferencia «disponible» con plan de pago y modo
 * `automatic` del snapshot sin bandera ni autorización) que ya no existe. Los
 * casos con el cobro abierto viven en tests/family-collection-preferences-automatic.test.ts,
 * tests/family-collection-charge-mode.test.ts y la suite pg
 * tests/family-collection-plan-revision-pg.test.ts.
 */
async function main() {
  delete process.env.ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED;

  const [freeBootstrap] = await db
    .select({ planCode: organizationEntitlements.planCode })
    .from(organizationEntitlements)
    .where(eq(organizationEntitlements.organizationId, otherOrganizationId));
  assert.equal(freeBootstrap?.planCode, "free");

  const initial = await getFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
  });
  assert.equal(initial.requestedMode, "manual");
  assert.equal(initial.effectiveMode, "manual");
  assert.equal(initial.automaticPreferenceAvailable, false);
  assert.equal(initial.automaticProcessingEnabled, false);
  assert.equal(initial.automaticStatus, "not_released");
  assert.equal(initial.version, 0);

  const manual = await saveFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
    mode: "manual",
    expectedVersion: initial.version,
    idempotencyKey: "family-pref-manual-initial",
  });
  assert.equal(manual.requestedMode, "manual");
  assert.equal(manual.version, 1);

  await assert.rejects(
    () =>
      saveFamilyCollectionPreference({
        userId: ownerUserId,
        organizationId,
        familyId,
        mode: "manual",
        expectedVersion: 0,
        idempotencyKey: "family-pref-stale-version",
      }),
    (error: unknown) =>
      error instanceof OperationalError && error.code === "VERSION_CONFLICT"
  );

  const sameKeyReplay = await saveFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
    mode: "manual",
    expectedVersion: initial.version,
    idempotencyKey: "family-pref-manual-initial",
  });
  assert.equal(sameKeyReplay.version, manual.version);
  await assert.rejects(
    () =>
      saveFamilyCollectionPreference({
        userId: ownerUserId,
        organizationId,
        familyId,
        mode: "manual",
        expectedVersion: manual.version,
        idempotencyKey: "family-pref-manual-initial",
      }),
    (error: unknown) =>
      error instanceof OperationalError && error.code === "IDEMPOTENCY_CONFLICT"
  );

  for (const planCode of ["free", "growth"] as const) {
    await setContractPlan(planCode);
    const preference = await getFamilyCollectionPreference({
      userId: ownerUserId,
      organizationId,
      familyId,
    });
    assert.equal(preference.automaticPreferenceAvailable, false);
    assert.equal(preference.effectiveMode, "manual");
    await assert.rejects(
      () =>
        saveFamilyCollectionPreference({
          userId: ownerUserId,
          organizationId,
          familyId,
          mode: "automatic",
          expectedVersion: manual.version,
          idempotencyKey: `family-pref-auto-closed-${planCode}`,
        }),
      isDisabled
    );
  }

  // Con la bandera apagada las cuotas nacen manuales, también las mensuales.
  for (const invoiceKind of [undefined, "monthly"] as const) {
    assert.equal(
      await getChargeCollectionModeSnapshot({ executor: db, organizationId, familyId, invoiceKind }),
      "manual"
    );
  }
  const [existingCharge] = await db
    .select({ collectionMode: charges.collectionMode })
    .from(charges)
    .where(eq(charges.id, chargeId));
  assert.equal(existingCharge?.collectionMode, "manual");

  const [audit] = await db
    .select({ actorUserId: auditLog.actorUserId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        eq(auditLog.idempotencyKey, "family-collection-preference:family-pref-manual-initial")
      )
    )
    .limit(1);
  assert.equal(audit?.actorUserId, ownerUserId);

  const [outbox] = await db
    .select({ eventName: outboxEvents.eventName })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, organizationId),
        eq(outboxEvents.idempotencyKey, "family-collection-preference:family-pref-manual-initial")
      )
    )
    .limit(1);
  assert.equal(outbox?.eventName, "billing.family_collection_preference_changed");

  await assert.rejects(
    () =>
      saveFamilyCollectionPreference({
        userId: managerUserId,
        organizationId: otherOrganizationId,
        familyId: otherFamilyId,
        mode: "manual",
        expectedVersion: 0,
        idempotencyKey: "family-pref-manager-denied",
      }),
    (error: unknown) => error instanceof OperationalError && error.code === "FORBIDDEN"
  );
  await assert.rejects(
    () =>
      getFamilyCollectionPreference({
        userId: ownerUserId,
        organizationId: otherOrganizationId,
        familyId: otherFamilyId,
      }),
    (error: unknown) => error instanceof OperationalError && error.code === "FORBIDDEN"
  );
  await assert.rejects(
    () =>
      getFamilyCollectionPreference({
        userId: ownerUserId,
        organizationId,
        familyId: otherFamilyId,
      }),
    (error: unknown) => error instanceof OperationalError && error.code === "NOT_FOUND"
  );

  const [preference] = await db
    .select({
      familyId: familyCollectionPreferences.familyId,
      requestedMode: familyCollectionPreferences.requestedMode,
      entitlementRevision: familyCollectionPreferences.entitlementRevision,
    })
    .from(familyCollectionPreferences)
    .where(
      and(
        eq(familyCollectionPreferences.organizationId, organizationId),
        eq(familyCollectionPreferences.familyId, familyId)
      )
    );
  assert.equal(preference?.familyId, familyId);
  assert.equal(preference?.requestedMode, "manual");
  assert.ok(preference?.entitlementRevision);

  console.log(
    "Per-family collection preference with automatic collection closed (manual only, 409 for automatic), authorization and audit/outbox: PASS"
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
