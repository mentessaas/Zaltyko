"use client";

import { useEffect } from "react";
import { initAnalytics, trackPageView } from "@/lib/analytics";
import { subscribeConsent } from "@/lib/consent/state";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return <>{children}</>;
}

// Hook to track page views
export function usePageTracking() {
  useEffect(() => {
    // ZAL-160 [GTM-DEP.4] — el handler de navegación consulta el consent
    // vigente en cada evento (no cacheamos). Si el usuario grant/revoke
    // a mitad de sesión, el siguiente pushState/popstate respeta el
    // nuevo estado sin necesidad de reload.
    const handleNavigation = () => {
      trackPageView(window.location.pathname);
    };

    // Track initial page view (el gate se aplica dentro de trackPageView)
    handleNavigation();

    // Listen for popstate (back/forward navigation)
    window.addEventListener("popstate", handleNavigation);

    // Override pushState to track programmatic navigation
    const originalPushState = window.history.pushState;
    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleNavigation();
    };

    // Si el consent se otorga DESPUÉS del mount (caso típico: el usuario
    // estaba navegando y aceptó el banner de cookies mientras tanto), hay
    // que re-trackear la página actual — sin esto, el primer page_view
    // consentido nunca se emitiría hasta la próxima navegación.
    const unsubscribeConsent = subscribeConsent((snapshot) => {
      if (snapshot.value === "granted") {
        trackPageView(window.location.pathname);
      }
      // Si se revoca, no emitimos nada nuevo; los eventos futuros
      // serán descartados por el gate dentro de trackPageView.
    });

    return () => {
      window.removeEventListener("popstate", handleNavigation);
      window.history.pushState = originalPushState;
      unsubscribeConsent();
    };
  }, []);
}
