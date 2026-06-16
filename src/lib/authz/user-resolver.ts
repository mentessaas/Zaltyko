import { cookies } from "next/headers";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// UUID v4 regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_AUTH_HEADER = "x-internal-auth-secret";

/**
 * Obtiene el userId desde la sesión autenticada.
 * Los headers/params de identidad solo se aceptan en llamadas internas firmadas.
 */
export async function resolveUserId(
  request: Request,
  context?: { params?: Record<string, string> }
): Promise<string | null> {
  const isInternal = isTrustedInternalRequest(request);
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId && isInternal && UUID_REGEX.test(headerUserId)) {
    return headerUserId;
  }
  if (headerUserId && !isInternal) {
    logger.warn("SECURITY: rejected untrusted x-user-id header");
  }

  const paramUserId = context?.params?.userId;
  if (paramUserId && isInternal && UUID_REGEX.test(paramUserId)) {
    return paramUserId;
  }

  // Desde cookies (Supabase Auth)
  try {
    const cookieStore = await cookies();
    const supabase = await createSupabaseServerClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      return user.id;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      logger.warn("Failed to get user from Supabase", { error });
    }
  }

  return null;
}

function isTrustedInternalRequest(request: Request): boolean {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret) return false;
  return request.headers.get(INTERNAL_AUTH_HEADER) === secret;
}
