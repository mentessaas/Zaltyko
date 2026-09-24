import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { products } from "./store";

/**
 * marketplace_listings — listings académicos B2B (grips, material de segunda
 * mano, slots de camp cancelados, packs de sesiones sobrantes).
 *
 * Una academia puede vender su inventario sobrante a otras academias del
 * marketplace Zaltyko.
 *
 * Comisión Zaltyko (definida por plan de la academia vendedora):
 *   Free/Starter → 10%
 *   Growth       → 5%
 *   Network      → 0%
 *
 * T3 MVP: listings + orders simples. Sprint T3.5 añadirá disputes y ratings.
 */

export const listingStatusValues = ["draft", "active", "sold", "withdrawn", "expired"] as const;
export type ListingStatus = (typeof listingStatusValues)[number];

export const listingConditionValues = ["new", "used", "refurbished"] as const;
export type ListingCondition = (typeof listingConditionValues)[number];

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    sellerAcademyId: uuid("seller_academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    /** Si el listing referencia un product existente (T2), mantiene trazabilidad. */
    sourceProductId: uuid("source_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    condition: text("condition").notNull().default("used"),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    quantityAvailable: integer("quantity_available").notNull().default(1),
    quantitySold: integer("quantity_sold").notNull().default(0),
    imagesUrls: text("images_urls").array().default([]),
    /** Zaltyko cobra esta comisión sobre cada venta. 0 = exento (Network). */
    zaltykoCommissionCents: integer("zaltyko_commission_cents").notNull().default(0),
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    categoryId: uuid("category_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    
    
    
  },
  (t) => ({
    sellerIdx: index("marketplace_listings_seller_idx").on(t.sellerAcademyId),
    statusIdx: index("marketplace_listings_status_idx").on(t.status, t.publishedAt),
    categoryIdx: index("marketplace_listings_published_idx").on(t.publishedAt),
  })
);

export const marketplaceOrderStatusValues = [
  "pending_payment",
  "paid",
  "shipped",
  "delivered",
  "disputed",
  "cancelled",
  "refunded",
] as const;
export type MarketplaceOrderStatus = (typeof marketplaceOrderStatusValues)[number];

export const marketplaceOrders = pgTable(
  "marketplace_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: "restrict" }),
    sellerAcademyId: uuid("seller_academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    buyerAcademyId: uuid("buyer_academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    totalCents: integer("total_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    netToSellerCents: integer("net_to_seller_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    status: text("status").notNull().default("pending_payment"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    trackingNumber: text("tracking_number"),
    notes: text("notes"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    
    
  },
  (t) => ({
    listingIdx: index("marketplace_orders_listing_idx").on(t.listingId),
    sellerIdx: index("marketplace_orders_seller_idx").on(t.sellerAcademyId),
    buyerIdx: index("marketplace_orders_buyer_idx").on(t.buyerAcademyId),
    statusIdx: index("marketplace_orders_status_idx").on(t.status, t.createdAt),
  })
);

export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type NewMarketplaceListing = typeof marketplaceListings.$inferInsert;
export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;
export type NewMarketplaceOrder = typeof marketplaceOrders.$inferInsert;
