import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Shield } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getCurrentProfile } from "@/lib/authz";

interface ViewUserPageProps {
  params: Promise<{ profileId: string }>;
}

export default async function ViewUserPage({ params }: ViewUserPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Verify current user is Super Admin
  const currentProfile = await getCurrentProfile(user.id);
  if (!currentProfile || currentProfile.role !== "super_admin") {
    redirect("/dashboard");
  }

  const { profileId } = await params;

  // Get the target user's profile
  const [targetProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!targetProfile) {
    redirect("/super-admin/users");
  }

  // Redirigir al perfil específico con el profileId en la URL
  redirect(`/dashboard/profile/${profileId}`);
}

