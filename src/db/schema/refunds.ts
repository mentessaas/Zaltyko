import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { charges } from "./charges";
import { profiles } from "./profiles";

/**
 * refunds — Reembolsos de cargos cobrados con tarjeta (Stripe, cuenta conectada).
 *
 * El reembolso lo ejecuta Stripe sobre la cuenta de la academia (merchant of
 * record). Aqui se registra la referencia y el importe para trazabilidad. El
 * estado final del cargo (`refunded`) lo reconcilia el webhook charge.refunded.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id, { onDelete: "cascade" }),
    stripeRefundId: text("stripe_refund_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("eur"),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chargeIdx: index("refunds_charge_idx").on(table.chargeId),
    tenantIdx: index("refunds_tenant_idx").on(table.tenantId),
    refundIdIdx: index("refunds_refund_id_idx").on(table.stripeRefundId),
  })
);
