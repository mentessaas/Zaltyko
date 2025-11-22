import { logger } from "./logger";
import { getOptionalEnvVar, isProduction } from "./env";

export interface AnalyticsPayload {
  userId?: string;
  academyId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

const isAnalyticsDisabled = getOptionalEnvVar("NEXT_PUBLIC_DISABLE_ANALYTICS") === "true";

export async function trackEvent(eventName: string, payload: AnalyticsPayload = {}) {
  if (!eventName || isAnalyticsDisabled) {
    return;
  }

  try {
    if (!isProduction()) {
      logger.info(`analytics.${eventName}`, payload);
    }
    // Placeholder for future analytics provider integration (PostHog, Segment, etc.)
  } catch (error) {
    logger.warn("Failed to emit analytics event", { eventName, error });
  }
}


