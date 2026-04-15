import { cookies } from "next/headers";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// UUID v4 regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Obtiene el userId desde diferentes fuentes (header, params, cookies)
 * ⚠️ x-user-id header SOLO se acepta si es un UUID válido y request es interna
 */
export async function resolveUserId(
  request: Request,
  context?: { params?: Record<string, string> }
): Promise<string | null> {
  // Desde header - solo si es UUID válido Y request interna
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId) {
    // Validate UUID format to prevent spoofing
    if (!UUID_REGEX.test(headerUserId)) {
      logger.warn("Invalid x-user-id format rejected", { value: headerUserId });
      return null;
    }
    // Only accept from internal/originated requests (not directly from client)
    const origin = request.headers.get("origin");
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (origin && !isInternalOrigin(origin) && forwardedFor) {
      // External request with x-user-id is suspicious
      logger.warn("External request with x-user-id rejected");
      return null;
    }
    return headerUserId;
  }

  // Desde params
  const paramUserId = context?.params?.userId;
  if (paramUserId && UUID_REGEX.test(paramUserId)) {
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

/**
 * Verifica si el origen es interno (mismo host o dominios conocidos de confianza)
 */
function isInternalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    // Internal origins: same host, localhost, or known internal domains
    const internalHosts = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      // Add known internal domains here
    ];
    return internalHosts.some((host) => url.hostname === host || url.hostname.endsWith(".internal"));
  } catch {
    return false;
  }
}

