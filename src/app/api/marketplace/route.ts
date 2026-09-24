export const dynamic = 'force-dynamic';
// @route-auth bearer (authenticated user, tenant optional for catalogue access)

import { db } from "@/db";
import { marketplaceListings, profiles } from "@/db/schema";
import { eq, desc, like, and, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { withAuthenticatedNoTenant, type TenantContext } from "@/lib/authz";
import { escapeLikeSearch } from "@/lib/helpers";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { demoMarketplaceListing } from "@/lib/public/demo-listings";

/**
 * GET /api/marketplace — lista listings activos del marketplace.
 *
 * Schema actual de marketplaceListings (sept-2026): id, tenantId, sellerAcademyId,
 * title, description, condition, priceCents, currency, quantityAvailable,
 * imagesUrls, status, publishedAt, expiresAt, categoryId, createdAt, updatedAt.
 *
 * Por tanto, en este handler:
 *   - - el filtro de categoría se hace por categoryId (FK a listingCategories) si se pasa.
 *   - - el filtro de tipo se omite (no hay columna `type`; condición es el proxy).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const normalizedSearch = search?.trim() || null;
    const rawPage = parseInt(searchParams.get("page") || "1", 10);
    const rawLimit = parseInt(searchParams.get("limit") || "20", 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

    const conditions: SQL[] = [eq(marketplaceListings.status, "active")];

    const categoryId = searchParams.get("categoryId");
    if (categoryId) {
      conditions.push(eq(marketplaceListings.categoryId, categoryId));
    }

    if (normalizedSearch) {
      const escaped = escapeLikeSearch(normalizedSearch);
      const searchCondition = or(
        like(marketplaceListings.title, `%${escaped}%`),
        like(marketplaceListings.description, `%${escaped}%`)
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const offset = (page - 1) * limit;

    const listings = await db.select()
      .from(marketplaceListings)
      .where(whereClause)
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(marketplaceListings)
      .where(whereClause);

    // Demo listing solo aparece si la búsqueda está vacía y no hay filtros.
    const hasCatalogueFilters = Boolean(categoryId) || Boolean(normalizedSearch);
    const shouldShowDemo =
      listings.length === 0 &&
      process.env.NODE_ENV !== "production" &&
      page === 1 &&
      !hasCatalogueFilters;
    const items = shouldShowDemo ? [demoMarketplaceListing] : listings;
    const itemTotal = shouldShowDemo ? 1 : countRow?.count ?? 0;

    return apiSuccess({
      items,
      total: itemTotal,
      page,
      pageSize: limit,
      totalPages: Math.ceil(itemTotal / limit),
    });
  } catch (error) {
    logger.error("Error listing marketplace listings:", error);
    return apiError("INTERNAL_ERROR", "Error al listar los anuncios", 500);
  }
}

const CreateMarketplaceSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().default("eur"),
  categoryId: z.string().uuid().optional(),
});

/**
 * POST /api/marketplace — crea un listing del marketplace.
 *
 * El vendedor (sellerAcademyId) se deriva server-side del activeAcademyId del profile.
 * Por seguridad NO se acepta sellerAcademyId ni userId del cliente (IDOR).
 */
// @auth-flexible route-guard-reason: withAuthenticatedNoTenant resolves auth before handler execution
export const POST = withAuthenticatedNoTenant(async (request: Request, context: TenantContext) => {
  try {
    if (!context.userId) {
      return apiError("UNAUTHENTICATED", "Sesión requerida", 401);
    }

    const body = await request.json();
    const validated = CreateMarketplaceSchema.parse(body);

    // Derivar sellerAcademyId del profile del usuario.
    const [profile] = await db
      .select({ activeAcademyId: profiles.activeAcademyId })
      .from(profiles)
      .where(eq(profiles.userId, context.userId))
      .limit(1);

    if (!profile?.activeAcademyId) {
      return apiError("NO_ACADEMY", "Necesitas una academia activa para publicar", 400);
    }

    const [listing] = await db.insert(marketplaceListings).values({
      tenantId: context.tenantId ?? context.userId, // fallback al userId si no hay tenant
      sellerAcademyId: profile.activeAcademyId,
      title: validated.title,
      description: validated.description ?? null,
      priceCents: validated.priceCents ?? 0,
      currency: validated.currency.toUpperCase(),
      categoryId: validated.categoryId ?? null,
      status: "draft",
    }).returning();

    return apiCreated({ item: listing });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      const rawField = first?.path?.[0];
      const field = typeof rawField === "string" ? rawField : null;
      return apiError(
        "VALIDATION_ERROR",
        first?.message ?? "Error de validación",
        400,
        {
          field,
          issues: error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        }
      );
    }
    logger.error("Error creating marketplace listing:", error);
    return apiError("INTERNAL_ERROR", "Error interno", 500);
  }
});