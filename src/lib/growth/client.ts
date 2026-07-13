"use client";

import type { z } from "zod";

import type { PublicGrowthEventSchema } from "@/lib/growth/contracts";

type PublicGrowthEvent = z.input<typeof PublicGrowthEventSchema>;
type GrowthEventInput = Omit<PublicGrowthEvent, "eventId" | "visitorId">;

const VISITOR_STORAGE_KEY = "zaltyko_growth_visitor_id";
let inMemoryVisitorId: string | null = null;

export function getGrowthVisitorId(): string {
  if (inMemoryVisitorId) return inMemoryVisitorId;

  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) {
      inMemoryVisitorId = existing;
      return existing;
    }
  } catch {
    // Algunos navegadores bloquean storage en modo privado o contextos embebidos.
  }

  const visitorId = crypto.randomUUID();
  inMemoryVisitorId = visitorId;
  try {
    window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
  } catch {
    // La atribucion dura la sesion de pagina; la accion principal sigue operativa.
  }
  return visitorId;
}

export function getPublicAttribution() {
  const searchParams = new URLSearchParams(window.location.search);
  let referrerHost: string | null = null;
  try {
    referrerHost = document.referrer ? new URL(document.referrer).hostname : null;
  } catch {
    referrerHost = null;
  }

  return {
    path: window.location.pathname,
    utm_source: searchParams.get("utm_source"),
    utm_medium: searchParams.get("utm_medium"),
    utm_campaign: searchParams.get("utm_campaign"),
    referrer_host: referrerHost,
  };
}

export function capturePublicGrowthEvent(input: GrowthEventInput): void {
  if (process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === "true") return;

  const payload: PublicGrowthEvent = {
    ...input,
    eventId: crypto.randomUUID(),
    visitorId: getGrowthVisitorId(),
  };
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const queued = navigator.sendBeacon(
      "/api/growth/events",
      new Blob([body], { type: "application/json" })
    );
    if (queued) return;
  }

  void fetch("/api/growth/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
