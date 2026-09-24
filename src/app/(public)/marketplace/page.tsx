import { searchListings } from "@/lib/marketplace/search";
import { MarketplaceBrowse } from "@/components/marketplace/MarketplaceBrowse";
import { getLocaleFromRequest } from "@/i18n/server";

export default async function PublicMarketplacePage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
  const locale = await getLocaleFromRequest();
  const items = await searchListings({
    query: searchParams.q,
    categoryId: searchParams.category,
  });
  return (
    <MarketplaceBrowse
      locale={locale}
      initialCategoryId={searchParams.category ?? ""}
      listings={items.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        priceCents: l.priceCents,
        currency: l.currency,
        condition: l.condition,
        quantityAvailable: l.quantityAvailable,
        quantitySold: l.quantitySold,
      }))}
    />
  );
}
