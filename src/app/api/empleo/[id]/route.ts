import { NextResponse } from "next/server";
import { db } from "@/db";
import { empleoListings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [listing] = await db.select()
      .from(empleoListings)
      .where(eq(empleoListings.id, id))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ item: listing });
  } catch (error) {
    console.error("Error fetching employment listing:", error);
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

    const [updated] = await db.update(empleoListings)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(empleoListings.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("Error updating employment listing:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deleted] = await db.delete(empleoListings)
      .where(eq(empleoListings.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting employment listing:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
