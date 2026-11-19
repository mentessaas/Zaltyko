"use client";

import { useEffect } from "react";
import {
  initAnalytics,
  revokeAnalytics,
  suspendAnalytics,
  trackPageView,
} from "@/lib/analytics";
import { subscribeConsent } from "@/lib/consent/state";
import { getSafePublicTrackingPath } from "@/lib/optional-tracking-policy";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  usePageTracking();

  return <>{children}</>;
}

// Hook to track page views
export function usePageTracking() {
  useEffect(() => {
    let consentGranted = false;
    let lastTrackedPath: string | null = null;

    const handleNavigation = () => {
      const path = window.location.pathname;
      if (!consentGranted || !getSafePublicTrackingPath(path)) {
        lastTrackedPath = null;
        suspendAnalytics();
        return;
      }
      lastTrackedPath = path;
      void trackPageView(path);
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener("popstate", handleNavigation);

    // Override pushState to track programmatic navigation
    const originalPushState = window.history.pushState;
    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleNavigation();
    };

    const unsubscribeConsent = subscribeConsent((snapshot) => {
      const wasConsentGranted = consentGranted;
      consentGranted = snapshot.value === "granted";
      if (!consentGranted) {
        revokeAnalytics();
        return;
      }

      const path = window.location.pathname;
      if (!getSafePublicTrackingPath(path)) {
        lastTrackedPath = null;
        suspendAnalytics();
        return;
      }
      if (lastTrackedPath === path) {
        if (!wasConsentGranted) void initAnalytics();
        return;
      }
      lastTrackedPath = path;
      void trackPageView(path);
    });

    return () => {
      window.removeEventListener("popstate", handleNavigation);
      window.history.pushState = originalPushState;
      unsubscribeConsent();
    };
  }, []);
}
