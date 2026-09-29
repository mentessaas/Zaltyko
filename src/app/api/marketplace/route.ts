export const dynamic = "force-dynamic";

import { z } from "zod";

import { db } from "@/db";
import { legacyMarketplaceListings as marketplaceListings } from "@/db/schema/marketplace-legacy";
import { withAuthenticatedNoTenant, type TenantContext } from "@/lib/authz";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { listPublicLegacyMarketplace } from "@/lib/marketplace/legacy-catalog";

const MARKETPLACE_SELLER_TYPES = ["academy", "coach", "athlete", "provider", "external"] as const;
type MarketplaceSellerType = (typeof MARKETPLACE_SELLER_TYPES)[number];

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
    default:
      return "external";
  }
}

const ContactSchema = z.object({
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
}).refine(
  (contact) => Boolean(contact.whatsapp?.trim() || contact.email?.trim() || contact.phone?.trim()),
  { message: "Necesitamos al menos una forma de que te contacten.", path: ["whatsapp"] }
);

const CreateMarketplaceSchema = z.object({
  type: z.enum(["product", "service"]),
  category: z.enum([
    "equipment", "clothing", "supplements", "books", "particular_training",
    "personal_training", "clinics", "arbitration", "physiotherapy", "photography", "other",
  ]),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().default("eur"),
  priceType: z.enum(["fixed", "negotiable", "contact"]).default("contact"),
  contact: ContactSchema.optional(),
  images: z.array(z.string()).optional(),
  location: z.object({
    country: z.string(),
    province: z.string().optional(),
    city: z.string(),
  }).optional(),
}).refine((value) => Boolean(value.contact), {
  message: "Necesitamos al menos una forma de que te contacten.",
  path: ["contact"],
});

/**
 * Public legacy classifieds catalogue; the academic B2B catalogue has a separate model.
 * @route-auth GET public
 */
export async function GET(request: Request) {
  try {
    const result = await listPublicLegacyMarketplace(new URL(request.url).searchParams);
    return apiSuccess(result);
  } catch (error) {
    logger.error("Error listing marketplace listings:", error);
    return apiError("INTERNAL_ERROR", "Error al listar los anuncios", 500);
  }
}

/**
 * Publish a legacy classified using the verified session identity.
 * @route-auth POST session
 */
export const POST = withAuthenticatedNoTenant(async (request: Request, context: TenantContext) => {
  try {
    if (!context.userId) return apiError("UNAUTHENTICATED", "Sesión requerida", 401);
    const validated = CreateMarketplaceSchema.parse(await request.json());
    const [listing] = await db.insert(marketplaceListings).values({
      userId: context.userId,
      sellerType: sellerTypeForRole(context.profile?.role),
      type: validated.type,
      category: validated.category,
      title: validated.title,
      description: validated.description,
      priceCents: validated.priceCents,
      priceType: validated.priceType,
      currency: validated.currency,
      contact: validated.contact,
      images: validated.images,
      location: validated.location,
    }).returning();
    return apiCreated({ item: listing });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      const rawField = first?.path?.[0];
      const field = rawField === "whatsapp" || rawField === "email" || rawField === "phone"
        ? "contact"
        : typeof rawField === "string" ? rawField : null;
      return apiError("VALIDATION_ERROR", first?.message ?? "Error de validación", 400, {
        field,
        issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    logger.error("Error creating marketplace listing:", error);
    return apiError("INTERNAL_ERROR", "Error interno", 500);
  }
});
