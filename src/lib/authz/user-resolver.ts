import { cookies } from "next/headers";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Obtiene el userId desde diferentes fuentes (header, params, cookies)
 */
export async function resolveUserId(
  request: Request,
  context?: { params?: Record<string, string> }
): Promise<string | null> {
  // Desde header
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId) {
    return headerUserId;
  }

  // Desde params
  const paramUserId = context?.params?.userId;
  if (paramUserId) {
    return paramUserId;
  }

  // Desde cookies (Supabase Auth)
  try {
    const cookieStore = cookies();
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

