import { posthog } from "posthog-js";
import { getOptionalEnvVar, isProduction } from "./env";
import { logger } from "./logger";

export interface AnalyticsPayload {
  userId?: string;
  academyId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

const isAnalyticsDisabled = getOptionalEnvVar("NEXT_PUBLIC_DISABLE_ANALYTICS") === "true";

// Initialize PostHog (call once in your app initialization)
export function initAnalytics() {
  if (typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

  if (!key) {
    if (!isProduction()) {
      logger.info("Analytics: PostHog key not configured, running in dev mode");
    }
    return;
  }

  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    capture_pageview: false, // We'll track pageviews manually for better control
    capture_pageleave: true,
    loaded: (posthog) => {
      if (!isProduction()) {
        posthog.debug();
      }
    },
  });
}

// Track pageview
export function trackPageView(path: string, properties?: Record<string, unknown>) {
  if (isAnalyticsDisabled || typeof window === "undefined") {
    return;
  }

  try {
    posthog.capture("$pageview", {
      path,
      ...properties,
    });
  } catch (error) {
    logger.warn("Failed to track pageview", { path, error });
  }
}

// Track event
export async function trackEvent(eventName: string, payload: AnalyticsPayload = {}) {
  if (isAnalyticsDisabled || typeof window === "undefined") {
    return;
  }

  try {
    const { userId, academyId, tenantId, metadata, ...rest } = payload;

    posthog.capture(eventName, {
      user_id: userId,
      academy_id: academyId,
      tenant_id: tenantId,
      ...metadata,
      ...rest,
    });
  } catch (error) {
    logger.warn("Failed to emit analytics event", { eventName, error });
  }
}

// Convenience methods for common events
export const analytics = {
  pageView: (path: string, properties?: Record<string, unknown>) => trackPageView(path, properties),

  signUp: (userId: string, plan?: string) =>
    trackEvent("sign_up_completed", { userId, metadata: { plan } }),

  checkoutStarted: (userId: string, plan: string) =>
    trackEvent("checkout_started", { userId, metadata: { plan } }),

  checkoutCompleted: (userId: string, plan: string) =>
    trackEvent("checkout_completed", { userId, metadata: { plan } }),

  subscriptionUpgraded: (userId: string, fromPlan: string, toPlan: string) =>
    trackEvent("subscription_upgraded", { userId, metadata: { from_plan: fromPlan, to_plan: toPlan } }),

  subscriptionDowngraded: (userId: string, fromPlan: string, toPlan: string) =>
    trackEvent("subscription_downgraded", { userId, metadata: { from_plan: fromPlan, to_plan: toPlan } }),

  subscriptionCanceled: (userId: string, plan: string) =>
    trackEvent("subscription_canceled", { userId, metadata: { plan } }),

  leadCaptured: (email: string, source?: string) =>
    trackEvent("lead_captured", { metadata: { email, source } }),
};
