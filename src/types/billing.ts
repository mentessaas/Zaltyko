export type PlanCode = "free" | "pro" | "premium";

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

