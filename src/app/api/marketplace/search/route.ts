import { NextRequest, NextResponse } from "next/server";

import { searchListings } from "@/lib/marketplace/search";

/**
 * GET /api/marketplace/search?q=&minPrice=&maxPrice=&condition=&limit=
 * Búsqueda pública de listings activos.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const minPriceParam = url.searchParams.get("minPrice");
  const maxPriceParam = url.searchParams.get("maxPrice");
  const condition = url.searchParams.get("condition") ?? undefined;
  const limitParam = url.searchParams.get("limit");

  const minPriceCents = minPriceParam
    ? Math.round(parseFloat(minPriceParam) * 100)
    : undefined;
  const maxPriceCents = maxPriceParam
    ? Math.round(parseFloat(maxPriceParam) * 100)
    : undefined;
  const limit = limitParam ? Math.min(100, parseInt(limitParam, 10)) : 50;

  const items = await searchListings({
    query: q,
    minPriceCents,
    maxPriceCents,
    condition,
    limit,
  });
  return NextResponse.json(items);
}
