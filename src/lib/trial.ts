import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getActiveSubscription } from "@/lib/limits";
import { syncTrialStatus } from "@/lib/onboarding";
import { isTest } from "@/lib/env";

export class TrialAccessError extends Error {
  status: number;
  payload?: Record<string, unknown>;

  constructor(message: string, status = 403, payload?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function assertPremiumFeatureAccess(academyId: string, feature: string) {
  if (isTest()) {
    return;
  }

  await syncTrialStatus(academyId);

  const [academy] = await db
    .select({
      id: academies.id,
      isTrialActive: academies.isTrialActive,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    throw new TrialAccessError("ACADEMY_NOT_FOUND", 404);
  }

  if (academy.isTrialActive) {
    return;
  }

  const subscription = await getActiveSubscription(academyId);
  if (subscription.planCode === "free") {
    throw new TrialAccessError("UPGRADE_REQUIRED", 402, {
      feature,
      upgradeTo: "pro",
    });
  }
}


