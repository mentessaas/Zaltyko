import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { getCurrentProfile, type ProfileRow } from "@/lib/authz/profile-service";
import { DEV_SESSION_COOKIE } from "@/lib/dev-session";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

const AUTH_COOKIE_PATTERN = /-auth-token(?:\.|$)/;
const IDENTITY_OVERRIDE_HEADERS = ["x-user-id", "x-internal-auth-secret"] as const;
const NO_STORE_HEADERS = { "cache-control": "private, no-store" };

export type SuperAdminOperatorAuth =
  | { ok: true; actorUserId: string; profile: ProfileRow }
  | { ok: false; response: NextResponse };

function reject(code: string, message: string, status: number): SuperAdminOperatorAuth {
  return {
    ok: false,
    response: apiError(code, message, status, undefined, { headers: NO_STORE_HEADERS }),
  };
}

function hasRequiredSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.origin === origin && parsedOrigin.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/**
 * Authenticates a human Super Admin operator for high-impact SaaS actions.
 * This intentionally bypasses resolveUserId: identity overrides, dev sessions,
 * and its short-lived auth lookup cache are not valid for reconciliation.
 */
export async function authenticateSuperAdminOperator(
  request: Request
): Promise<SuperAdminOperatorAuth> {
  if (!hasRequiredSameOrigin(request)) {
    return reject("INVALID_ORIGIN", "Origen de la solicitud no válido.", 403);
  }

  if (IDENTITY_OVERRIDE_HEADERS.some((name) => request.headers.has(name))) {
    return reject("HUMAN_SESSION_REQUIRED", "Inicia sesión para continuar.", 401);
  }

  try {
    const cookieStore = await cookies();
    const cookieNames = cookieStore.getAll().map(({ name }) => name);

    if (
      cookieStore.get(DEV_SESSION_COOKIE) ||
      !cookieNames.some((name) => AUTH_COOKIE_PATTERN.test(name))
    ) {
      return reject("HUMAN_SESSION_REQUIRED", "Inicia sesión para continuar.", 401);
    }

    const supabase = await createSupabaseServerClient(cookieStore);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return reject("UNAUTHENTICATED", "La sesión no es válida.", 401);
    }
    if (!user?.id) {
      return reject("UNAUTHENTICATED", "Inicia sesión para continuar.", 401);
    }

    // This is a fresh DB read on every call; role claims in Auth metadata are
    // deliberately ignored.
    const profile = await getCurrentProfile(user.id);
    if (!profile || profile.role !== "super_admin" || profile.isSuspended) {
      return reject("SUPER_ADMIN_REQUIRED", "Se requiere un Super Admin activo.", 403);
    }

    return { ok: true, actorUserId: user.id, profile };
  } catch {
    // Fail closed without putting auth tokens or provider error details in logs.
    return reject(
      "AUTHENTICATION_UNAVAILABLE",
      "No se pudo verificar la sesión. Inténtalo de nuevo.",
      503
    );
  }
}
