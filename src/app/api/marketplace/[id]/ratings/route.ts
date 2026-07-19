import { NextResponse } from "next/server";
import { eq, desc, sql, count, avg } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { marketplaceListings, marketplaceRatings, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/[id]/ratings
 * Returns all ratings for a listing with aggregate stats.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [listing] = await db
      .select({ id: marketplaceListings.id })
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const ratings = await db
      .select({
        id: marketplaceRatings.id,
        rating: marketplaceRatings.rating,
        comment: marketplaceRatings.comment,
        verified: marketplaceRatings.verified,
        createdAt: marketplaceRatings.createdAt,
        reviewerName: profiles.name,
      })
      .from(marketplaceRatings)
      .leftJoin(profiles, eq(marketplaceRatings.reviewerId, profiles.id))
      .where(eq(marketplaceRatings.listingId, id))
      .orderBy(desc(marketplaceRatings.createdAt));

    const [{ avgRating, totalCount }] = await db
      .select({
        avgRating: sql<number>`round(avg(${marketplaceRatings.rating})::numeric, 1)`,
        totalCount: count(),
      })
      .from(marketplaceRatings)
      .where(eq(marketplaceRatings.listingId, id));

    return NextResponse.json({
      ratings,
      averageRating: Number(avgRating) || null,
      totalCount: Number(totalCount) || 0,
    });
  } catch (error) {
    logger.error("Error fetching ratings", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

/**
 * POST /api/marketplace/[id]/ratings
 * Adds a rating to a listing.
 */
const PostRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(
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

    const [listing] = await db
      .select({ id: marketplaceListings.id })
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "LISTING_NOT_FOUND" }, { status: 404 });
    }

    // Get user's profile
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    // Get listing with seller profile (join on marketplaceListings.userId = profiles.userId)
    const [listingWithSeller] = await db
      .select({
        listingUserId: marketplaceListings.userId,
        sellerProfileId: profiles.id,
      })
      .from(marketplaceListings)
      .leftJoin(profiles, eq(marketplaceListings.userId, profiles.userId))
      .where(eq(marketplaceListings.id, id))
      .limit(1);

    if (!listingWithSeller) {
      return NextResponse.json({ error: "LISTING_NOT_FOUND" }, { status: 404 });
    }

    // Prevent self-rating
    if (listingWithSeller.listingUserId === user.id) {
      return NextResponse.json(
        { error: "Cannot rate your own listing" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = PostRatingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const [rating] = await db
      .insert(marketplaceRatings)
      .values({
        listingId: id,
        sellerId: listingWithSeller.sellerProfileId as any, // profiles.id
        reviewerId: profile.id,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
        verified: false,
      })
      .returning();

    return NextResponse.json({ rating }, { status: 201 });
  } catch (error) {
    logger.error("Error creating rating", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
