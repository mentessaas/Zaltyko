import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { eq, desc, like, and, or } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const type = searchParams.get("type");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const conditions = [eq(marketplaceListings.status, "active")];

  if (category) conditions.push(eq(marketplaceListings.category, category as any));
  if (type) conditions.push(eq(marketplaceListings.type, type as any));
  if (search) {
    conditions.push(or(
      like(marketplaceListings.title, `%${search}%`),
      like(marketplaceListings.description, `%${search}%`)
    ));
  }

  const offset = (page - 1) * limit;

  const listings = await db.select()
    .from(marketplaceListings)
    .where(and(...conditions))
    .orderBy(desc(marketplaceListings.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db.select({ count: marketplaceListings.id })
    .from(marketplaceListings)
    .where(and(...conditions));

  return NextResponse.json({
    items: listings,
    total: total.length,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total.length / limit),
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  const [listing] = await db.insert(marketplaceListings).values({
    userId: body.userId,
    sellerType: body.sellerType,
    type: body.type,
    category: body.category,
    title: body.title,
    description: body.description,
    priceCents: body.priceCents,
    priceType: body.priceType,
    contact: body.contact,
    images: body.images,
    location: body.location,
  }).returning();

  return NextResponse.json({ item: listing });
}
