import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/marketplace/mis-productos/[id]
 * Updates a listing's status (active / paused / sold).
 */
const UpdateSchema = z.object({
  status: z.enum(["active", "paused", "sold"]).optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.errors },
        { status: 400 }
      );
    }

    // Verify ownership
    const [existing] = await db
      .select({ userId: marketplaceListings.userId })
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.priceCents !== undefined) updateData.priceCents = parsed.data.priceCents;

    const [updated] = await db
      .update(marketplaceListings)
      .set(updateData as any)
      .where(eq(marketplaceListings.id, id))
      .returning();

    return NextResponse.json({ listing: updated });
  } catch (error) {
    logger.error("Error updating listing", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

/**
 * DELETE /api/marketplace/mis-productos/[id]
 * Deletes a listing owned by the authenticated user.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const [existing] = await db
      .select({ userId: marketplaceListings.userId })
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    await db
      .delete(marketplaceListings)
      .where(eq(marketplaceListings.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Error deleting listing", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
