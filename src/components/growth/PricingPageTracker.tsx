"use client";

import { useEffect } from "react";

import { capturePublicGrowthEvent, getPublicAttribution } from "@/lib/growth/client";

export function PricingPageTracker() {
  useEffect(() => {
    capturePublicGrowthEvent({
      eventName: "pricing_viewed",
      planCode: null,
      source: "public_pricing",
      properties: getPublicAttribution(),
    });
  }, []);

  return null;
}
