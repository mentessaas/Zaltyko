import { z } from "zod";
import type { ManualPaymentRetrySnapshot, ManualPaymentRetryStorageLike } from "./manual-payment-retry-storage";
import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import { getCalendarDateInTimezone } from "@/modules/billing/domain/manual-payment-date";

export type ManualPaymentMethod = "cash" | "bank_transfer" | "card_terminal" | "other";

export type PaymentRequest = {
  organizationId: string;
  chargeId: string;
  amountCents: number;
  method: ManualPaymentMethod;
  reference?: string;
  receivedAt: string;
};

export type PendingPaymentRequest = {
  key: string;
  body: PaymentRequest;
  snapshot: ManualPaymentRetrySnapshot;
  referenceRequired: boolean;
};

export type ManualPaymentOptionsRequest = {
  id: number;
  generation: number;
  pageIdentity: object;
  scopeKey: string;
  cursor: string;
  controller: AbortController;
};

export type LoadedManualPaymentPage = {
  identity: object;
  charges: OpenManualPaymentCharge[];
  cursor: string | null;
};

export const manualPaymentOptionsResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    charges: z.array(
      z.object({
        chargeId: z.string().uuid(),
        familyId: z.string().uuid(),
        locationId: z.string().uuid(),
        locationName: z.string(),
        locationTimezone: z.string(),
        invoiceReference: z.string(),
        payerName: z.string().nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        dueAt: z.string(),
        totalCents: z.number().int().nonnegative().safe(),
        allocatedCents: z.number().int().nonnegative().safe(),
        outstandingCents: z.number().int().positive().safe(),
      })
    ),
    nextCursor: z.string().min(1).max(4096).nullable(),
  }),
});

export function isMatchingManualPaymentResponse(
  value: unknown,
  request: PaymentRequest
): boolean {
  if (!value || typeof value !== "object") return false;
  const response = value as { ok?: unknown; data?: unknown };
  if (!response.data || typeof response.data !== "object") return false;
  const data = response.data as {
    chargeId?: unknown;
    amountCents?: unknown;
    method?: unknown;
    receivedAt?: unknown;
  };

  return (
    response.ok === true &&
    data.chargeId === request.chargeId &&
    data.amountCents === request.amountCents &&
    data.method === request.method &&
    data.receivedAt === request.receivedAt
  );
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatManualPaymentMethod(method: ManualPaymentMethod): string {
  const labels: Record<ManualPaymentMethod, string> = {
    cash: "Efectivo",
    bank_transfer: "Transferencia",
    card_terminal: "Tarjeta en el local",
    other: "Otro",
  };
  return labels[method];
}

export function getRetryReceivedOn(
  request: PendingPaymentRequest,
  charge: OpenManualPaymentCharge | null
): string | null {
  if (!charge) return null;
  try {
    return getCalendarDateInTimezone(
      new Date(request.body.receivedAt),
      charge.locationTimezone
    );
  } catch {
    return null;
  }
}

export function parseAmountCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function getBrowserStorage(
  kind: "localStorage" | "sessionStorage"
): ManualPaymentRetryStorageLike | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

export function toPendingPaymentRequest(
  snapshot: ManualPaymentRetrySnapshot
): PendingPaymentRequest {
  return {
    key: snapshot.idempotencyKey,
    body: {
      organizationId: snapshot.organizationId,
      chargeId: snapshot.chargeId,
      amountCents: snapshot.amountCents,
      method: snapshot.method,
      receivedAt: snapshot.receivedAt,
    },
    snapshot,
    referenceRequired: snapshot.referenceSha256 !== null,
  };
}
