import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Calendar, Users, Plus } from "lucide-react";

import { db } from "@/db";
import { academies, coaches, groups, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { ClassesDashboard } from "@/components/classes/ClassesDashboard";
import { ClassesViewSwitcher } from "@/components/classes/ClassesViewSwitcher";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

interface ClassesPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function ClassesPage({ searchParams }: ClassesPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  let tenantId = profile.tenantId;

  // If no tenantId, try to get from user's academies via memberships
  if (!tenantId) {
    try {
      const userAcademies = await db
        .select({
          tenantId: academies.tenantId,
        })
        .from(memberships)
        .innerJoin(academies, eq(memberships.academyId, academies.id))
        .where(eq(memberships.userId, profile.id))
        .limit(1);

      if (userAcademies.length > 0) {
        tenantId = userAcademies[0].tenantId;
      }
    } catch (error) {
      console.error("Error getting tenant from academies:", error);
    }
  }

  if (!tenantId && profile.role !== "super_admin") {
    redirect("/dashboard");
  }

  // Obtener academias del usuario
  const userAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, user.id))
    .orderBy(asc(academies.name));

  // Usar la academia del filtro o la primera disponible
  const academyParam =
    typeof searchParams.academy === "string" && searchParams.academy !== ""
      ? searchParams.academy
      : undefined;

  const currentAcademy = academyParam
    ? userAcademies.find((a) => a.id === academyParam)
    : userAcademies[0];

  if (!currentAcademy) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Clases no disponibles</h1>
        <p className="text-muted-foreground">
          No tienes acceso a ninguna academia para gestionar clases.
        </p>
      </div>
    );
  }

  // Obtener entrenadores disponibles para la academia
  const availableCoaches = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
    })
    .from(coaches)
    .where(eq(coaches.academyId, currentAcademy.id))
    .orderBy(asc(coaches.name));

  // Obtener grupos disponibles
  const groupOptions = await db
    .select({
      id: groups.id,
      name: groups.name,
      color: groups.color,
    })
    .from(groups)
    .where(eq(groups.academyId, currentAcademy.id))
    .orderBy(asc(groups.name));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clases" },
        ]}
        title="Clases"
        description="Gestiona las clases, horarios y sesiones de entrenamiento."
        icon={<Calendar className="h-5 w-5" strokeWidth={1.5} />}
      />

      {/* Selector de academia */}
      {userAcademies.length > 1 && (
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-muted-foreground">
            Academia:
          </label>
          <select
            defaultValue={currentAcademy.id}
            onChange={(e) => {
              const params = new URLSearchParams();
              params.set("academy", e.target.value);
              window.location.href = `/dashboard/classes?${params.toString()}`;
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          >
            {userAcademies.map((academy) => (
              <option key={academy.id} value={academy.id}>
                {academy.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Dashboard de clases */}
      <ClassesDashboard
        academyId={currentAcademy.id}
        availableCoaches={availableCoaches}
        groupOptions={groupOptions}
      />
    </div>
  );
}
