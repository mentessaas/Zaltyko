import { NextResponse } from "next/server";

import { db } from "@/db";
import { listingCategories } from "@/db/schema/categories";

/**
 * GET /api/listing-categories/tree
 * Devuelve el árbol completo de categorías (padres con sus hijas anidadas).
 */
export async function GET() {
  const rows = await db
    .select()
    .from(listingCategories)
    .orderBy(listingCategories.sortOrder);

  const byId = new Map<string, typeof rows[number] & { children: typeof rows }>();
  for (const r of rows) {
    byId.set(r.id, { ...r, children: [] });
  }
  const roots: typeof rows = [];
  for (const r of byId.values()) {
    if (r.parentId && byId.has(r.parentId)) {
      byId.get(r.parentId)!.children.push(r);
    } else {
      roots.push(r);
    }
  }
  return NextResponse.json(roots);
}
