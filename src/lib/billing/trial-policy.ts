export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_COOLDOWN_DAYS = 365;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialEligibilityReason =
  | "eligible"
  | "active_trial"
  | "cooldown"
  | "paid_plan_active"
  | "academy_not_found";

export function addTrialDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

export function evaluateTrialPolicy(params: {
  now: Date;
  activeTrial?: { startedAt: Date; endsAt: Date } | null;
  lastTrialStartedAt?: Date | null;
  hasPaidPlan: boolean;
}) {
  if (params.activeTrial && params.activeTrial.endsAt > params.now) {
    return {
      eligible: false,
      active: true,
      reason: "active_trial" as const,
      nextEligibleAt: addTrialDays(params.activeTrial.startedAt, TRIAL_COOLDOWN_DAYS),
    };
  }

  if (params.hasPaidPlan) {
    return {
      eligible: false,
      active: false,
      reason: "paid_plan_active" as const,
      nextEligibleAt: null,
    };
  }

  const nextEligibleAt = params.lastTrialStartedAt
    ? addTrialDays(params.lastTrialStartedAt, TRIAL_COOLDOWN_DAYS)
    : null;
  const eligible = !nextEligibleAt || nextEligibleAt <= params.now;
  return {
    eligible,
    active: false,
    reason: eligible ? ("eligible" as const) : ("cooldown" as const),
    nextEligibleAt,
  };
}
