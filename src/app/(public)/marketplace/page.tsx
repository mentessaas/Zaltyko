import { Metadata } from "next";
import { MarketplaceCard } from "@/components/marketplace/MarketplaceCard";
import { AdBanner } from "@/components/advertising/AdBanner";

export const metadata: Metadata = {
  title: "Marketplace | Zaltyko",
  description: "Compra y vende productos y servicios para gimnastas",
};

async function getListings(searchParams: { category?: string; type?: string; search?: string; page?: string }) {
  const params = new URLSearchParams();
  if (searchParams.category) params.set("category", searchParams.category);
  if (searchParams.type) params.set("type", searchParams.type);
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.page) params.set("page", searchParams.page);

  const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/marketplace?${params}`, {
    cache: "no-store",
  });
  return res.json();
}

async function getAds(zone: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/advertising/zones/${zone}`, {
    cache: "no-store",
  });
  return res.json();
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: { category?: string; type?: string; search?: string; page?: string };
}) {
  const { items: listings, total, page, totalPages } = await getListings(searchParams);
  const { ads: topAds } = await getAds("marketplace_top");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Marketplace</h1>

      <AdBanner ads={topAds} position="top" />

      <div className="flex gap-8 mt-6">
        <main className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings?.map((listing: any) => (
              <MarketplaceCard key={listing.id} listing={listing} />
            ))}
          </div>

          {listings?.length === 0 && (
            <p className="text-center text-gray-500 py-12">
              No hay productos o servicios disponibles
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
