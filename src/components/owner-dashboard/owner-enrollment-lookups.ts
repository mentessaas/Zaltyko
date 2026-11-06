import type { Candidate, PricePlanOption } from "./owner-enrollment-types";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function data(payload: unknown): Record<string, unknown> | null {
  return record(payload) && payload.ok === true && record(payload.data) ? payload.data : null;
}

/** Decode read-only lookup responses; never determines permissions or writes. */
export function enrollmentCandidates(payload: unknown): Candidate[] | null {
  const value = data(payload);
  if (!value || !Array.isArray(value.items)) return null;
  if (!value.items.every(item => record(item) && text(item.id) && text(item.name))) return null;
  return value.items.map(item => ({ id: item.id, name: item.name }));
}

export function enrollmentPricePlans(payload: unknown, scope: { organizationId: string; locationId: string }): PricePlanOption[] | null {
  const value = data(payload);
  if (!value || value.organizationId !== scope.organizationId || value.locationId !== scope.locationId || !Array.isArray(value.items)) return null;
  if (!value.items.every(item => record(item) && text(item.id) && text(item.name) &&
    typeof item.amountCents === "number" && Number.isSafeInteger(item.amountCents) && item.amountCents >= 0 &&
    text(item.currency) && item.cadence === "monthly")) return null;
  return value.items.map(item => ({ id: item.id, name: item.name, amountCents: item.amountCents, currency: item.currency, cadence: item.cadence }));
}

export function enrollmentLookupError(payload: unknown, fallback: string): string {
  if (!record(payload)) return fallback;
  if (text(payload.detail)) return payload.detail;
  if (text(payload.message)) return payload.message;
  return fallback;
}
