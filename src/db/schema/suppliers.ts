import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => profiles.userId, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull(),
  taxId: text("tax_id"),
  country: text("country").notNull(),
  kycStatus: text("kyc_status").notNull().default("pending"),
  kycProvider: text("kyc_provider"),
  kycVerifiedAt: timestamp("kyc_verified_at", { withTimezone: true }),
  kycNotes: text("kyc_notes"),
  isPremium: boolean("is_premium").notNull().default(false),
  premiumUntil: timestamp("premium_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  ownerIdx: uniqueIndex("suppliers_owner_uq").on(t.ownerUserId),
  kycIdx: index("suppliers_kyc_idx").on(t.kycStatus),
  countryIdx: index("suppliers_country_idx").on(t.country),
}));

export type KycStatus = "pending" | "in_review" | "verified" | "rejected" | "suspended";
export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
