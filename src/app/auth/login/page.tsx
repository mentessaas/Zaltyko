import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import LoginForm from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu cuenta para gestionar tu academia",
  alternates: {
    canonical: `${getPublicSiteUrl()}/auth/login`,
  },
  openGraph: {
    title: "Iniciar sesión",
    description: "Accede a tu cuenta de Zaltyko",
    url: `${getPublicSiteUrl()}/auth/login`,
    type: "website",
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
    const home = await resolveUserEntry(user);
    redirect(home.redirectUrl);
  }

  return <LoginForm />;
}
