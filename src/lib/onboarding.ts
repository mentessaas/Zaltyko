import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, onboardingChecklistItems, onboardingStates, type OnboardingStepFlags } from "@/db/schema";
import { trackEvent } from "./analytics";
import {
  CHECKLIST_KEYS,
  CHECKLIST_DEFINITIONS,
  WIZARD_STEP_KEYS,
  WIZARD_STEPS,
  type ChecklistKey,
  type ChecklistStatus,
  type ChecklistDefinition,
  type WizardStepKey,
} from "./onboarding-utils";
import { getOptionalEnvVar, isTest } from "./env";

function shouldSkipOnboardingAutomation() {
  return getOptionalEnvVar("DISABLE_ONBOARDING_AUTOMATIONS") === "true" || isTest();
}

interface SeedOnboardingOptions {
  academyId: string;
  tenantId: string;
  ownerProfileId?: string | null;
  tx?: typeof db;
}

export async function seedOnboardingForAcademy({
  academyId,
  tenantId,
  ownerProfileId,
  tx,
}: SeedOnboardingOptions) {
  if (shouldSkipOnboardingAutomation()) {
    return;
  }

  const client = tx ?? db;

  await client
    .insert(onboardingStates)
    .values({
      academyId,
      tenantId,
      ownerProfileId: ownerProfileId ?? null,
      steps: {},
    })
    .onConflictDoNothing();

  const checklistPayload = CHECKLIST_DEFINITIONS.map((definition) => ({
    academyId,
    tenantId,
    key: definition.key,
    label: definition.label,
    description: definition.description,
  }));

  if (checklistPayload.length > 0) {
    await client.insert(onboardingChecklistItems).values(checklistPayload).onConflictDoNothing();
  }
}

interface MarkChecklistInput {
  academyId: string;
  key: ChecklistKey;
  tenantId?: string;
  status?: ChecklistStatus;
  tx?: typeof db;
}

const CHECKLIST_TRACKING_EVENT: Partial<Record<ChecklistKey, string>> = {
  create_first_group: "first_group_created",
  add_5_athletes: "five_athletes_added",
  invite_first_coach: "first_coach_invited",
  enable_payments: "payments_configured",
};

export async function markChecklistItem({
  academyId,
  key,
  tenantId,
  status = "completed",
  tx,
}: MarkChecklistInput) {
  if (shouldSkipOnboardingAutomation()) {
    return;
  }

  const client = tx ?? db;

  // Get tenantId from academy if not provided
  let finalTenantId = tenantId;
  if (!finalTenantId) {
    const [academy] = await client
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);
    
    if (!academy || !academy.tenantId) {
      throw new Error(`Academy ${academyId} not found or has no tenantId`);
    }
    
    finalTenantId = academy.tenantId;
  }

  const now = new Date();

  await client
    .insert(onboardingChecklistItems)
    .values({
      academyId,
      tenantId: finalTenantId,
      key,
      label: CHECKLIST_DEFINITIONS.find((definition) => definition.key === key)?.label ?? key,
      description:
        CHECKLIST_DEFINITIONS.find((definition) => definition.key === key)?.description ?? key,
      status,
      completedAt: status === "completed" ? now : null,
    })
    .onConflictDoUpdate({
      target: [onboardingChecklistItems.academyId, onboardingChecklistItems.key],
      set: {
        status,
        completedAt: status === "completed" ? now : null,
        updatedAt: now,
      },
    });

  const eventName = CHECKLIST_TRACKING_EVENT[key];
  if (status === "completed" && eventName) {
    await trackEvent(eventName, { academyId, metadata: { key } });
  }

  await maybeMarkAcademyActivated(academyId, client);
}

async function maybeMarkAcademyActivated(academyId: string, client = db) {
  if (shouldSkipOnboardingAutomation()) {
    return;
  }

  const requiredKeys: ChecklistKey[] = ["create_first_group", "add_5_athletes", "invite_first_coach"];
  const statuses = await client
    .select({
      key: onboardingChecklistItems.key,
      status: onboardingChecklistItems.status,
    })
    .from(onboardingChecklistItems)
    .where(and(eq(onboardingChecklistItems.academyId, academyId)));

  if (statuses.length === 0) {
    return;
  }

  const allCompleted = requiredKeys.every((required) =>
    statuses.some((item) => item.key === required && item.status === "completed")
  );

  if (allCompleted) {
    await trackEvent("academy_activated", { academyId });
  }
}

interface UpdateWizardStepOptions {
  academyId: string;
  tenantId?: string;
  step: WizardStepKey;
  tx?: typeof db;
}

export async function markWizardStep({
  academyId,
  tenantId,
  step,
  tx,
}: UpdateWizardStepOptions) {
  if (shouldSkipOnboardingAutomation()) {
    return;
  }

  const client = tx ?? db;
  
  // Get tenantId from academy if not provided
  let finalTenantId = tenantId;
  if (!finalTenantId) {
    const [academy] = await client
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);
    
    if (!academy || !academy.tenantId) {
      throw new Error(`Academy ${academyId} not found or has no tenantId`);
    }
    
    finalTenantId = academy.tenantId;
  }
  
  const [state] = await client
    .select({
      id: onboardingStates.id,
      steps: onboardingStates.steps,
    })
    .from(onboardingStates)
    .where(eq(onboardingStates.academyId, academyId))
    .limit(1);

  const currentSteps = (state?.steps as OnboardingStepFlags | null) ?? {};
  if (currentSteps[step]) {
    return;
  }

  const updatedSteps: OnboardingStepFlags = { ...currentSteps, [step]: true };
  const completedWizard = WIZARD_STEPS.every((definition) => updatedSteps[definition.key]);
  const nextIncompleteIndex = WIZARD_STEPS.findIndex((item) => !updatedSteps[item.key]);
  const currentStepValue = completedWizard
    ? WIZARD_STEPS.length
    : nextIncompleteIndex === -1
    ? WIZARD_STEPS.length
    : nextIncompleteIndex + 1;

  await client
    .insert(onboardingStates)
    .values({
      academyId,
      tenantId: finalTenantId,
      steps: updatedSteps,
      completedWizard,
      currentStep: currentStepValue,
    })
    .onConflictDoUpdate({
      target: onboardingStates.academyId,
      set: {
        steps: updatedSteps,
        completedWizard,
        currentStep: currentStepValue,
        lastCompletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function getOnboardingStatus(academyId: string) {
  const [state] = await db
    .select()
    .from(onboardingStates)
    .where(eq(onboardingStates.academyId, academyId))
    .limit(1);

  return state ?? null;
}

export async function getChecklist(academyId: string) {
  return db
    .select()
    .from(onboardingChecklistItems)
    .where(eq(onboardingChecklistItems.academyId, academyId))
    .orderBy(onboardingChecklistItems.createdAt);
}

// calculateDaysLeft moved to onboarding-utils.ts to avoid importing db in client components
export { calculateDaysLeft } from "./onboarding-utils";

export async function syncTrialStatus(academyId: string) {
  const [academy] = await db
    .select({
      id: academies.id,
      trialEndsAt: academies.trialEndsAt,
      isTrialActive: academies.isTrialActive,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    return;
  }

  if (!academy.trialEndsAt) {
    return;
  }

  const isActive = academy.trialEndsAt > new Date();
  if (isActive !== academy.isTrialActive) {
    await db
      .update(academies)
      .set({
        isTrialActive: isActive,
      })
      .where(eq(academies.id, academyId));

    if (!isActive) {
      await trackEvent("trial_ended", { academyId });
    }
  }
}


