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

async function main() {
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
  assert.equal(initial.automaticPreferenceAvailable, true);
  assert.equal(initial.automaticProcessingEnabled, false);
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
        mode: "automatic",
        expectedVersion: 0,
        idempotencyKey: "family-pref-stale-version",
      }),
    (error: unknown) =>
      error instanceof OperationalError && error.code === "VERSION_CONFLICT"
  );

  await setContractPlan("free");
  const freePreference = await getFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
  });
  assert.equal(freePreference.automaticPreferenceAvailable, false);
  assert.equal(freePreference.effectiveMode, "manual");
  await assert.rejects(
    () =>
      saveFamilyCollectionPreference({
        userId: ownerUserId,
        organizationId,
        familyId,
        mode: "automatic",
        expectedVersion: manual.version,
        idempotencyKey: "family-pref-auto-free-rejected",
      }),
    (error: unknown) =>
      error instanceof OperationalError &&
      error.code === "FEATURE_NOT_AVAILABLE"
  );

  await setContractPlan("growth");
  const renewedEntitlement = await getFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
  });
  assert.equal(renewedEntitlement.automaticPreferenceAvailable, true);
  const saved = await saveFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
    mode: "automatic",
    expectedVersion: manual.version,
    idempotencyKey: "family-pref-auto-paid-contract",
  });
  assert.equal(saved.requestedMode, "automatic");
  assert.equal(saved.effectiveMode, "manual");
  assert.equal(saved.automaticPreferenceAvailable, true);
  assert.equal(saved.automaticProcessingEnabled, false);
  assert.equal(saved.requiresConfirmation, false);
  assert.equal(saved.version, 2);

  const chargeMode = await getChargeCollectionModeSnapshot({
    executor: db,
    organizationId,
    familyId,
  });
  assert.equal(chargeMode, "automatic");
  const [existingCharge] = await db
    .select({ collectionMode: charges.collectionMode })
    .from(charges)
    .where(eq(charges.id, chargeId));
  assert.equal(existingCharge?.collectionMode, "manual");

  const sameKeyReplay = await saveFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
    mode: "automatic",
    expectedVersion: manual.version,
    idempotencyKey: "family-pref-auto-paid-contract",
  });
  assert.equal(sameKeyReplay.requestedMode, "automatic");
  assert.equal(sameKeyReplay.version, saved.version);
  await assert.rejects(
    () =>
      saveFamilyCollectionPreference({
        userId: ownerUserId,
        organizationId,
        familyId,
        mode: "manual",
        expectedVersion: manual.version,
        idempotencyKey: "family-pref-auto-paid-contract",
      }),
    (error: unknown) =>
      error instanceof OperationalError && error.code === "IDEMPOTENCY_CONFLICT"
  );

  await setContractPlan("free");
  const downgraded = await getFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
  });
  assert.equal(downgraded.requestedMode, "automatic");
  assert.equal(downgraded.effectiveMode, "manual");
  assert.equal(downgraded.requiresConfirmation, true);
  assert.equal(downgraded.automaticPreferenceAvailable, false);
  assert.equal(
    await getChargeCollectionModeSnapshot({ executor: db, organizationId, familyId }),
    "manual"
  );

  await setContractPlan("starter");
  const renewedAgain = await getFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
  });
  assert.equal(renewedAgain.automaticPreferenceAvailable, true);
  assert.equal(renewedAgain.requiresConfirmation, true);
  assert.equal(
    await getChargeCollectionModeSnapshot({ executor: db, organizationId, familyId }),
    "manual"
  );
  const reaccepted = await saveFamilyCollectionPreference({
    userId: ownerUserId,
    organizationId,
    familyId,
    mode: "automatic",
    expectedVersion: saved.version,
    idempotencyKey: "family-pref-auto-renewed-explicit",
  });
  assert.equal(reaccepted.requiresConfirmation, false);
  assert.equal(reaccepted.version, 3);

  const [audit] = await db
    .select({ actorUserId: auditLog.actorUserId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        eq(
          auditLog.idempotencyKey,
          "family-collection-preference:family-pref-auto-paid-contract"
        )
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
        eq(
          outboxEvents.idempotencyKey,
          "family-collection-preference:family-pref-auto-paid-contract"
        )
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
  assert.equal(preference?.requestedMode, "automatic");
  assert.ok(preference?.entitlementRevision);

  console.log(
    "Per-family collection preference, paid entitlement, revision invalidation, authorization and audit/outbox: PASS"
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
