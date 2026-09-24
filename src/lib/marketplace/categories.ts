import { db } from "@/db";
import { listingCategories } from "@/db/schema/categories";

export type ListingCategory = {
  id: string;
  parentId: string | null;
  slug: string;
  nameEs: string;
  nameEn: string;
  icon: string | null;
  sortOrder: string;
};

export async function listCategories(): Promise<ListingCategory[]> {
  const rows = await db
    .select()
    .from(listingCategories)
    .orderBy(listingCategories.sortOrder);
  return rows as ListingCategory[];
}
