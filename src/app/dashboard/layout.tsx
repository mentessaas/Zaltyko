import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { GlobalTopNav } from "@/components/navigation/GlobalTopNav";
import { RealtimeNotificationsProvider } from "@/components/providers/RealtimeNotificationsProvider";
import { AutoBreadcrumb } from "@/components/navigation/AutoBreadcrumb";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  let profile;
  try {
    const result = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        name: profiles.name,
        role: profiles.role,
        tenantId: profiles.tenantId,
      })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    
    profile = result[0];
  } catch (error: any) {
    console.error("dashboard/layout profile query error", error);
    // Si el error es claramente de configuración de base de datos, mostrar mensaje específico
    if (
      error?.message?.includes("DATABASE_URL") ||
      error?.code === "ECONNREFUSED"
    ) {
      return (
        <div className="min-h-screen bg-zaltyko-neutral-light flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 space-y-4">
            <h1 className="text-2xl font-bold text-red-600">Error de Configuración</h1>
            <p className="text-gray-700">
              La aplicación necesita una conexión a la base de datos para funcionar.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
              <p className="text-sm font-semibold text-yellow-800 mb-2">Para solucionarlo:</p>
              <ol className="text-sm text-yellow-700 list-decimal list-inside space-y-1">
                <li>
                  Crea un archivo <code className="bg-yellow-100 px-1 rounded">.env.local</code> en la raíz del
                  proyecto (si aún no existe)
                </li>
                <li>
                  Asegúrate de que exista una variable{" "}
                  <code className="bg-yellow-100 px-1 rounded">DATABASE_URL</code> o{" "}
                  <code className="bg-yellow-100 px-1 rounded">DATABASE_URL_DIRECT</code> con una URL válida de
                  PostgreSQL
                </li>
                <li>Reinicia el servidor de desarrollo</li>
              </ol>
            </div>
            <p className="text-xs text-gray-500">
              Error: {error?.message || "No se pudo conectar a la base de datos"}
            </p>
          </div>
        </div>
      );
    }
    // Para otros errores, mantener la excepción original
    throw error;
  }

  if (!profile) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-zaltyko-neutral-light transition-all duration-300">
      <GlobalTopNav
        userRole={profile.role}
        userName={profile.name}
        userEmail={user.email ?? null}
        profileId={profile.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-4 transition-all duration-300 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <RealtimeNotificationsProvider userId={profile.userId} tenantId={profile.tenantId} />
        <AutoBreadcrumb />
        {children}
      </main>
    </div>
  );
}

