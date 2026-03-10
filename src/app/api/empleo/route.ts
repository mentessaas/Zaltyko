import { NextResponse } from "next/server";
import { db } from "@/db";
import { empleoListings } from "@/db/schema";
import { eq, desc, like, and, count } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const jobType = searchParams.get("jobType");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const conditions = [eq(empleoListings.status, "active" as const)];

  if (category) conditions.push(eq(empleoListings.category, category as any));
  if (jobType) conditions.push(eq(empleoListings.jobType, jobType as any));
  if (search) {
    conditions.push(like(empleoListings.title, `%${search}%`));
  }

  const offset = (page - 1) * limit;

  const listings = await db.select()
    .from(empleoListings)
    .where(and(...conditions))
    .orderBy(desc(empleoListings.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ count: count() })
    .from(empleoListings)
    .where(and(...conditions));

  return NextResponse.json({
    items: listings,
    total,
    page,
    pageSize: limit,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      academyId,
      userId,
      title,
      category,
      description,
      requirements,
      location,
      jobType,
      salary,
      howToApply,
      externalUrl,
      deadline,
    } = body;

    if (!title || !category || !jobType) {
      return NextResponse.json(
        { error: "Title, category, and jobType are required" },
        { status: 400 }
      );
    }

    const [newListing] = await db.insert(empleoListings).values({
      academyId,
      userId,
      title,
      category,
      description,
      requirements,
      location,
      jobType,
      salary,
      howToApply: howToApply || "internal",
      externalUrl,
      deadline,
      status: "active",
    }).returning();

    return NextResponse.json(newListing, { status: 201 });
  } catch (error) {
    console.error("Error creating employment listing:", error);
    return NextResponse.json(
      { error: "Failed to create employment listing" },
      { status: 500 }
    );
  }
}
