"use client";

import { useEffect } from "react";

import {
  UTM_STORAGE_KEY,
  captureFirstTouchUtm,
  pickUtmFromQuery,
} from "@/lib/growth/utm";
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  readCookieConsent,
} from "@/lib/consent/cookie-consent";

/**
 * Captura UTMs (first-touch) en cada page view. El componente no renderiza
 * nada: su único efecto es persistir el primer set de UTMs observado en
 * `sessionStorage` para que `/onboarding/owner` lo lea en el signup.
 *
 * La regla first-touch vive en `captureFirstTouchUtm`: si ya hay UTMs
 * almacenados, los nuevos se ignoran salvo que la key esté vacía.
 */
export function UtmCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncAttributionStorage = () => {
      if (!readCookieConsent()?.analytics) {
        try {
          window.sessionStorage.removeItem(UTM_STORAGE_KEY);
        } catch {
          // Keep the signup flow usable when browser storage is unavailable.
        }
        return;
      }
      const params = pickUtmFromQuery(new URLSearchParams(window.location.search));
      captureFirstTouchUtm(params, window.sessionStorage, UTM_STORAGE_KEY);
    };

    syncAttributionStorage();
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, syncAttributionStorage);
    window.addEventListener("storage", syncAttributionStorage);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, syncAttributionStorage);
      window.removeEventListener("storage", syncAttributionStorage);
    };
  }, []);

  return null;
}
