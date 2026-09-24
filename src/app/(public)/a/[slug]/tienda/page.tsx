import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { listPublicProductsByAcademy } from "@/lib/store/service";
import { getPublicPageBySlug } from "@/lib/actor-pages/service";
import { Storefront } from "@/components/storefront/Storefront";

export default async function AcademyStorePage({
  params,
}: {
  params: { slug: string };
}) {
  const page = await getPublicPageBySlug(params.slug);
  if (!page || page.entityType !== "academy") notFound();

  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.id, page.entityId))
    .limit(1);
  if (!academy) notFound();

  const products = await listPublicProductsByAcademy(academy.id);

  return (
    <Storefront
      academyName={page.displayName}
      academyId={academy.id}
      products={products.map((p) => ({
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
