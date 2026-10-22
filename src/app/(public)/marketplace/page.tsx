import type { Metadata } from "next";
import Link from "next/link";

import { MarketplaceCard } from "@/components/marketplace/MarketplaceCard";
import { MarketplaceFilters } from "@/components/marketplace/MarketplaceFilters";
import { AdBanner } from "@/components/advertising/AdBanner";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import {
  listActivePublicAds,
  toPublicAdBannerItems,
  type PublicAdBannerItem,
} from "@/lib/advertising/public-ads";
import { listPublicLegacyMarketplace } from "@/lib/marketplace/legacy-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Marketplace de Gimnasia",
  description: "Compra y vende productos y servicios para gimnastas.",
  alternates: { canonical: `${getPublicSiteUrl()}/marketplace` },
};

type SearchParams = {
  category?: string | string[];
  type?: string | string[];
  search?: string;
  page?: string;
};
function asQueryValues(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function toSearchParams(searchParams: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const category of asQueryValues(searchParams.category))
    params.append("category", category);
  for (const type of asQueryValues(searchParams.type))
    params.append("type", type);
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.page) params.set("page", searchParams.page);
  return params;
}

async function getAds(): Promise<PublicAdBannerItem[]> {
  try {
    return toPublicAdBannerItems(await listActivePublicAds("marketplace_top"));
  } catch {
    return [];
  }
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const [{ items: listings, total, page, totalPages }, ads] = await Promise.all(
    [
      listPublicLegacyMarketplace(toSearchParams(resolvedSearchParams)),
      getAds(),
    ]
  );
  return (
    <div className="container mx-auto px-4 py-8">
      <PublicPageHeader
        title="Marketplace"
        publishHref="/marketplace/nuevo"
        publishLabel="Publicar"
        dashboardHref="/dashboard/marketplace/mis-productos"
        dashboardHrefTemplate="/dashboard/marketplace/mis-productos"
        dashboardLabel="Mis productos"
      />
      <AdBanner ads={ads} position="top" />
      <div className="flex gap-8 mt-6">
        <aside className="w-64 shrink-0">
          <MarketplaceFilters />
        </aside>
        <main className="flex-1">
          <p aria-live="polite" className="mb-4 text-sm text-muted-foreground">
            {total} resultados · Página {page} de {Math.max(totalPages, 1)}
          </p>
          {listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((listing) => (
                <MarketplaceCard
                  key={listing.id}
                  listing={{
                    id: listing.id,
                    title: listing.title,
                    type: listing.type,
                    category: listing.category,
                    priceCents: listing.priceCents,
                    currency: listing.currency,
                    priceType: listing.priceType ?? "contact",
                    images: listing.images,
                    location: listing.location,
                    isFeatured: listing.isFeatured,
                    sellerType: listing.sellerType,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p>No encontramos resultados para esos filtros.</p>
              <Link href="/marketplace" className="underline">
                Ver todo el marketplace
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
