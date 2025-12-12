import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const billingInvoices = pgTable(
  "billing_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
    status: text("status").notNull(),
    amountDue: integer("amount_due"),
    amountPaid: integer("amount_paid"),
    currency: text("currency").notNull().default("eur"),
    billingReason: text("billing_reason"),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    invoicePdf: text("invoice_pdf"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    academyCreatedIdx: index("billing_invoices_academy_created_idx").on(
      table.academyId,
      table.createdAt
    ),
    tenantCreatedIdx: index("billing_invoices_tenant_created_idx").on(table.tenantId, table.createdAt),
  })
);


