import { z } from "zod";

import { operationalActorSchema } from "@/modules/shared/application/actor";
import {
  OperationalError,
  type OperationalErrorCode,
} from "@/modules/shared/domain/operational-error";

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export const keySchema = z.string().trim().min(8).max(180);
/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export const financialRoles = ["owner", "admin"] as const;

export type MonthlyInvoiceOptionsInput = {
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  actor: z.infer<typeof operationalActorSchema>;
};

export type IssueMonthlyInvoiceInput = MonthlyInvoiceOptionsInput & {
  familyId: string;
  familyPayerId: string;
  dueDate: string;
  quoteHash: string;
  idempotencyKey: string;
};

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export type PeriodBounds = { start: string; end: string };

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function periodBounds(servicePeriod: string): PeriodBounds {
  const parsed = periodSchema.safeParse(servicePeriod);
  if (!parsed.success) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "El periodo debe tener formato YYYY-MM.",
      422
    );
  }
  const [year, month] = servicePeriod.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start: `${servicePeriod}-01`, end };
}

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function conflict(
  code: OperationalErrorCode,
  detail: string,
  extra?: Record<string, unknown>
) {
  return new OperationalError(code, detail, 409, extra);
}
