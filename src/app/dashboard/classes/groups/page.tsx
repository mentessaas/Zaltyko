import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveAcademyWorkspaceUrl } from "@/lib/auth/academy-workspace";

export default async function ClassesGroupsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const targetUrl = await resolveAcademyWorkspaceUrl({
    userId: user.id,
    email: user.email,
    suffix: "groups",
    fallbackPath: "/dashboard/academies",
  });

  redirect(targetUrl);
}
