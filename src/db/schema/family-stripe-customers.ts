import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

/**
 * family_stripe_customers — Customer de Stripe de cada familia POR academia.
 *
 * En Stripe Connect Standard, los customers viven dentro de la cuenta conectada
 * de la academia (no en la plataforma). Un mismo padre/madre en dos academias
 * tiene dos customers distintos, por eso la clave es (academy_id, profile_id).
 *
 * Zaltyko NUNCA almacena el PAN. Solo guarda referencias (customer id, payment
 * method id) y metadatos de display (brand, last4, expiracion) que Stripe provee.
 */
export const familyStripeCustomers = pgTable(
  "family_stripe_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    // Perfil del pagador (padre/madre/tutor con sesion). Identidad estable frente
    // al modelo fragmentado guardians/family_contacts.
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Customer dentro de la cuenta conectada de la academia (cus_…).
    stripeCustomerId: text("stripe_customer_id").notNull(),
    defaultPaymentMethodId: text("default_payment_method_id"),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    cardExpMonth: integer("card_exp_month"),
    cardExpYear: integer("card_exp_year"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    academyProfileUnique: uniqueIndex("family_stripe_customers_academy_profile_unique").on(
      table.academyId,
      table.profileId
    ),
    tenantIdx: index("family_stripe_customers_tenant_idx").on(table.tenantId),
    customerIdx: index("family_stripe_customers_customer_idx").on(table.stripeCustomerId),
  })
);
