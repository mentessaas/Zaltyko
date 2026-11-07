"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  hasAnalyticsConsent,
  subscribeConsent,
} from "@/lib/consent/state";
import {
  isOptionalTrackingAllowed,
  optionalTrackingFlags,
  sanitizeSpeedInsightsEvent,
  sanitizeVercelAnalyticsEvent,
} from "@/lib/optional-tracking-policy";

const VercelAnalytics = lazy(() =>
  import("@vercel/analytics/react").then((module) => ({
    default: module.Analytics,
  }))
);

const VercelSpeedInsights = lazy(() =>
  import("@vercel/speed-insights/next").then((module) => ({
    default: module.SpeedInsights,
  }))
);

export function OptionalTelemetryBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [consentGranted, setConsentGranted] = useState(false);

  useEffect(
    () =>
      subscribeConsent((snapshot) => {
        setConsentGranted(snapshot.value === "granted");
      }),
    []
  );

  const canLoadVercelAnalytics = isOptionalTrackingAllowed(
    optionalTrackingFlags.vercelAnalytics,
    consentGranted && hasAnalyticsConsent(),
    pathname
  );
  const canLoadSpeedInsights = isOptionalTrackingAllowed(
    optionalTrackingFlags.speedInsights,
    consentGranted && hasAnalyticsConsent(),
    pathname
  );

  const vercelBeforeSend = (event: {
    type: "pageview" | "event";
    url: string;
  }) => {
    if (typeof window === "undefined") return null;
    return sanitizeVercelAnalyticsEvent(event, {
      enabled: optionalTrackingFlags.vercelAnalytics,
      consentGranted: hasAnalyticsConsent(),
      pathname: window.location.pathname,
      origin: window.location.origin,
    });
  };

  const speedInsightsBeforeSend = (event: {
    type: "vital";
    url: string;
    route?: string;
  }) => {
    if (typeof window === "undefined") return null;
    return sanitizeSpeedInsightsEvent(event, {
      enabled: optionalTrackingFlags.speedInsights,
      consentGranted: hasAnalyticsConsent(),
      pathname: window.location.pathname,
      origin: window.location.origin,
    });
  };

  return (
    <>
      {children}
      {(canLoadVercelAnalytics || canLoadSpeedInsights) && (
        <Suspense fallback={null}>
          {canLoadVercelAnalytics && (
            <VercelAnalytics beforeSend={vercelBeforeSend} />
          )}
          {canLoadSpeedInsights && (
            <VercelSpeedInsights beforeSend={speedInsightsBeforeSend} />
          )}
        </Suspense>
      )}
    </>
  );
}
