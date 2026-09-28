import { notFound } from "next/navigation";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listProductsByAcademy } from "@/lib/store/service";
import { assertAcademyOwner } from "@/lib/actor-pages/guard";
import { StoreAdminClient } from "@/components/store-admin/StoreAdminClient";

export default async function StoreAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ academyId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { academyId } = await params;
  const { page: rawPage } = await searchParams;
  const page = Number(rawPage ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) notFound();
  const user = await getCurrentUser();
  if (!user) notFound();

  const owner = await assertAcademyOwner(academyId, user);
  if (!owner) notFound();

  const [academy] = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  if (!academy) notFound();

  const products = await listProductsByAcademy(academy.id, page);

  return (
    <StoreAdminClient
      key={page}
      academyId={academy.id}
      academyName={academy.name}
      page={page}
      hasNext={products.hasNext}
      initialProducts={products.items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        productType: p.productType,
        isActive: p.isActive,
        isFeatured: p.isFeatured,
        stockQuantity: p.stockQuantity,
        lowStockThreshold: p.lowStockThreshold,
        imageUrls: p.imageUrls ?? [],
        visibility: p.visibility,
      }))}
    />
  );
}
