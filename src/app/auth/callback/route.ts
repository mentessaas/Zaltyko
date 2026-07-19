import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSafeAuthNextPath } from "@/lib/auth/safe-next-path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeAuthNextPath(searchParams.get("next"));

  if (code) {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      redirect(next);
    }
  }

  redirect("/auth/login?error=callback_failed");
}
