import { and, eq, sql, desc, or } from "drizzle-orm";

import { db } from "@/db";
import { marketplaceListings, listingCategories } from "@/db/schema";
import type { MarketplaceListing } from "@/db/schema";

/**
 * Búsqueda de listings activos del marketplace.
 *
 * T8: pg_trgm similarity()
 * T12: soporte para subcategorías (parent_id) — buscar por categoría hija
 *      incluye automáticamente los listings de la categoría padre.
 */
export async function searchListings(opts: {
  query?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  condition?: string;
  categoryId?: string;
  limit?: number;
}): Promise<MarketplaceListing[]> {
  const conds = [
    eq(marketplaceListings.status, "active"),
    sql`${marketplaceListings.publishedAt} IS NOT NULL`,
    sql`(${marketplaceListings.expiresAt} IS NULL OR ${marketplaceListings.expiresAt} > now())`,
    sql`${marketplaceListings.quantityAvailable} > ${marketplaceListings.quantitySold}`,
  ];

  if (opts.query && opts.query.trim()) {
    const q = opts.query.trim();
    conds.push(
      sql`(
        similarity(${marketplaceListings.title}, ${q}) > 0.2
        OR similarity(COALESCE(${marketplaceListings.description}, ''), ${q}) > 0.2
        OR LOWER(${marketplaceListings.title}) LIKE ${"%" + q.toLowerCase() + "%"}
      )`
    );
  }
  if (typeof opts.minPriceCents === "number") {
    conds.push(sql`${marketplaceListings.priceCents} >= ${opts.minPriceCents}`);
  }
  if (typeof opts.maxPriceCents === "number") {
    conds.push(sql`${marketplaceListings.priceCents} <= ${opts.maxPriceCents}`);
  }
  if (opts.condition && opts.condition !== "all") {
    conds.push(eq(marketplaceListings.condition, opts.condition));
  }
  if (opts.categoryId) {
    // T12: incluye listings de la categoría seleccionada O sus hijas
    conds.push(
      sql`${marketplaceListings.categoryId} IN (
        SELECT id FROM "listing_categories"
        WHERE id = ${opts.categoryId} OR parent_id = ${opts.categoryId}
      )`
    );
  }

  const orderBy = opts.query?.trim()
    ? desc(sql`similarity(${marketplaceListings.title}, ${opts.query.trim()})`)
    : desc(marketplaceListings.publishedAt);

  return db
    .select()
    .from(marketplaceListings)
    .where(and(...conds))
    .orderBy(orderBy)
    .limit(opts.limit ?? 50);
}

/**
 * Lista categorías raíz (sin parent) para el filtro top-level.
 */
export async function listRootCategories() {
  return db
    .select()
    .from(listingCategories)
    .where(sql`${listingCategories.parentId} IS NULL`)
    .orderBy(listingCategories.sortOrder);
}
