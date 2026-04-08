import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const [updated] = await db.update(marketplaceListings)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListings.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    logger.error("Error updating marketplace listing:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deleted] = await db.delete(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error deleting marketplace listing:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
