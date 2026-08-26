import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import LoginForm from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";
<<<<<<< HEAD
import { logger } from "@/lib/logger";
=======
>>>>>>> origin/main
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
<<<<<<< HEAD
  // Si ya hay sesión, redirigir al panel adecuado en lugar de mostrar el login.
  // Sin env de Supabase configurado o con el servicio caído, se muestra el
  // formulario en lugar de un 500 (la sesión simplemente no se puede resolver).
  // Nota: redirect() lanza internamente, por eso sale del try antes del catch.
  let sessionUser: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    sessionUser = await getSessionUser();
  } catch (error) {
    logger.error("No se pudo resolver la sesión en /auth/login:", error);
  }

  if (sessionUser) {
    const home = await resolveUserEntry(sessionUser);
    redirect(home.redirectUrl);
  }

  return <LoginForm />;
}

async function getSessionUser() {
=======
  // Si ya hay sesión, redirigir al panel adecuado en lugar de mostrar el login
>>>>>>> origin/main
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
<<<<<<< HEAD
  return user ?? null;
=======

  if (user) {
    const home = await resolveUserEntry(user);
    redirect(home.redirectUrl);
  }

  return <LoginForm />;
>>>>>>> origin/main
}
