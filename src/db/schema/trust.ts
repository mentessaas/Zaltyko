import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { marketplaceListings, marketplaceOrders } from "./marketplace";

/**
 * trust pack — marketplace_disputes + marketplace_ratings.
 *
 * Disputes: cualquiera de las dos partes puede abrir una. Zaltyko no media
 * automáticamente en T5 — solo el owner puede resolver como buyer o seller.
 * T5.5: Zaltyko mediation role.
 *
 * Ratings: bidireccional (buyer → seller y seller → buyer). Solo después de
 * status='paid'. 1-5 estrellas + comentario opcional.
 */

export const marketplaceDisputeStatusValues = [
  "open",
  "resolved_buyer",
  "resolved_seller",
  "cancelled",
] as const;
export type MarketplaceDisputeStatus =
  (typeof marketplaceDisputeStatusValues)[number];

export const marketplaceDisputeReasonValues = [
  "not_received",
  "damaged",
  "not_as_described",
  "wrong_item",
  "other",
] as const;
export type MarketplaceDisputeReason =
  (typeof marketplaceDisputeReasonValues)[number];

export const marketplaceDisputes = pgTable(
  "marketplace_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => marketplaceOrders.id, { onDelete: "restrict" }),
    raisedByAcademyId: uuid("raised_by_academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("open"),
    resolutionNotes: text("resolution_notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orderIdx: index("marketplace_disputes_order_idx").on(t.orderId),
    statusIdx: index("marketplace_disputes_status_idx").on(t.status),
  }),
);

export type MarketplaceDispute = typeof marketplaceDisputes.$inferSelect;
export type NewMarketplaceDispute = typeof marketplaceDisputes.$inferInsert;

export const marketplaceRatingDirectionValues = [
  "buyer_to_seller",
  "seller_to_buyer",
] as const;
export type MarketplaceRatingDirection =
  (typeof marketplaceRatingDirectionValues)[number];

export const marketplaceRatings = pgTable(
  "marketplace_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => marketplaceOrders.id, {
      onDelete: "restrict",
    }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: "restrict" }),
    raterAcademyId: uuid("rater_academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    ratedAcademyId: uuid("rated_academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    direction: text("direction").notNull(),
    stars: integer("stars").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    verified: text("verified").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    listingIdx: index("marketplace_ratings_listing_idx").on(t.listingId),
    raterIdx: index("marketplace_ratings_rater_idx").on(t.raterAcademyId),
    ratedIdx: index("marketplace_ratings_rated_idx").on(t.ratedAcademyId),
    // Una academia solo puede puntuar una vez por listing y dirección.
    listingDirectionUnique: uniqueIndex("marketplace_ratings_listing_direction_unique").on(
      t.listingId,
      t.direction,
      t.raterAcademyId,
    ),
  }),
);

export type MarketplaceRating = typeof marketplaceRatings.$inferSelect;
export type NewMarketplaceRating = typeof marketplaceRatings.$inferInsert;