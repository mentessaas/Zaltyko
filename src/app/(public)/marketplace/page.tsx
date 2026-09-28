import type { Metadata } from "next";
import Link from "next/link";

import { MarketplaceCard, type MarketplaceListingCard } from "@/components/marketplace/MarketplaceCard";
import { MarketplaceFilters } from "@/components/marketplace/MarketplaceFilters";
import { AdBanner } from "@/components/advertising/AdBanner";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

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
type ListingResult = {
  items: MarketplaceListingCard[];
  total: number;
  page: number;
  totalPages: number;
};

function asQueryValues(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

async function getListings(searchParams: SearchParams): Promise<ListingResult> {
  const params = new URLSearchParams();
  for (const category of asQueryValues(searchParams.category)) params.append("category", category);
  for (const type of asQueryValues(searchParams.type)) params.append("type", type);
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.page) params.set("page", searchParams.page);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
  const response = await fetch(`${baseUrl}/api/marketplace?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error("MARKETPLACE_CATALOG_UNAVAILABLE");
  const payload = await response.json();
  return (payload?.data ?? payload) as ListingResult;
}

async function getAds(): Promise<Array<{ id: string; type: string; imageUrl?: string; linkUrl: string; title: string; altText?: string }>> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
  try {
    const response = await fetch(`${baseUrl}/api/advertising/zones/marketplace_top`, { cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json();
    return payload?.ads ?? [];
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
  const [{ items: listings, total, page, totalPages }, ads] = await Promise.all([
    getListings(resolvedSearchParams),
    getAds(),
  ]);
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
        <aside className="w-64 shrink-0"><MarketplaceFilters /></aside>
        <main className="flex-1">
          <p aria-live="polite" className="mb-4 text-sm text-muted-foreground">
            {total} resultados · Página {page} de {Math.max(totalPages, 1)}
          </p>
          {listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((listing) => <MarketplaceCard key={listing.id} listing={listing} />)}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p>No encontramos resultados para esos filtros.</p>
              <Link href="/marketplace" className="underline">Ver todo el marketplace</Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
