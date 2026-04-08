import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  return apiSuccess({ authenticated: Boolean(user) });
}
