import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export default async function Dashboard() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/auth/login");
  }

  // Check if user can login (for athletes and other roles that might be restricted)
  if (!profile.canLogin && profile.role !== "super_admin") {
    redirect("/auth/login?error=access_disabled");
  }

  // Redirigir a la página de academias (dashboard principal)
  // "Inicio" lleva aquí, "Mi perfil" lleva a /dashboard/profile
  redirect("/dashboard/academies");
}
