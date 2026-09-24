import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { logger } from "@/lib/logger";

// UUID v4 regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_SHAPE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERNAL_AUTH_HEADER = "x-internal-auth-secret";

// A dashboard render can fan out into several API requests at once. Reusing
// the same verified Supabase lookup briefly prevents a burst of identical
// `/auth/v1/user` calls from exhausting the provider rate limit. The cache key
// is the complete auth cookie value, the TTL is intentionally short, and
// failed lookups are never retained.
const AUTH_USER_CACHE_TTL_MS = 2_000;
const AUTH_USER_CACHE_MAX_ENTRIES = 256;
const verifiedAuthUserCache = new Map<
  string,
  { expiresAt: number; promise: Promise<string | null> }
>();

/**
 * Obtiene el userId desde la sesión autenticada.
 * Los headers/params de identidad solo se aceptan en llamadas internas firmadas.
 */
export async function resolveUserId(
  request: Request,
  context?: { params?: Record<string, string> }
): Promise<string | null> {
  const isInternal = isTrustedInternalRequest(request);
  // Comparación en tiempo constante para el secreto interno (evita side-channel)
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
    const authCookieKey = getAuthCookieKey(cookieStore);
    const getVerifiedUserId = authCookieKey
      ? getCachedVerifiedUserId(authCookieKey, cookieStore)
      : fetchVerifiedUserId(cookieStore);
    const verifiedUserId = await getVerifiedUserId;

    if (verifiedUserId) return verifiedUserId;

    // Local QA uses the same guarded dev-session cookie as academy layouts.
    // The helper is a no-op outside development and requires explicit opt-in.
    const devSession = await getDevSessionFromCookieStore(cookieStore);
    if (devSession?.userId && UUID_SHAPE_REGEX.test(devSession.userId)) {
      return devSession.userId;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      logger.warn("Failed to get user from Supabase", { error });
    }
  }

  return null;
}

function getAuthCookieKey(cookieStore: Awaited<ReturnType<typeof cookies>>): string | null {
  const authCookies = cookieStore
    .getAll()
    .filter(({ name }) => /-auth-token(?:\.|$)/.test(name))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (authCookies.length === 0) return null;
  return authCookies.map(({ name, value }) => `${name}=${value}`).join("|");
}

function getCachedVerifiedUserId(
  cacheKey: string,
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<string | null> {
  const now = Date.now();
  const cached = verifiedAuthUserCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.promise;
  if (cached) verifiedAuthUserCache.delete(cacheKey);

  const promise = fetchVerifiedUserId(cookieStore);
  verifiedAuthUserCache.set(cacheKey, {
    expiresAt: now + AUTH_USER_CACHE_TTL_MS,
    promise,
  });

  if (verifiedAuthUserCache.size > AUTH_USER_CACHE_MAX_ENTRIES) {
    for (const [key, entry] of verifiedAuthUserCache) {
      if (entry.expiresAt <= now || key === cacheKey) {
        verifiedAuthUserCache.delete(key);
      }
      if (verifiedAuthUserCache.size <= AUTH_USER_CACHE_MAX_ENTRIES) break;
    }
  }

  void promise.catch(() => {
    if (verifiedAuthUserCache.get(cacheKey)?.promise === promise) {
      verifiedAuthUserCache.delete(cacheKey);
    }
  });

  return promise;
}

async function fetchVerifiedUserId(cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<string | null> {
  const supabase = await createSupabaseServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function isTrustedInternalRequest(request: Request): boolean {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret) return false;
  const provided = request.headers.get(INTERNAL_AUTH_HEADER);
  if (!provided || provided.length !== secret.length) return false;
  // Comparación en tiempo constante: el header impersona a cualquier usuario.
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}
