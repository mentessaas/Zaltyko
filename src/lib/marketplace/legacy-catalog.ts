import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  marketplaceCategoryEnum,
  marketplaceListingTypeEnum,
} from "@/db/schema/enums";
import { legacyMarketplaceListings } from "@/db/schema/marketplace-legacy";
import { escapeLikeSearch } from "@/lib/helpers";
import {
  canUsePublicDemoData,
  demoMarketplaceListing,
} from "@/lib/public/demo-listings";

export type LegacyMarketplaceListing =
  typeof legacyMarketplaceListings.$inferSelect;

export type LegacyMarketplacePage = {
  items: LegacyMarketplaceListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type PublicListingSource =
  LegacyMarketplaceListing | typeof demoMarketplaceListing;

function toLegacyMarketplaceListing(
  listing: PublicListingSource
): LegacyMarketplaceListing {
  const raw = listing as unknown as Partial<LegacyMarketplaceListing>;
  return {
    id: listing.id,
    userId: raw.userId ?? null,
    sellerType: listing.sellerType,
    type: listing.type as LegacyMarketplaceListing["type"],
    category: listing.category as LegacyMarketplaceListing["category"],
    title: listing.title,
    description: listing.description ?? null,
    priceCents: listing.priceCents ?? null,
    currency: listing.currency ?? null,
    priceType: listing.priceType as LegacyMarketplaceListing["priceType"],
    contact: listing.contact ?? null,
    images: listing.images ?? null,
    location: listing.location ?? null,
    status: listing.status as LegacyMarketplaceListing["status"],
    views: listing.views ?? 0,
    isFeatured: listing.isFeatured ?? false,
    createdAt:
      listing.createdAt instanceof Date
        ? listing.createdAt
        : listing.createdAt
          ? new Date(listing.createdAt)
          : null,
    updatedAt: raw.updatedAt ?? null,
  };
}

function positiveInteger(
  value: string | null,
  fallback: number,
  maximum: number
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

/** Query the current legacy classifieds schema directly from server components and API routes. */
export async function listPublicLegacyMarketplace(
  searchParams: URLSearchParams
): Promise<LegacyMarketplacePage> {
  const page = positiveInteger(searchParams.get("page"), 1, 10000);
  const pageSize = positiveInteger(searchParams.get("limit"), 20, 100);
  const categories = searchParams
    .getAll("category")
    .filter(
      (value): value is (typeof marketplaceCategoryEnum.enumValues)[number] =>
        marketplaceCategoryEnum.enumValues.includes(
          value as (typeof marketplaceCategoryEnum.enumValues)[number]
        )
    );
  const types = searchParams
    .getAll("type")
    .filter(
      (
        value
      ): value is (typeof marketplaceListingTypeEnum.enumValues)[number] =>
        marketplaceListingTypeEnum.enumValues.includes(
          value as (typeof marketplaceListingTypeEnum.enumValues)[number]
        )
    );
  const normalizedSearch = searchParams.get("search")?.trim() || null;
  const conditions: SQL[] = [eq(legacyMarketplaceListings.status, "active")];

  if (categories.length)
    conditions.push(inArray(legacyMarketplaceListings.category, categories));
  if (types.length)
    conditions.push(inArray(legacyMarketplaceListings.type, types));
  if (normalizedSearch) {
    const escaped = escapeLikeSearch(normalizedSearch);
    const searchCondition = or(
      like(legacyMarketplaceListings.title, `%${escaped}%`),
      like(legacyMarketplaceListings.description, `%${escaped}%`)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const whereClause = and(...conditions);
  const items = await db
    .select()
    .from(legacyMarketplaceListings)
    .where(whereClause)
    .orderBy(
      desc(legacyMarketplaceListings.createdAt),
      desc(legacyMarketplaceListings.id)
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(legacyMarketplaceListings)
    .where(whereClause)
    .limit(1);

  const hasCatalogueFilters =
    searchParams.has("category") ||
    searchParams.has("type") ||
    Boolean(normalizedSearch);
  const shouldShowDemo =
    items.length === 0 &&
    process.env.NODE_ENV !== "production" &&
    page === 1 &&
    !hasCatalogueFilters;
  const resultItems = shouldShowDemo
    ? [toLegacyMarketplaceListing(demoMarketplaceListing)]
    : items;
  const total = shouldShowDemo ? 1 : (countRow?.count ?? 0);

  return {
    items: resultItems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** Public detail lookup; only active listings are visible without authentication. */
export async function getPublicLegacyMarketplaceListing(
  id: string
): Promise<LegacyMarketplaceListing | null> {
  if (canUsePublicDemoData(id))
    return toLegacyMarketplaceListing(demoMarketplaceListing);

  const [listing] = await db
    .select()
    .from(legacyMarketplaceListings)
    .where(
      and(
        eq(legacyMarketplaceListings.id, id),
        eq(legacyMarketplaceListings.status, "active")
      )
    )
    .limit(1);
  return listing ?? null;
}
