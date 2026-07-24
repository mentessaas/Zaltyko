import { date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { billingItems } from "./billing-items";
import { classes } from "./classes";
import { groups } from "./groups";
import { chargeStatusEnum, paymentMethodEnum } from "./enums";

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    billingItemId: uuid("billing_item_id").references(() => billingItems.id, { onDelete: "set null" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    // Grupo al que corresponde la cuota. Con multi-grupo, un atleta puede tener
    // un cargo por cada grupo al que pertenece en el mismo periodo.
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    period: text("period").notNull(), // Format: "YYYY-MM"
    dueDate: date("due_date"),
    status: chargeStatusEnum("status").notNull().default("pending"),
    paymentMethod: paymentMethodEnum("payment_method"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    // Cobro automatico con tarjeta (Stripe Connect). El ledger sigue siendo la
    // fuente de verdad; estos campos referencian el pago en la cuenta conectada.
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    stripeAccountId: text("stripe_account_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("charges_tenant_idx").on(table.tenantId),
    academyPeriodIdx: index("charges_academy_period_idx").on(table.academyId, table.period),
    academyAthletePeriodIdx: index("charges_academy_athlete_period_idx").on(
      table.academyId,
      table.athleteId,
      table.period
    ),
    academyStatusIdx: index("charges_academy_status_idx").on(table.academyId, table.status),
    classIdIdx: index("charges_class_id_idx").on(table.classId),
    groupIdIdx: index("charges_group_id_idx").on(table.groupId),
    academyAthletePeriodGroupIdx: index("charges_academy_athlete_period_group_idx").on(
      table.academyId,
      table.athleteId,
      table.period,
      table.groupId
    ),
    paymentIntentIdx: index("charges_payment_intent_idx").on(table.stripePaymentIntentId),
  })
);

