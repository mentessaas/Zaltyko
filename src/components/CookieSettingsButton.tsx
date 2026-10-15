"use client";

import { COOKIE_CONSENT_OPEN_EVENT } from "@/lib/consent/cookie-consent";

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(COOKIE_CONSENT_OPEN_EVENT))}
      className="inline-flex min-h-11 items-center px-1 py-1 text-left text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      Configurar cookies
    </button>
  );
}
