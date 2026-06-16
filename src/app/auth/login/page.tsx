import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import LoginForm from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu cuenta para gestionar tu academia",
  openGraph: {
    title: "Iniciar sesión",
    description: "Accede a tu cuenta de Zaltyko",
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
    const home = await resolveUserHome({
      userId: user.id,
      email: user.email,
    });
    redirect(home.redirectUrl);
  }

  return <LoginForm />;
}
