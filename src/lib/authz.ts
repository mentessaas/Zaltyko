import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileRow = typeof profiles.$inferSelect;

export interface TenantContext<C extends Record<string, unknown> = Record<string, unknown>>
  extends C {
  tenantId: string;
  userId: string;
  profile: ProfileRow;
}

export const authzAdapter = {
  db,
};

export async function getCurrentProfile(userId: string): Promise<ProfileRow | null> {
  const [profile] = await authzAdapter.db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return profile ?? null;
}

export async function getTenantId(userId: string, academyId?: string): Promise<string | null> {
  const profile = await getCurrentProfile(userId);
  if (!profile) {
    return null;
  }

  const isAdmin = profile.role === "admin" || profile.role === "super_admin";

  // Si hay academyId, intentar obtener tenantId desde la academia
  // Esto funciona para admins y también para owners que acaban de crear su academia
  if (academyId) {
    const [academy] = await authzAdapter.db
      .select({ tenantId: academies.tenantId, ownerId: academies.ownerId })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (academy) {
      // Si es admin o es el owner de la academia, usar el tenantId de la academia
      if (isAdmin || academy.ownerId === profile.id) {
        return academy.tenantId ?? null;
      }
    }
  }

  // Fallback al tenantId del perfil
  return profile.tenantId ?? null;
}

export function assertSuperAdmin(profile: ProfileRow | null | undefined) {
  if (!profile || profile.role !== "super_admin") {
    const error: any = new Error("SUPER_ADMIN_REQUIRED");
    error.status = 403;
    throw error;
  }
}

export function withSuperAdmin<Ctx extends Record<string, unknown>>(
  handler: (request: Request, context: Ctx & { userId: string; profile: ProfileRow }) => Promise<Response>
) {
  return async (request: Request, context: Ctx & { params?: Record<string, string> }) => {
    let implicitUserId = request.headers.get("x-user-id") ?? context?.params?.userId;

    if (!implicitUserId) {
      try {
        const cookieStore = cookies();
        const supabase = await createSupabaseServerClient(cookieStore);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        implicitUserId = user?.id ?? undefined;
      } catch (error) {
        if (process.env.NODE_ENV !== "test") {
          console.warn("withSuperAdmin: no se pudo obtener el usuario de Supabase", error);
        }
      }
    }

    if (!implicitUserId) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const profile = await getCurrentProfile(implicitUserId);

    if (!profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    try {
      assertSuperAdmin(profile);
    } catch (error: any) {
      return NextResponse.json({ error: error.message ?? "FORBIDDEN" }, { status: error.status ?? 403 });
    }

    return handler(request, {
      ...(context as Ctx),
      userId: implicitUserId,
      profile,
    });
  };
}

export function withTenant<Ctx extends Record<string, unknown>>(
  handler: (request: Request, context: TenantContext<Ctx>) => Promise<Response>
) {
  return async (request: Request, context: Ctx & { params?: Record<string, string> }) => {
    try {
      let implicitUserId = request.headers.get("x-user-id") ?? context?.params?.userId;

      if (!implicitUserId) {
        try {
          const cookieStore = cookies();
          const supabase = await createSupabaseServerClient(cookieStore);
          const {
            data: { user },
          } = await supabase.auth.getUser();
          implicitUserId = user?.id ?? undefined;
        } catch (error) {
          if (process.env.NODE_ENV !== "test") {
            console.warn("withTenant: no se pudo obtener el usuario de Supabase", error);
          }
        }
      }

      if (!implicitUserId) {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }

      const profile = await getCurrentProfile(implicitUserId);

      if (!profile) {
        return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
      }

      // Check if user can login (for athletes and other roles that might be restricted)
      if (!profile.canLogin && profile.role !== "super_admin") {
        return NextResponse.json(
          { error: "LOGIN_DISABLED", message: "Tu cuenta no tiene acceso activado. Contacta al administrador." },
          { status: 403 }
        );
      }

      // Intentar obtener academyId desde diferentes fuentes
      const overrideAcademyId = request.headers.get("x-academy-id") ?? context?.params?.academyId;
      
      // Para rutas dinámicas como /api/dashboard/[academyId], extraer el academyId de la URL
      let academyIdFromPath: string | undefined;
      const pathname = new URL(request.url).pathname;
      const dashboardMatch = pathname.match(/^\/api\/dashboard\/([^/]+)/);
      if (dashboardMatch) {
        academyIdFromPath = dashboardMatch[1];
      }
      
      // Extraer academyId de query params para endpoints como /api/groups?academyId=...
      const url = new URL(request.url);
      const academyIdFromQuery = url.searchParams.get("academyId") ?? undefined;
      
      const effectiveAcademyId = overrideAcademyId ?? academyIdFromPath ?? academyIdFromQuery;
      const tenantId = await getTenantId(implicitUserId, effectiveAcademyId ?? undefined);

      const method = request.method?.toUpperCase();
      const isPublicAcademyFetch = method === "GET" && pathname.startsWith("/api/academies");
      const isAcademyCreation = method === "POST" && pathname.startsWith("/api/academies");
      const isDashboardFetch = method === "GET" && pathname.startsWith("/api/dashboard/");
      const isTooltipsEndpoint = pathname.startsWith("/api/tooltips");
      const isGroupsEndpoint = pathname.startsWith("/api/groups");
      const isAthletesEndpoint = pathname.startsWith("/api/athletes");

      // Si no hay tenantId pero hay academyId, intentar obtenerlo desde la academia
      if (!tenantId && effectiveAcademyId && (profile.role === "owner" || profile.role === "admin" || profile.role === "super_admin")) {
        const [academy] = await authzAdapter.db
          .select({ tenantId: academies.tenantId, ownerId: academies.ownerId })
          .from(academies)
          .where(eq(academies.id, effectiveAcademyId))
          .limit(1);
        
        if (academy && (profile.role === "super_admin" || profile.role === "admin" || academy.ownerId === profile.id)) {
          // Actualizar el perfil con el tenantId si no lo tiene
          // Nota: No actualizamos updated_at porque puede no existir en el esquema
          if (!profile.tenantId && academy.tenantId) {
            try {
              await authzAdapter.db
                .update(profiles)
                .set({ 
                  tenantId: academy.tenantId,
                  activeAcademyId: effectiveAcademyId 
                })
                .where(eq(profiles.id, profile.id));
              
              // Actualizar el objeto profile en memoria para reflejar los cambios
              profile.tenantId = academy.tenantId;
              profile.activeAcademyId = effectiveAcademyId;
            } catch (error) {
              // Si falla la actualización, continuar con el tenantId obtenido de la academia
              console.warn("Failed to update profile with tenantId:", error);
            }
          }
        }
      }

      // Re-obtener tenantId después de posible actualización
      const finalTenantId = tenantId || (effectiveAcademyId ? await getTenantId(implicitUserId, effectiveAcademyId) : null);

      if (
        !finalTenantId &&
        !isPublicAcademyFetch &&
        !isAcademyCreation &&
        !isDashboardFetch &&
        !isTooltipsEndpoint &&
        !isGroupsEndpoint &&
        !isAthletesEndpoint &&
        profile.role !== "admin" &&
        profile.role !== "super_admin"
      ) {
        return NextResponse.json({ error: "TENANT_MISSING" }, { status: 403 });
      }

      return handler(request, {
        ...(context as Ctx),
        tenantId: finalTenantId ?? "",
        userId: implicitUserId,
        profile,
      });
    } catch (error) {
      // Asegurar que siempre devolvemos JSON, incluso si hay un error no manejado
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

