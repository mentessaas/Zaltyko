"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  subscribeConsent,
  type ConsentSnapshot,
} from "@/lib/consent/state";
import { getSafePublicTrackingPath } from "@/lib/optional-tracking-policy";
import {
  clearFirstTouchUtm,
  getBrowserAttributionStorage,
  isUtmAttributionEnabled,
  syncConsentedFirstTouchUtm,
} from "@/lib/growth/consented-attribution";

/**
 * Captures first-touch UTMs only on an allowlisted public route, with the
 * attribution flag enabled and current analytics consent granted. Revocation
 * removes only the attribution key; unrelated onboarding drafts are untouched.
 */
export function UtmCapture() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sync = (consent: ConsentSnapshot) => {
      const storage = getBrowserAttributionStorage();
      const enabled = isUtmAttributionEnabled();
      if (!enabled || consent.value !== "granted") {
        clearFirstTouchUtm(storage);
        return;
      }

      const actualPath = window.location.pathname;
      if (
        getSafePublicTrackingPath(pathname) !==
        getSafePublicTrackingPath(actualPath)
      ) {
        return;
      }

      syncConsentedFirstTouchUtm({
        enabled,
        consent: consent.value,
        pathname: actualPath,
        search: window.location.search,
        storage,
      });
    };

    return subscribeConsent(sync);
  }, [pathname]);

  return null;
}
