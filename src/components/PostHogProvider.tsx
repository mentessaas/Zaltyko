"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initAnalytics, stopAnalytics, trackPageView } from "@/lib/analytics";
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  readCookieConsent,
} from "@/lib/consent/cookie-consent";
import { useCookieConsent } from "@/hooks/useCookieConsent";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const consent = useCookieConsent();

  useEffect(() => {
    const syncAnalyticsConsent = () => {
      if (readCookieConsent()?.analytics) {
        void initAnalytics();
      } else {
        void stopAnalytics();
      }
    };

    syncAnalyticsConsent();
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, syncAnalyticsConsent);
    window.addEventListener("storage", syncAnalyticsConsent);
    return () => {
      window.removeEventListener(
        COOKIE_CONSENT_CHANGE_EVENT,
        syncAnalyticsConsent
      );
      window.removeEventListener("storage", syncAnalyticsConsent);
    };
  }, []);

  useEffect(() => {
    if (!consent?.analytics) return;
    let cancelled = false;
    void initAnalytics().then(() => {
      if (!cancelled) void trackPageView(pathname);
    });
    return () => {
      cancelled = true;
    };
  }, [consent?.analytics, pathname]);

  return <>{children}</>;
}

// Hook to track page views
export function usePageTracking() {
  useEffect(() => {
    // Track initial page view
    trackPageView(window.location.pathname);

    // Track navigation changes (for SPAs)
    const handleNavigation = () => {
      trackPageView(window.location.pathname);
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener("popstate", handleNavigation);

    // Override pushState to track programmatic navigation
    const originalPushState = window.history.pushState;
    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleNavigation();
    };

    return () => {
      window.removeEventListener("popstate", handleNavigation);
      window.history.pushState = originalPushState;
    };
  }, []);
}
