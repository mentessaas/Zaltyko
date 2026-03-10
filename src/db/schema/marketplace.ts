import { boolean, index, integer, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { marketplaceListingTypeEnum, marketplaceCategoryEnum, marketplacePriceTypeEnum, marketplaceListingStatusEnum } from "./enums";
import { profiles } from "./profiles";

export const marketplaceListings = pgTable("marketplace_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  sellerType: text("seller_type").notNull(), // academy, coach, athlete, external
  type: marketplaceListingTypeEnum("type").notNull(),
  category: marketplaceCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priceCents: integer("price_cents"),
  currency: text("currency").default("eur"),
  priceType: marketplacePriceTypeEnum("price_type").default("contact"),
  contact: jsonb("contact").$type<{
    whatsapp?: string;
    email?: string;
    phone?: string;
  }>(),
  images: text("images").array(),
  location: jsonb("location").$type<{
    country: string;
    province?: string;
    city: string;
  }>(),
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

export const marketplaceRatings = pgTable("marketplace_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").references(() => marketplaceListings.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").references(() => profiles.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => profiles.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sellerIdx: index("rating_seller_idx").on(table.sellerId),
  listingIdx: index("rating_listing_idx").on(table.listingId),
}));
