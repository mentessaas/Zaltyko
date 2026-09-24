import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getListing } from "@/lib/marketplace/service";
import { ListingDetail } from "@/components/marketplace/ListingDetail";

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const listing = await getListing(params.id);
  if (!listing || listing.status !== "active") notFound();

  const [seller] = await db
    .select({
      id: academies.id,
      name: academies.name,
      city: academies.city,
    })
    .from(academies)
    .where(eq(academies.id, listing.sellerAcademyId))
    .limit(1);
  if (!seller) notFound();

  return (
    <ListingDetail
      listing={{
        id: listing.id,
        title: listing.title,
        description: listing.description,
        priceCents: listing.priceCents,
        currency: listing.currency,
        condition: listing.condition,
        quantityAvailable: listing.quantityAvailable,
        quantitySold: listing.quantitySold,
        imagesUrls: listing.imagesUrls ?? [],
        zaltykoCommissionCents: listing.zaltykoCommissionCents,
      }}
      seller={{
        id: seller.id,
        name: seller.name,
        // TODO(2026-09-24): añadir publicSlug en academy migration.
        // Por ahora usamos string vacío para no romper el tipo del componente.
        publicSlug: "",
        city: seller.city,
      }}
    />
  );
}
