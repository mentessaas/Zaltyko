export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { marketplaceCategoryEnum, marketplaceListingTypeEnum } from "@/db/schema/enums";
import { eq, desc, like, and, or } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/authz";
import { escapeLikeSearch } from "@/lib/helpers";

// Validation schemas
const CreateMarketplaceSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  sellerType: z.enum(["academy", "coach", "athlete", "external"]),
  type: z.enum(["product", "service"]),
  category: z.enum([
    "equipment", "clothing", "supplements", "books", "particular_training",
    "personal_training", "clinics", "arbitration", "physiotherapy", "photography", "other"
  ]),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().default("eur"),
  priceType: z.enum(["fixed", "negotiable", "contact"]).default("contact"),
  contact: z.object({
    whatsapp: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }).optional(),
  images: z.array(z.string()).optional(),
  location: z.object({
    country: z.string(),
    province: z.string().optional(),
    city: z.string(),
  }).optional(),
});


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const type = searchParams.get("type");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const conditions: any[] = [eq(marketplaceListings.status, "active")];

  if (category) {
    const validCategory = marketplaceCategoryEnum.enumValues.includes(category as typeof marketplaceCategoryEnum.enumValues[number])
      ? category as typeof marketplaceCategoryEnum.enumValues[number]
      : null;
    if (validCategory) conditions.push(eq(marketplaceListings.category, validCategory));
  }
  if (type) {
    const validType = marketplaceListingTypeEnum.enumValues.includes(type as typeof marketplaceListingTypeEnum.enumValues[number])
      ? type as typeof marketplaceListingTypeEnum.enumValues[number]
      : null;
    if (validType) conditions.push(eq(marketplaceListings.type, validType));
  }
  if (search) {
    const escaped = escapeLikeSearch(search);
    conditions.push(or(
      like(marketplaceListings.title, `%${escaped}%`),
      like(marketplaceListings.description, `%${escaped}%`)
    ));
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
  const offset = (page - 1) * limit;

  const listings = await db.select()
    .from(marketplaceListings)
    .where(whereClause)
    .orderBy(desc(marketplaceListings.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db.select({ count: marketplaceListings.id })
    .from(marketplaceListings)
    .where(whereClause);

  return NextResponse.json({
    items: listings,
    total: total.length,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total.length / limit),
  });
}

export const POST = withTenant(async (request: Request, context: TenantContext) => {
  try {
    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 403 });
    }

    const body = await request.json();
    const validated = CreateMarketplaceSchema.parse(body);

    const [listing] = await db.insert(marketplaceListings).values({
      userId: context.userId,
      sellerType: validated.sellerType,
      type: validated.type,
      category: validated.category,
      title: validated.title,
      description: validated.description,
      priceCents: validated.priceCents,
      priceType: validated.priceType,
      contact: validated.contact,
      images: validated.images,
      location: validated.location,
    }).returning();

    return NextResponse.json({ item: listing }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error creating marketplace listing:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
