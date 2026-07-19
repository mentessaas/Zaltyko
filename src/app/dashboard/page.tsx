import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";

export default async function Dashboard() {
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
