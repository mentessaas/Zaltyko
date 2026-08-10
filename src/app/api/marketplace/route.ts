export const dynamic = 'force-dynamic';

import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { marketplaceCategoryEnum, marketplaceListingTypeEnum } from "@/db/schema/enums";
import { eq, desc, like, and, or } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/authz";
import { escapeLikeSearch } from "@/lib/helpers";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { demoMarketplaceListing } from "@/lib/public/demo-listings";

//-sellerType values stored in marketplace_listings.sellerType (text at DB level).
// The API contract is a single source of truth for what the catalogue can render.
const MARKETPLACE_SELLER_TYPES = [
  "academy",
  "coach",
  "athlete",
  "provider",
  "external",
] as const;
type MarketplaceSellerType = (typeof MARKETPLACE_SELLER_TYPES)[number];

// Deriva el tipo de vendedor a partir del rol de plataforma. La auditoría
// ZAL-427 (PV-3) detectó que `sellerType` se enviaba siempre como
// "external" desde /marketplace/nuevo, opacando si el autor era un
// proveedor registrado, una academia o un coach. Esta función es la
// única responsable de la asignación.
function sellerTypeForRole(role: string | null | undefined): MarketplaceSellerType {
  switch (role) {
    case "admin":
    case "owner":
      return "academy";
    case "coach":
      return "coach";
    case "athlete":
      return "athlete";
    case "provider":
      return "provider";
    case "super_admin":
    case "parent":
    default:
      return "external";
  }
}

// Validation schema. `userId` y `sellerType` salen del schema: ambos son
// derivados del contexto server-side (sesión y rol del perfil) y no son
// valores que el cliente debiera poder forzar. Mantenerlos en el body
// abría la puerta a publicar en nombre de otro usuario (IDOR) y a
// falsificar el tipo de vendedor.
const CreateMarketplaceSchema = z.object({
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

  const items = listings.length === 0 && process.env.NODE_ENV !== "production" ? [demoMarketplaceListing] : listings;
  const itemTotal = listings.length === 0 && process.env.NODE_ENV !== "production" ? 1 : total.length;

  return apiSuccess({
    items,
    total: itemTotal,
    page,
    pageSize: limit,
    totalPages: Math.ceil(itemTotal / limit),
  });
}

export const POST = withTenant(async (request: Request, context: TenantContext) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 403);
    }

    const body = await request.json();
    const validated = CreateMarketplaceSchema.parse(body);

    // userId y sellerType se derivan server-side del contexto de la sesión;
    // ignorar cualquier valor que el cliente intentara fijar en el body.
    const userId = context.userId;
    const sellerType = sellerTypeForRole(context.profile?.role);

    const [listing] = await db.insert(marketplaceListings).values({
      userId,
      sellerType,
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

    return apiCreated({ item: listing });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Error de validación", 400);
    }
    logger.error("Error creating marketplace listing:", error);
    return apiError("INTERNAL_ERROR", "Error interno", 500);
  }
});
