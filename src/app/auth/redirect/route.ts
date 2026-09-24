import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Google signup carries the selected open-registration role in `next`.
  // `resolveUserEntry` validates it and only applies it when no profile exists;
  // privileged roles can never be injected through this query parameter.
  const home = await resolveUserEntry(user, searchParams.get("initial_role"));

  redirect(home.redirectUrl);
}
