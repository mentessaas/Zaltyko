import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { RealtimeNotificationsProvider } from "@/components/providers/RealtimeNotificationsProvider";
import { logger } from "@/lib/logger";
import { DashboardSkipLink } from "@/components/dashboard/DashboardSkipLink";
import { ChatWidgetWrapper } from "@/components/chat/ChatWidgetWrapper";
import { GlobalTopNav } from "@/components/navigation/GlobalTopNav";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Gestiona tu academia de deportes",
};

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
    // Use raw query to avoid drizzle-orm type conflicts
    const result = await db.execute(sql`
      SELECT id, user_id, name, role, tenant_id
      FROM profiles
      WHERE user_id = ${user.id}
      LIMIT 1
    `);

    profile = result.rows[0] as {
      id: string;
      userId: string;
      name: string | null;
      role: string | null;
      tenantId: string;
    } | undefined;
  } catch (error: any) {
    logger.error("Dashboard layout: Profile query error", error, { userId: user.id });
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
    // Para otros errores, redirigir al login en lugar de mostrar error
    redirect("/auth/login");
  }

  if (!profile) {
    redirect("/auth/login");
  }

  const tenantAcademies = profile.tenantId
    ? await db
        .select({ id: academies.id, name: academies.name })
        .from(academies)
        .where(eq(academies.tenantId, profile.tenantId))
    : [];

  const canCreateAcademies =
    profile.role === "owner" || profile.role === "admin" || profile.role === "super_admin";

  return (
    <div className="min-h-screen bg-muted/10">
      <DashboardSkipLink />
      <GlobalTopNav
        userRole={profile.role}
        userName={profile.name}
        userEmail={user.email ?? null}
        profileId={profile.id}
        tenantAcademies={tenantAcademies}
        canCreateAcademies={canCreateAcademies}
      />
      <div className="flex">
        <Sidebar
          user={{
            name: profile.name || "Usuario",
            email: user.email || "",
            role: profile.role || "owner",
          }}
        />
        <main id="main-content" className="min-w-0 flex-1" tabIndex={-1}>
          <div className="mx-auto max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-6 sm:pb-24 lg:px-8 lg:py-8 lg:pb-8">
            <RealtimeNotificationsProvider userId={profile.userId} tenantId={profile.tenantId} />
            <ChatWidgetWrapper />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
