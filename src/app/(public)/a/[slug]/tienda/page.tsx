import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { listPublicProductsByAcademy } from "@/lib/store/service";
import { getPublicPageBySlug } from "@/lib/actor-pages/service";
import { Storefront } from "@/components/storefront/Storefront";

export default async function AcademyStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: rawPage } = await searchParams;
  const pageNumber = Number(rawPage ?? 1);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 10000) notFound();
  const page = await getPublicPageBySlug(slug);
  if (!page || page.entityType !== "academy") notFound();

  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.id, page.entityId))
    .limit(1);
  if (!academy) notFound();

  const products = await listPublicProductsByAcademy(academy.id, pageNumber);

  return (
    <Storefront
      key={`${academy.id}:${pageNumber}`}
      academyName={page.displayName}
      academyId={academy.id}
      academySlug={slug}
      page={pageNumber}
      hasNext={products.hasNext}
      products={products.items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        productType: p.productType,
        imageUrls: p.imageUrls ?? [],
        stockQuantity: p.stockQuantity,
      }))}
    />
  );
}
