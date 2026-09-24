import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { marketplaceListings, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/mis-productos
 * Returns all marketplace listings owned by the authenticated user's academy.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // Resolver academia activa del usuario
    const [profile] = await db
      .select({ activeAcademyId: profiles.activeAcademyId })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!profile?.activeAcademyId) {
      return NextResponse.json({ error: "NO_ACADEMY" }, { status: 404 });
    }

    const listings = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.sellerAcademyId, profile.activeAcademyId))
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(100);

    return NextResponse.json({ listings });
  } catch (error) {
    logger.error("Error fetching seller listings", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
