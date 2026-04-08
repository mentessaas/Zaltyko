/**
 * GET /api/academies - Lista academias
 * POST /api/academies - Crea academia
 *
 * La lógica de negocio está extraída en academies.lib.ts para facilitar testing
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withPayloadValidation } from "@/lib/payload-validator";
import { handleApiError } from "@/lib/api-error-handler";
import {
  CreateAcademyBodySchema,
  QuerySchema,
  createAcademy,
  listAcademies,
} from "./academies.lib";

export const dynamic = "force-dynamic";

const wrappedPostHandler = withTenant(async (request, context) => {
  try {
    let body;
    try {
      body = CreateAcademyBodySchema.parse(await request.json());
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        return apiError(
          "VALIDATION_ERROR",
          "Los datos proporcionados no son válidos",
          400,
          parseError.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          }))
        );
      }
      return apiError("INVALID_JSON", "El cuerpo de la petición no es un JSON válido", 400);
    }

    const result = await createAcademy(body, { profile: context.profile });
    if (result.error) return result.error;

    return apiCreated(result);
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies", method: "POST" });
  }
});

export const POST = withRateLimit(
  withPayloadValidation(wrappedPostHandler, { maxSize: 512 * 1024 }),
  { identifier: getUserIdentifier }
);

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!parsed.success) {
      return apiError("INVALID_FILTERS", "Los filtros proporcionados no son válidos", 400);
    }

    const { items } = await listAcademies(parsed.data, { profile: context.profile });
    return apiSuccess({ items });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies", method: "GET" });
  }
});
