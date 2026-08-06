import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";
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

  const home = await resolveUserEntry(user);

  redirect(home.redirectUrl);
}
