import { NextResponse } from "next/server";

import { getCurrentProfile, type ProfileRow } from "./authz/profile-service";
import { getTenantId, resolveTenantWithUpdate } from "./authz/tenant-resolver";
import { resolveUserId } from "./authz/user-resolver";
import { updateProfileIfNeeded } from "./authz/profile-updater";
import {
  isPublicEndpoint,
  isAcademyCreationEndpoint,
  isFlexibleTenantEndpoint,
  extractAcademyId,
} from "./authz/endpoint-config";
import {
  SuperAdminRequiredError,
  UnauthenticatedError,
  ProfileNotFoundError,
  TenantMissingError,
  LoginDisabledError,
} from "./authz/errors";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";

export type { ProfileRow };

export type TenantContext<C extends Record<string, unknown> = Record<string, unknown>> = C & {
  tenantId: string;
  userId: string;
  profile: ProfileRow;
};

export const authzAdapter = {
  db,
};

// Re-export para compatibilidad
export { getCurrentProfile, getTenantId };

export function assertSuperAdmin(profile: ProfileRow | null | undefined): void {
  if (!profile || profile.role !== "super_admin") {
    throw new SuperAdminRequiredError();
  }
}

export function withSuperAdmin<Ctx extends Record<string, unknown>>(
  handler: (request: Request, context: Ctx & { userId: string; profile: ProfileRow }) => Promise<Response>
) {
  // Next.js 15 passes context where params is a Promise for dynamic routes
  return async (request: Request, context: any) => {
    try {
      // Resolve params if they're a Promise (Next.js 15 pattern)
      const params = context.params
        ? await context.params
        : context.params;

      const contextWithParams = {
        ...context,
        params,
      };

      const userId = await resolveUserId(request, contextWithParams);

      if (!userId) {
        return NextResponse.json(
          { error: "UNAUTHENTICATED" },
          { status: 401 }
        );
      }

      const profile = await getCurrentProfile(userId);

      if (!profile) {
        return NextResponse.json(
          { error: "PROFILE_NOT_FOUND" },
          { status: 404 }
        );
      }

      assertSuperAdmin(profile);

      return handler(request, {
        ...contextWithParams,
        userId,
        profile,
      });
    } catch (error) {
      if (error instanceof SuperAdminRequiredError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }

      logger.error("Error in withSuperAdmin", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Ha ocurrido un error desconocido",
        },
        { status: 500 }
      );
    }
  };
}

export function withTenant<Ctx extends Record<string, unknown>>(
  handler: (request: Request, context: TenantContext<Ctx>) => Promise<Response>
) {
  // Next.js 15 passes context where params is a Promise for dynamic routes
  return async (request: Request, context: any) => {
    try {
      // Resolve params if they're a Promise (Next.js 15 pattern)
      const params = context.params
        ? await context.params
        : context.params;

      // Create resolved context for functions that need params synchronously
      const contextWithParams = {
        ...context,
        params,
      };

      // Resolver userId
      const userId = await resolveUserId(request, contextWithParams);
      if (!userId) {
        return NextResponse.json(
          { error: "UNAUTHENTICATED" },
          { status: 401 }
        );
      }

      // Obtener perfil
      const profile = await getCurrentProfile(userId);
      if (!profile) {
        return NextResponse.json(
          { error: "PROFILE_NOT_FOUND" },
          { status: 404 }
        );
      }

      // Verificar si el usuario puede hacer login
      if (!profile.canLogin && profile.role !== "super_admin") {
        return NextResponse.json(
          {
            error: "LOGIN_DISABLED",
            message: "Tu cuenta no tiene acceso activado. Contacta al administrador.",
          },
          { status: 403 }
        );
      }

      // Extraer academyId desde diferentes fuentes
      const effectiveAcademyId = extractAcademyId(request, contextWithParams);

      // Resolver tenantId
      let tenantId = await getTenantId(userId, effectiveAcademyId);

      // Si no hay tenantId pero hay academyId, intentar resolver y actualizar perfil
      if (!tenantId && effectiveAcademyId) {
        const resolution = await resolveTenantWithUpdate(userId, effectiveAcademyId, profile);

        if (resolution.shouldUpdateProfile && resolution.newTenantId) {
          const updatedProfile = await updateProfileIfNeeded(
            profile,
            resolution.newTenantId,
            resolution.newActiveAcademyId
          );
          Object.assign(profile, updatedProfile);
        }

        tenantId = resolution.tenantId;
      }

      // Verificar si el endpoint requiere tenantId
      const pathname = new URL(request.url).pathname;
      const method = request.method?.toUpperCase() ?? "GET";
      const isPublic = isPublicEndpoint(pathname, method);
      const isAcademyCreation = isAcademyCreationEndpoint(pathname, method);
      const isFlexible = isFlexibleTenantEndpoint(pathname);
      // Solo super_admin puede operar sin tenantId; admin sigue requiriéndolo
      const isSuperAdmin = profile.role === "super_admin";
      const isEventsEndpoint = pathname.startsWith("/api/events");

      const hasValidTenantId = tenantId && tenantId !== "";

      // Validar tenantId según el tipo de endpoint
      if (
        !hasValidTenantId &&
        !isPublic &&
        !isAcademyCreation &&
        !isFlexible &&
        !isSuperAdmin
      ) {
        return NextResponse.json(
          { error: "TENANT_MISSING" },
          { status: 403 }
        );
      }

      // Para endpoints de eventos, permitir que el handler obtenga el tenantId del academyId en el body
      const handlerTenantId = isEventsEndpoint && !hasValidTenantId && effectiveAcademyId
        ? ""
        : (tenantId ?? "");

      return handler(request, {
        ...contextWithParams,
        tenantId: handlerTenantId,
        userId,
        profile,
      });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json({ error: error.code }, { status: error.statusCode });
      }
      if (error instanceof ProfileNotFoundError) {
        return NextResponse.json({ error: error.code }, { status: error.statusCode });
      }
      if (error instanceof TenantMissingError) {
        return NextResponse.json({ error: error.code }, { status: error.statusCode });
      }
      if (error instanceof LoginDisabledError) {
        return NextResponse.json(
          { error: error.code, message: "Tu cuenta no tiene acceso activado. Contacta al administrador." },
          { status: error.statusCode }
        );
      }

      logger.error("Error in withTenant", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Ha ocurrido un error desconocido",
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Resuelve userId desde Authorization: Bearer <token>.
 * Complemento de withTenant para clientes mobile/PWA que usan bearer.
 * Valida firma via Supabase auth.getUser(token).
 */
async function resolveUserIdFromBearer(request: Request): Promise<string | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  try {
    const supabase = createBearerSupabaseClient(token);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      logger.warn("Bearer token rejected by Supabase", { error: error?.message });
      return null;
    }
    return user.id;
  } catch (err) {
    logger.warn("Failed to validate bearer token", { err });
    return null;
  }
}

/**
 * Wrapper equivalente a withTenant pero para clientes que envian
 * Authorization: Bearer <token> en lugar de cookies Supabase.
 * Mantiene la misma firma de contexto ({ tenantId, userId, profile }).
 *
 * Caso de uso: apps mobile, scripts CLI, integraciones server-to-server
 * que no comparten cookies con el browser.
 */
export function withBearerTenant<Ctx extends Record<string, unknown>>(
  handler: (request: Request, context: TenantContext<Ctx>) => Promise<Response>
) {
  return async (request: Request, context: any) => {
    try {
      const params = context.params ? await context.params : context.params;
      const contextWithParams = { ...context, params };

      const userId = await resolveUserIdFromBearer(request);
      if (!userId) {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }

      const profile = await getCurrentProfile(userId);
      if (!profile) {
        return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
      }

      if (!profile.canLogin && profile.role !== "super_admin") {
        return NextResponse.json(
          {
            error: "LOGIN_DISABLED",
            message: "Tu cuenta no tiene acceso activado. Contacta al administrador.",
          },
          { status: 403 }
        );
      }

      const effectiveAcademyId = extractAcademyId(request, contextWithParams);
      let tenantId = await getTenantId(userId, effectiveAcademyId);

      if (!tenantId && effectiveAcademyId) {
        const resolution = await resolveTenantWithUpdate(userId, effectiveAcademyId, profile);
        if (resolution.shouldUpdateProfile && resolution.newTenantId) {
          const updatedProfile = await updateProfileIfNeeded(
            profile,
            resolution.newTenantId,
            resolution.newActiveAcademyId
          );
          Object.assign(profile, updatedProfile);
        }
        tenantId = resolution.tenantId;
      }

      return handler(request, {
        ...contextWithParams,
        tenantId: tenantId ?? "",
        userId,
        profile,
      });
    } catch (error) {
      logger.error("Error in withBearerTenant", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Ha ocurrido un error desconocido",
        },
        { status: 500 }
      );
    }
  };
}
