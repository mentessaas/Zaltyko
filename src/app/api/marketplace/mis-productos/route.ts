import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/mis-productos
 * Returns all marketplace listings owned by the authenticated user.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const listings = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.userId, user.id))
      .orderBy(desc(marketplaceListings.createdAt));

    return NextResponse.json({ listings });
  } catch (error) {
    logger.error("Error fetching seller listings", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
