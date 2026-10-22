import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  marketplaceCategoryEnum,
  marketplaceListingStatusEnum,
  marketplaceListingTypeEnum,
  marketplacePriceTypeEnum,
} from "./enums";
import { profiles } from "./profiles";

/**
 * The existing public classifieds table. Keep this mapping separate from the
 * academy-to-academy marketplace model while both products are in development.
 * Production still has active rows in this legacy shape.
 */
export const legacyMarketplaceListings = pgTable("marketplace_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  sellerType: text("seller_type").notNull(),
  type: marketplaceListingTypeEnum("type").notNull(),
  category: marketplaceCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priceCents: integer("price_cents"),
  currency: text("currency").default("eur"),
  priceType: marketplacePriceTypeEnum("price_type").default("contact"),
  contact: jsonb("contact").$type<{ whatsapp?: string; email?: string; phone?: string }>(),
  images: text("images").array(),
  location: jsonb("location").$type<{ country: string; province?: string; city: string }>(),
  status: marketplaceListingStatusEnum("status").default("active"),
  views: integer("views").default(0),
  isFeatured: boolean("is_featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  userIdx: index("marketplace_user_idx").on(table.userId),
  categoryIdx: index("marketplace_category_idx").on(table.category),
  typeIdx: index("marketplace_type_idx").on(table.type),
  statusIdx: index("marketplace_status_idx").on(table.status),
  createdAtIdx: index("marketplace_created_at_idx").on(table.createdAt),
}));

export const legacyMarketplaceRatings = pgTable("marketplace_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").references(() => legacyMarketplaceListings.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").references(() => profiles.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => profiles.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sellerIdx: index("rating_seller_idx").on(table.sellerId),
  listingIdx: index("rating_listing_idx").on(table.listingId),
}));
