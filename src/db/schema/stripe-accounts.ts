import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

/**
 * stripe_accounts — Cuentas Stripe Connect (Standard) de cada academia.
 *
 * Modelo de cobros v2 (Cobros y cuotas): cada academia conecta SU PROPIA cuenta
 * de Stripe vía Connect Standard. La academia es merchant of record; el dinero
 * viaja directamente a su cuenta. Zaltyko nunca custodia fondos ni almacena
 * claves secretas: solo guarda el `stripe_account_id` (acct_…) y el estado de
 * habilitación que reporta Stripe vía webhook `account.updated`.
 *
 * NO confundir con:
 *  - `subscriptions` (suscripción SaaS de la academia a Zaltyko), ni
 *  - las columnas legacy `academies.stripe_secret_key/...` (BYO-keys, obsoletas).
 */
export const stripeAccounts = pgTable(
  "stripe_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    // ID de la cuenta conectada en Stripe (acct_…). Nunca una clave secreta.
    stripeAccountId: text("stripe_account_id").notNull(),
    // País de la cuenta (ISO-2). Determina disponibilidad de Connect/payouts.
    country: text("country"),
    defaultCurrency: text("default_currency").notNull().default("eur"),
    // Estado reportado por Stripe (account.updated / accounts.retrieve).
    chargesEnabled: boolean("charges_enabled").notNull().default(false),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    detailsSubmitted: boolean("details_submitted").notNull().default(false),
    // "pending" | "onboarding" | "enabled" | "restricted" | "disabled"
    onboardingStatus: text("onboarding_status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    academyUnique: uniqueIndex("stripe_accounts_academy_unique").on(table.academyId),
    tenantIdx: index("stripe_accounts_tenant_idx").on(table.tenantId),
    accountIdIdx: index("stripe_accounts_account_id_idx").on(table.stripeAccountId),
  })
);
