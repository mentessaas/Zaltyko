/**
 * Middleware de validación de entrada usando Zod
 * US-005: Add input validation middleware using Zod-like schemas
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodSchema, ZodError } from "zod";
import { logger } from "./logger";
import { handleApiError } from "./api-error-handler";

interface ValidationConfig {
  body?: ZodSchema<unknown>;
  query?: ZodSchema<unknown>;
  params?: ZodSchema<unknown>;
}

/**
 * Middleware de validación para endpoints API
 * Valida body, query params y route params contra esquemas Zod
 */
export function withValidation<T extends ValidationConfig>(config: T) {
  return function (
    handler: (
      req: NextRequest,
      context: {
        validated: {
          body: T["body"] extends ZodSchema<infer U> ? U : unknown;
          query: T["query"] extends ZodSchema<infer U> ? U : unknown;
          params: T["params"] extends ZodSchema<infer U> ? U : unknown;
        };
      }
    ) => Promise<Response>
  ) {
    return async (req: NextRequest, routeContext: { params?: unknown }) => {
      const startTime = Date.now();
      const url = new URL(req.url);
      
      try {
        const validated: Record<string, unknown> = {};

        // Validar query params
        if (config.query) {
          const queryObj = Object.fromEntries(url.searchParams.entries());
          const result = config.query.safeParse(queryObj);
          if (!result.success) {
            logger.warn("Query validation failed", {
              endpoint: url.pathname,
              errors: result.error.issues,
            });
            return NextResponse.json(
              {
                error: "VALIDATION_ERROR",
                message: "Parámetros de query inválidos",
                details: result.error.issues,
              },
              { status: 400 }
            );
          }
          validated.query = result.data;
        }

        // Validar body
        if (config.body) {
          let body: unknown;
          try {
            body = await req.json();
          } catch {
            logger.warn("Invalid JSON body", {
              endpoint: url.pathname,
            });
            return NextResponse.json(
              {
                error: "VALIDATION_ERROR",
                message: "Body debe ser JSON válido",
              },
              { status: 400 }
            );
          }

          const result = config.body.safeParse(body);
          if (!result.success) {
            logger.warn("Body validation failed", {
              endpoint: url.pathname,
              errors: result.error.issues,
            });
            return NextResponse.json(
              {
                error: "VALIDATION_ERROR",
                message: "Datos de entrada inválidos",
                details: result.error.issues,
              },
              { status: 400 }
            );
          }
          validated.body = result.data;
        }

        // Validar params
        if (config.params && routeContext.params) {
          const result = config.params.safeParse(routeContext.params);
          if (!result.success) {
            logger.warn("Params validation failed", {
              endpoint: url.pathname,
              errors: result.error.issues,
            });
            return NextResponse.json(
              {
                error: "VALIDATION_ERROR",
                message: "Parámetros de ruta inválidos",
                details: result.error.issues,
              },
              { status: 400 }
            );
          }
          validated.params = result.data;
        }

        // Log de validación exitosa
        const duration = Date.now() - startTime;
        logger.debug("Request validation successful", {
          endpoint: url.pathname,
          duration: `${duration}ms`,
        });

        // Llamar al handler con datos validados
        return handler(req, {
          validated: validated as {
            body: T["body"] extends ZodSchema<infer U> ? U : unknown;
            query: T["query"] extends ZodSchema<infer U> ? U : unknown;
            params: T["params"] extends ZodSchema<infer U> ? U : unknown;
          },
        });
      } catch (error) {
        logger.error("Validation middleware error", error, {
          endpoint: url.pathname,
        });
        return handleApiError(error, { endpoint: url.pathname, method: req.method });
      }
    };
  };
}

/**
 * Helper para validar solo el body
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return withValidation({ body: schema });
}

/**
 * Helper para validar solo query params
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return withValidation({ query: schema });
}
