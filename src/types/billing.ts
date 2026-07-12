/** Códigos persistidos en DB y sincronizados con Stripe. */
export type PlanCode = "free" | "pro" | "premium";

/** Network es comercial y acompañado; no existe como checkout autoservicio. */
export type CommercialPlanCode = PlanCode | "network";

export interface PlanSummary {
  code: string;
  nickname: string | null;
  priceEur: number;
  currency: string;
  billingInterval: string | null;
  athleteLimit: number | null;
}

export interface BillingSummary {
  planCode: PlanCode;
  status: string;
  athleteLimit: number | null;
  classLimit: number | null;
  hasStripeCustomer: boolean;
  trial: {
    eligible: boolean;
    reason: "eligible" | "active_trial" | "cooldown" | "paid_plan_active" | "academy_not_found";
    active: boolean;
    trialId: string | null;
    startsAt: string | null;
    endsAt: string | null;
    nextEligibleAt: string | null;
    grantedPlanCode: "pro" | null;
  };
}

export interface InvoiceRow {
  id: string;
  status: string;
  amountDue: number | null;
  amountPaid: number | null;
  currency: string | null;
  billingReason: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  stripeInvoiceId: string;
}
