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
  return async (request: Request, context: Ctx & { params?: Record<string, string> }) => {
    try {
      const userId = await resolveUserId(request, context);

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
        ...(context as Ctx),
        userId,
        profile,
      });
    } catch (error) {
      if (error instanceof SuperAdminRequiredError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.status }
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
  return async (request: Request, context: Ctx & { params?: Record<string, string> }) => {
    try {
      // Resolver userId
      const userId = await resolveUserId(request, context);
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
      const effectiveAcademyId = extractAcademyId(request, context);

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
      const isAdmin = profile.role === "admin" || profile.role === "super_admin";
      const isEventsEndpoint = pathname.startsWith("/api/events");

      const hasValidTenantId = tenantId && tenantId !== "";

      // Validar tenantId según el tipo de endpoint
      if (
        !hasValidTenantId &&
        !isPublic &&
        !isAcademyCreation &&
        !isFlexible &&
        !isAdmin
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
        ...(context as Ctx),
        tenantId: handlerTenantId,
        userId,
        profile,
      });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof ProfileNotFoundError) {
        return NextResponse.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof TenantMissingError) {
        return NextResponse.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof LoginDisabledError) {
        return NextResponse.json(
          { error: error.code, message: "Tu cuenta no tiene acceso activado. Contacta al administrador." },
          { status: error.status }
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
