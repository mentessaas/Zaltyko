"use client";

import { useEffect } from "react";
import { initAnalytics, trackPageView } from "@/lib/analytics";
import { subscribeConsent } from "@/lib/consent/state";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // ZAL-247 — antes este provider solo llamaba `initAnalytics()` y el hook
  // `usePageTracking` quedaba exportado sin ningún consumidor en el árbol.
  // Con `capture_pageview: false` en la config de posthog, eso significaba
  // cero `$pageview` en toda la app. El provider ya envuelve el árbol
  // completo (`src/app/layout.tsx`), así que es el punto natural de montaje.
  usePageTracking();

  return <>{children}</>;
}

// Hook to track page views
export function usePageTracking() {
  useEffect(() => {
    // ZAL-247 — el pageview inicial tenía DOS fuentes: la llamada directa al
    // montar y el snapshot síncrono que `subscribeConsent` entrega al
    // suscribirse. Un usuario con consent previo generaba dos `$pageview`
    // para la misma ruta en cada mount. Ahora la suscripción es la única
    // fuente del evento inicial y `lastTrackedPath` deduplica las
    // transiciones de consent (grant -> revoke -> grant sobre la misma ruta
    // no vuelve a contar una visita).
    let lastTrackedPath: string | null = null;
    let consentGranted = false;

    // Navegación explícita: siempre emite (una ruta repetida A -> B -> A sí
    // es una visita nueva), y refresca el marcador de deduplicación.
    const handleNavigation = () => {
      if (!consentGranted) return;
      const path = window.location.pathname;
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

    // `subscribeConsent` entrega el snapshot vigente de forma síncrona, así
    // que este callback cubre tanto "ya tenía consent al montar" como
    // "aceptó el banner a mitad de sesión" sin necesidad de reload.
    const unsubscribeConsent = subscribeConsent((snapshot) => {
      if (snapshot.value !== "granted") {
        // Revoked / unset: no cargamos ni emitimos nada. No reseteamos
        // `lastTrackedPath` a propósito — si el usuario vuelve a otorgar
        // consent sin moverse de página, no queremos contar la visita dos
        // veces.
        consentGranted = false;
        return;
      }

      consentGranted = true;
      // Con consent recién confirmado, recién ahora se descarga e
      // inicializa posthog-js (ver `initAnalytics`).
      void initAnalytics();

      const path = window.location.pathname;
      if (lastTrackedPath === path) return;
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
