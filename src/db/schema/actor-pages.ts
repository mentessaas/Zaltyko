import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { academies } from "./academies";

export const actorPages = pgTable("actor_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  publicSlug: text("public_slug").notNull(),
  publicVisible: boolean("public_visible").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  displayName: text("display_name").notNull(),
  tagline: text("tagline"),
  bioBlocks: jsonb("bio_blocks").notNull().default([]),
  photoUrl: text("photo_url"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  socialLinks: jsonb("social_links").default({}),
  theme: jsonb("theme").notNull().default({}),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  seoImageUrl: text("seo_image_url"),
  language: text("language").notNull().default("es"),
  autoTranslate: boolean("auto_translate").notNull().default(false),
  consentStatus: text("consent_status").notNull().default("not_required"),
  blockedReason: text("blocked_reason"),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  entityIdx: uniqueIndex("actor_pages_entity_uq").on(t.entityType, t.entityId),
  slugIdx: uniqueIndex("actor_pages_slug_uq").on(t.publicSlug),
  typeIdx: index("actor_pages_type_idx").on(t.entityType, t.publicVisible),
  tenantIdx: index("actor_pages_tenant_idx").on(t.tenantId),
}));

export const actorConsents = pgTable("actor_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorPageId: uuid("actor_page_id").notNull().references(() => actorPages.id, { onDelete: "cascade" }),
  guardianUserId: uuid("guardian_user_id").notNull(),
  guardianRelationship: text("guardian_relationship").notNull(),
  consentScope: text("consent_scope").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: text("revoked_reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (t) => ({
  pageIdx: index("actor_consents_page_idx").on(t.actorPageId),
  guardianIdx: index("actor_consents_guardian_idx").on(t.guardianUserId),
}));

export type ActorEntityType = "academy" | "coach" | "athlete" | "supplier";
export type ActorConsentStatus = "not_required" | "pending" | "granted" | "revoked";
export type ActorPage = typeof actorPages.$inferSelect;
export type NewActorPage = typeof actorPages.$inferInsert;
