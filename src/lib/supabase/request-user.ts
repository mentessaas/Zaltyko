// Resuelve el usuario autenticado tanto para clientes con cookies (web)
// como para clientes que mandan Authorization: Bearer <jwt> (app móvil).
// Útil en rutas que hoy solo llaman a auth.getUser() vía cookies y por
// tanto rechazan al cliente móvil con 401.

import { cookies } from "next/headers";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";

export interface RequestUser {
  id: string;
  email: string | null;
}

export async function getAuthenticatedRequestUser(request: Request): Promise<RequestUser | null> {
  const cookieStore = await cookies();
  const supabase = await createSupabaseServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return { id: user.id, email: user.email ?? null };
  }

  const token = getBearerToken(request);
  if (!token) return null;

  const bearerSupabase = createBearerSupabaseClient(token);
  const { data: bearerData, error } = await bearerSupabase.auth.getUser(token);
  if (error || !bearerData.user) return null;

  return { id: bearerData.user.id, email: bearerData.user.email ?? null };
}
