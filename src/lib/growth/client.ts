"use client";

import type { z } from "zod";

import { subscribeConsent } from "@/lib/consent/state";
import type { PublicGrowthEventSchema } from "@/lib/growth/contracts";

type PublicGrowthEvent = z.input<typeof PublicGrowthEventSchema>;
type GrowthEventInput = Omit<PublicGrowthEvent, "eventId" | "visitorId">;

const VISITOR_STORAGE_KEY = "zaltyko_growth_visitor_id";

function clearOwnedGrowthVisitorId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(VISITOR_STORAGE_KEY);
  } catch {
    // Storage may be blocked. Never touch other application data.
  }
}

// Public browser attribution remains hard-off until the server has a verified
// consent contract. Clear only the visitor key this client owns; do not inspect
// or remove unrelated localStorage data.
if (typeof window !== "undefined") {
  clearOwnedGrowthVisitorId();
  subscribeConsent((snapshot) => {
    if (snapshot.value !== "granted") clearOwnedGrowthVisitorId();
  });
}

/** No persistent or in-memory visitor identifier is issued by this client. */
export function getGrowthVisitorId(): undefined {
  return undefined;
}

/** Public attribution reads stay closed while the receiver has no opt-in gate. */
export function getPublicAttribution(): Record<string, never> {
  return {};
}

/** Public browser growth events are intentionally disabled until server opt-in. */
export function capturePublicGrowthEvent(input: GrowthEventInput): void {
  void input;
}
