"use client";

import { useSyncExternalStore } from "react";
import { readCookieConsent } from "@/lib/consent/cookie-consent";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("zaltyko:cookie-consent-change", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("zaltyko:cookie-consent-change", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getServerSnapshot() {
  return null;
}

export function useCookieConsent() {
  return useSyncExternalStore(subscribe, readCookieConsent, getServerSnapshot);
}
