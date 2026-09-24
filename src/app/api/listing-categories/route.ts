import { NextResponse } from "next/server";

import { db } from "@/db";
import { listingCategories } from "@/db/schema/categories";

/**
 * GET /api/listing-categories
 * Lista pública de categorías predefinidas del marketplace.
 */
export async function GET() {
  const rows = await db
    .select()
    .from(listingCategories)
    .orderBy(listingCategories.sortOrder);
  return NextResponse.json(rows);
}
