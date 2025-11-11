import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";

import { LoginForm } from "@/components/LoginForm/LoginForm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu cuenta para gestionar tu academia",
  openGraph: {
    title: "Iniciar sesión | GymnaSaaS",
    description: "Accede a tu cuenta de GymnaSaaS",
  },
};

export default async function Login() {
  // Si ya hay sesión, redirigir al panel adecuado en lugar de mostrar el login
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(profiles.userId.eq(user.id))
      .limit(1);

    if (profile) {
      if (profile.role === "super_admin") {
        redirect("/super-admin");
      }

      if (["admin", "owner"].includes(profile.role)) {
        redirect("/dashboard/users");
      }
    }
    redirect("/dashboard");
  }

  return <LoginForm />;
}
