"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useCookieConsent } from "@/hooks/useCookieConsent";

export function ConsentAwareVercelTelemetry() {
  const consent = useCookieConsent();
  if (!consent?.analytics) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
