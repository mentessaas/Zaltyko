import { getOptionalEnvVar, isProduction } from "./env";
import { logger } from "./logger";

export interface AnalyticsPayload {
  userId?: string;
  academyId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

const isAnalyticsDisabled = getOptionalEnvVar("NEXT_PUBLIC_DISABLE_ANALYTICS") === "true";

// posthog-js se importaba de forma estatica y quedaba en el bundle
// compartido de TODAS las paginas (incluida la home publica), sumando
// tiempo de parseo/ejecucion antes del primer paint. Se carga de forma
// perezosa (solo en cliente, solo cuando se usa) para que viva en un
// chunk aparte, igual que el fix de Sentry Replay.
let posthogModulePromise: Promise<typeof import("posthog-js")> | null = null;

function loadPostHog() {
  if (typeof window === "undefined") return null;
  if (!posthogModulePromise) {
    posthogModulePromise = import("posthog-js");
  }
  return posthogModulePromise;
}

// Initialize PostHog (call once in your app initialization)
export async function initAnalytics() {
  if (typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

  if (!key) {
    if (!isProduction()) {
      logger.info("Analytics: PostHog key not configured, running in dev mode");
    }
    return;
  }

  const mod = await loadPostHog();
  if (!mod) return;

  mod.posthog.init(key, {
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
export async function trackPageView(path: string, properties?: Record<string, unknown>) {
  if (isAnalyticsDisabled || typeof window === "undefined") {
    return;
  }

  try {
    const mod = await loadPostHog();
    mod?.posthog.capture("$pageview", {
      path,
      ...properties,
    });
  } catch (error) {
    logger.warn("Failed to track pageview", { path, error });
  }
}

// Track event
export async function trackEvent(eventName: string, payload: AnalyticsPayload = {}) {
  if (isAnalyticsDisabled) {
    return;
  }

  // Server-side product actions already call this helper (onboarding, invites,
  // billing and messaging). Previously those calls returned immediately, so
  // activation evidence described in the vault was never persisted. Keep the
  // browser path on PostHog, but persist authenticated milestones first-party
  // on the server without importing the DB layer into the client bundle.
  if (typeof window === "undefined") {
    try {
      const { userId, academyId, tenantId, metadata } = payload;
      const { recordGrowthEvent } = await import("@/lib/growth/events");
      const properties = Object.fromEntries(
        Object.entries(metadata ?? {}).filter(([, value]) =>
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        )
      ) as Record<string, string | number | boolean | null>;

      await recordGrowthEvent({
        eventName,
        userId: userId ?? null,
        academyId: academyId ?? null,
        tenantId: tenantId ?? null,
        source: "authenticated",
        properties,
      });
    } catch (error) {
      logger.warn("Failed to persist server analytics event", { eventName, error });
    }
    return;
  }

  try {
    const { userId, academyId, tenantId, metadata, ...rest } = payload;

    const mod = await loadPostHog();
    mod?.posthog.capture(eventName, {
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

  leadCaptured: (source?: string, plan?: string) =>
    trackEvent("lead_captured", { metadata: { source, plan } }),
};
