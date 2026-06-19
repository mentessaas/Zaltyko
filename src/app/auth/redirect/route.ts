import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const home = await resolveUserHome({
    userId: user.id,
    email: user.email,
  });

  redirect(home.redirectUrl);
}
