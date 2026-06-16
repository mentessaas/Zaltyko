import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiError } from "@/lib/api-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [listing] = await db.select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ item: listing });
  } catch (error) {
    logger.error("Error fetching marketplace listing:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  _request: Request,
  _context: { params: Promise<{ id: string }> }
) {
  return apiError(
    "ENDPOINT_DEPRECATED",
    "Use /api/marketplace/mis-productos/[id] for authenticated listing updates.",
    410
  );
}

export async function DELETE(
  _request: Request,
  _context: { params: Promise<{ id: string }> }
) {
  return apiError(
    "ENDPOINT_DEPRECATED",
    "Use /api/marketplace/mis-productos/[id] for authenticated listing deletes.",
    410
  );
}
