import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { evaluateTrialPolicy } from "@/lib/billing/trial-policy";
import { getRequiredRoutePermission } from "@/lib/authz/route-permissions";
import { canRetryBillingEvent, shouldApplyStripeEvent } from "@/lib/stripe/event-policy";
import { resolvePlanCode } from "@/lib/stripe/sync-plans";
import {
  hasSubscriptionAccess,
  isSubscriptionManaged,
} from "@/lib/billing/subscription-status";
import { verifyWebhookSignature } from "@/lib/stripe/webhook-handler";

function stripePrice(params: {
  priceMetadata?: Record<string, string>;
  productMetadata?: Record<string, string>;
  nickname?: string;
}) {
  return {
    metadata: params.priceMetadata ?? {},
    nickname: params.nickname ?? null,
    product: {
      id: "prod_test",
      object: "product",
      deleted: false,
      metadata: params.productMetadata ?? {},
    },
  } as unknown as Stripe.Price;
}

describe("Phase 1 production contracts", () => {
  it("enforces the seven-day trial and twelve-month cooldown policy", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    expect(evaluateTrialPolicy({ now, hasPaidPlan: false }).reason).toBe("eligible");

    const active = evaluateTrialPolicy({
      now,
      hasPaidPlan: false,
      activeTrial: {
        startedAt: new Date("2026-07-10T12:00:00.000Z"),
        endsAt: new Date("2026-07-17T12:00:00.000Z"),
      },
    });
    expect(active).toMatchObject({ active: true, eligible: false, reason: "active_trial" });

    const cooldown = evaluateTrialPolicy({
      now,
      hasPaidPlan: false,
      lastTrialStartedAt: new Date("2026-01-12T12:00:00.000Z"),
    });
    expect(cooldown).toMatchObject({ active: false, eligible: false, reason: "cooldown" });

    expect(evaluateTrialPolicy({ now, hasPaidPlan: true }).reason).toBe("paid_plan_active");
  });

  it("maps protected academy modules to explicit capabilities", () => {
    expect(getRequiredRoutePermission("/api/athletes/abc", "PATCH")).toBe("athletes:update");
    expect(getRequiredRoutePermission("/api/classes/abc", "DELETE")).toBe("classes:delete");
    expect(getRequiredRoutePermission("/api/class-sessions/session-1", "POST")).toBe(
      "classes:schedule"
    );
    expect(getRequiredRoutePermission("/api/attendance", "POST")).toBe("classes:schedule");
    expect(getRequiredRoutePermission("/api/assessments/athlete-1", "POST")).toBe(
      "athletes:update"
    );
    expect(getRequiredRoutePermission("/api/groups/group-1", "PATCH")).toBe(
      "classes:update"
    );
    expect(getRequiredRoutePermission("/api/messages/conversations", "GET")).toBe(
      "communications:read"
    );
    expect(getRequiredRoutePermission("/api/classes/abc/generate-sessions", "POST")).toBe(
      "classes:schedule"
    );
    expect(getRequiredRoutePermission("/api/billing/checkout", "POST")).toBe("billing:update");
    expect(getRequiredRoutePermission("/api/invitations", "POST")).toBe("settings:users");
    expect(getRequiredRoutePermission("/api/academy-memberships/member-1", "DELETE")).toBe(
      "settings:users"
    );
    expect(getRequiredRoutePermission("/api/charges/charge-1/refund", "POST")).toBe(
      "billing:payments"
    );
    expect(getRequiredRoutePermission("/api/guardians", "POST")).toBe("athletes:create");
    expect(
      getRequiredRoutePermission(
        "/api/academies/academy-1/settings",
        "PATCH"
      )
    ).toBe("settings:write");
    expect(
      getRequiredRoutePermission(
        "/api/academies/academy-1/roles/role-1/members",
        "POST"
      )
    ).toBe("settings:users");
    expect(getRequiredRoutePermission("/api/public/events", "GET")).toBeNull();
    expect(getRequiredRoutePermission("/api/assessments/videos", "DELETE")).toBe(
      "athletes:update"
    );
    expect(getRequiredRoutePermission("/api/messages/conversations/id", "DELETE")).toBe(
      "communications:send"
    );
    expect(getRequiredRoutePermission("/api/reports/scheduled/id", "PATCH")).toBe(
      "reports:create"
    );
    expect(getRequiredRoutePermission("/api/academies", "POST")).toBeNull();
  });

  it("deduplicates active webhook leases and retries errors or stale leases", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    expect(canRetryBillingEvent({ status: "processed", lastAttemptAt: now, now })).toBe(false);
    expect(canRetryBillingEvent({ status: "error", lastAttemptAt: now, now })).toBe(true);
    expect(
      canRetryBillingEvent({
        status: "processing",
        lastAttemptAt: new Date(now.getTime() - 6 * 60 * 1000),
        now,
      })
    ).toBe(true);
  });

  it("rejects out-of-order subscription snapshots", () => {
    const applied = new Date("2026-07-12T12:00:00.000Z");
    expect(shouldApplyStripeEvent(applied, new Date("2026-07-12T11:59:59.000Z"))).toBe(false);
    expect(shouldApplyStripeEvent(applied, new Date("2026-07-12T12:00:01.000Z"))).toBe(true);
  });

  it("syncs only canonical Stripe prices with explicit plan metadata", () => {
    expect(resolvePlanCode(stripePrice({ priceMetadata: { plan_code: "starter" } }))).toBe("pro");
    expect(resolvePlanCode(stripePrice({ productMetadata: { plan_code: "growth" } }))).toBe(
      "premium"
    );
    expect(resolvePlanCode(stripePrice({ nickname: "Professional" }))).toBeNull();
    expect(resolvePlanCode(stripePrice({ priceMetadata: { plan_code: "network" } }))).toBeNull();
  });

  it("does not grant paid access for an abandoned or incomplete Checkout", () => {
    expect(hasSubscriptionAccess("incomplete")).toBe(false);
    expect(hasSubscriptionAccess("active")).toBe(true);
    expect(hasSubscriptionAccess("past_due")).toBe(true);
    expect(
      isSubscriptionManaged({ stripeSubscriptionId: "sub_123", status: "incomplete" })
    ).toBe(true);
    expect(
      isSubscriptionManaged({ stripeSubscriptionId: "sub_123", status: "canceled" })
    ).toBe(false);
  });

  it("rejects an unsigned Stripe webhook as a signature failure", () => {
    expect(() => verifyWebhookSignature("{}", null, "whsec_test")).toThrow(
      "SIGNATURE_VERIFICATION_FAILED"
    );
  });
});
