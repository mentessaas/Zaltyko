import { z } from "zod";

import { db } from "@/db";
import { templates } from "@/db/schema/templates/templates";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  countryCode: z.string().optional(),
  discipline: z.string().optional(),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export const GET = withTenant(async (request) => {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!parsed.success) {
      return apiError("INVALID_FILTERS", "Filtros inválidos", 400);
    }

    const { countryCode, discipline, isActive } = parsed.data;

    const conditions = [];

    if (countryCode) {
      conditions.push(eq(templates.countryCode, countryCode));
    }

    if (discipline) {
      conditions.push(eq(templates.discipline, discipline));
    }

    if (isActive !== undefined) {
      conditions.push(eq(templates.isActive, isActive));
    }

    const whereClause = conditions.length > 0
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    const rows = await db
      .select({
        id: templates.id,
        country: templates.country,
        countryCode: templates.countryCode,
        discipline: templates.discipline,
        name: templates.name,
        description: templates.description,
        isActive: templates.isActive,
        isDefault: templates.isDefault,
      })
      .from(templates)
      .where(whereClause)
      .orderBy(templates.name);

    return apiSuccess({ items: rows });
  } catch (error) {
    logger.error("Error fetching templates:", error);
    return apiError("INTERNAL_ERROR", "Error al obtener templates", 500);
  }
});
