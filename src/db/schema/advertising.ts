import { boolean, index, integer, pgTable, text, timestamp, uuid, date } from "drizzle-orm/pg-core";
import { adTypeEnum, adPositionEnum } from "./enums";
import { profiles } from "./profiles";

export const advertisements = pgTable("advertisements", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: adTypeEnum("type").notNull(),
  position: adPositionEnum("position").notNull(),
  title: text("title").notNull(),
  imageUrl: text("image_url"),
  linkUrl: text("link_url").notNull(),
  altText: text("alt_text"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  views: integer("views").default(0),
  clicks: integer("clicks").default(0),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  positionIdx: index("ad_position_idx").on(table.position),
  activeIdx: index("ad_active_idx").on(table.isActive),
  datesIdx: index("ad_dates_idx").on(table.startDate, table.endDate),
}));

export const featuredListings = pgTable("featured_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketplaceListingId: uuid("marketplace_listing_id"),
  empleoListingId: uuid("empleo_listing_id"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
