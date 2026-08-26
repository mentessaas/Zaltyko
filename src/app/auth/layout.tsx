import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
<<<<<<< HEAD
import { logger } from "@/lib/logger";
=======
>>>>>>> origin/main

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
<<<<<<< HEAD
  // Sin env de Supabase configurado o con el servicio caído, se renderizan los
  // hijos (formularios de auth) en lugar de un 500. redirect() lanza
  // internamente, por eso se resuelve el usuario en un helper fuera del try.
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/auth/redirect");
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error; // NEXT_REDIRECT: dejarlo pasar
    }
    logger.error("No se pudo resolver la sesión en el layout de /auth:", error);
=======
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/auth/redirect");
>>>>>>> origin/main
  }

  return <>{children}</>;
}
