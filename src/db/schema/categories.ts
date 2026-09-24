import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * listing_categories — taxonomía simple para clasificar listings del marketplace.
 * T7. Categorización jerárquica: parent_id NULL para top-level, parent_id set para subcategorías.
 *
 * MVP: solo top-level (8 categorías predefinidas).
 */
export const listingCategories = pgTable(
  "listing_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id"),
    slug: text("slug").notNull(),
    nameEs: text("name_es").notNull(),
    nameEn: text("name_en").notNull(),
    icon: text("icon"), // emoji o identificador de icono
    sortOrder: text("sort_order").notNull().default("0"),
  },
  (t) => ({
    parentIdx: index("listing_categories_parent_idx").on(t.parentId),
    slugIdx: index("listing_categories_slug_idx").on(t.slug),
  })
);

export type ListingCategory = typeof listingCategories.$inferSelect;
export type NewListingCategory = typeof listingCategories.$inferInsert;
