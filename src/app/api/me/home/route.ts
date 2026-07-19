import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHENTICATED", "No autenticado", 401);
  }

  const home = await resolveUserHome({
    userId: user.id,
    email: user.email,
  });

  return apiSuccess(home);
}
