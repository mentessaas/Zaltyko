import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { charges } from "./charges";

/**
 * payment_attempts — Trazabilidad de cada intento de cobro con tarjeta (Stripe).
 *
 * Cada intento off-session sobre un cargo (`charges`) deja una fila aqui, con el
 * PaymentIntent y su resultado. Sirve para auditoria, reintentos y dunning. El
 * ledger `charges` sigue siendo la fuente de verdad del estado final.
 */
export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id, { onDelete: "cascade" }),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeAccountId: text("stripe_account_id"),
    // succeeded | failed | requires_action | processing | canceled
    status: text("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("eur"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chargeIdx: index("payment_attempts_charge_idx").on(table.chargeId),
    tenantIdx: index("payment_attempts_tenant_idx").on(table.tenantId),
    paymentIntentIdx: index("payment_attempts_payment_intent_idx").on(table.stripePaymentIntentId),
  })
);
