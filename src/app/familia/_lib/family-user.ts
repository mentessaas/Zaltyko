import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/** Signed-in account for a /familia page; anonymous visitors go to login. */
export async function requireFamilyUser(nextPath: string): Promise<{ id: string }> {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  return { id: user.id };
}
