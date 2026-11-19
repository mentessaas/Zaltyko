import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

import { SuperAdminElementReview } from "../components/SuperAdminElementReview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Biblioteca | Super admin",
  robots: { index: false, follow: false },
};

export default async function SuperAdminElementLibraryPage() {
  // El layout ya redirige, pero una página no debe depender de eso; la API
  // vuelve a comprobarlo con withSuperAdmin.
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const profile = await getCurrentProfile(user.id);
  if (!profile || profile.role !== "super_admin" || profile.isSuspended) redirect("/owner");

  return <SuperAdminElementReview />;
}
