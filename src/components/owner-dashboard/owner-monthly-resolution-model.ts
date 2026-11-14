/** Types and pure helpers of OwnerMonthlyInvoiceResolutionPanel. */

import { ownerField, ownerUi } from "./owner-ui";

export type ResolutionAction =
  | { kind: "tariff"; enrollmentId: string; athleteName: string | null }
  | {
      kind: "family";
      enrollmentId: string;
      athleteId: string;
      athleteName: string | null;
    }
  | { kind: "payer"; familyId: string; athleteIds: string[] };

export type PricePlanOption = {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  cadence: string;
};

export type ClassTemplateOption = {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type PricePlanDraft = {
  scopeKey: string;
  name: string;
  amount: string;
  classTemplateIds: string[];
  coverageStartsOn: string;
  coverageHasNoEnd: boolean;
  coverageEndsOn: string;
};

export function emptyPricePlanDraft(
  scopeKey: string,
  servicePeriodStart: string
): PricePlanDraft {
  return {
    scopeKey,
    name: "",
    amount: "",
    classTemplateIds: [],
    coverageStartsOn: `${servicePeriodStart.slice(0, 7)}-01`,
    coverageHasNoEnd: true,
    coverageEndsOn: "",
  };
}

export type PricePlanOptionsResponse = {
  organizationId: string;
  locationId: string;
  items: PricePlanOption[];
  classTemplates: ClassTemplateOption[];
  classTemplatesHasMore: boolean;
};

export type FamilyAssociationOption = {
  familyId: string;
  athletes: Array<{ athleteId: string; athleteName: string | null }>;
  payers: Array<{
    familyPayerId: string;
    displayName: string | null;
    isPrimary: boolean;
  }>;
};

export function resolutionScopeKey(input: {
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  actionKey: string;
}) {
  return JSON.stringify([
    input.organizationId,
    input.locationId,
    input.servicePeriod,
    input.actionKey,
  ]);
}

export function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export function responseMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const detail = "detail" in payload ? payload.detail : undefined;
    const message = "message" in payload ? payload.message : undefined;
    if (typeof detail === "string") return detail;
    if (typeof message === "string") return message;
  }
  return fallback;
}

export function problemCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  if ("code" in payload && typeof payload.code === "string") return payload.code;
  if ("type" in payload && typeof payload.type === "string") {
    return payload.type.split("/").at(-1)?.replaceAll("-", "_").toUpperCase();
  }
  return undefined;
}

export function displayName(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
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

export function parseMonthlyAmountCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 2_147_483_647
    ? cents
    : null;
}

export function isDateValue(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function isClassTemplateOption(value: unknown): value is ClassTemplateOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Partial<ClassTemplateOption>;
  return (
    isUuid(option.id) &&
    typeof option.name === "string" &&
    option.name.trim().length > 0 &&
    isDateValue(option.effectiveFrom) &&
    (option.effectiveTo === null || isDateValue(option.effectiveTo)) &&
    (option.effectiveTo === null || option.effectiveTo >= option.effectiveFrom)
  );
}

// Campos y botones del panel con la forma del sistema (`components/ui` y
// `ownerUi`): sin botones cuadrados en noche ni campos sin radio.
export const fieldClassName = ownerField;
export const primaryButtonClassName = ownerUi.primaryButton;
export const secondaryButtonClassName = ownerUi.secondaryButton;

/** Relationship of a new adult payer with the athlete. */
export type PayerRelationship =
  | "parent"
  | "legal_guardian"
  | "foster_guardian"
  | "other";
