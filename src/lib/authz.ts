import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, profiles } from "@/db/schema";

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

  if (isAdmin && academyId) {
    const [academy] = await authzAdapter.db
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    return academy?.tenantId ?? null;
  }

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
    const implicitUserId = request.headers.get("x-user-id") ?? context?.params?.userId;

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
    const implicitUserId = request.headers.get("x-user-id") ?? context?.params?.userId;

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

    const overrideAcademyId = request.headers.get("x-academy-id") ?? context?.params?.academyId;
    const tenantId = await getTenantId(implicitUserId, overrideAcademyId ?? undefined);

    const method = request.method?.toUpperCase();
    const pathname = new URL(request.url).pathname;
    const isPublicAcademyFetch = method === "GET" && pathname.startsWith("/api/academies");
    const isAcademyCreation = method === "POST" && pathname.startsWith("/api/academies");

    if (
      !tenantId &&
      !isPublicAcademyFetch &&
      !isAcademyCreation &&
      profile.role !== "admin" &&
      profile.role !== "super_admin"
    ) {
      return NextResponse.json({ error: "TENANT_MISSING" }, { status: 403 });
    }

    return handler(request, {
      ...(context as Ctx),
      tenantId: tenantId ?? "",
      userId: implicitUserId,
      profile,
    });
  };
}

