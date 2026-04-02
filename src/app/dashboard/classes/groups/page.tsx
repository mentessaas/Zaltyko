import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Users, Plus, Settings } from "lucide-react";

import { db } from "@/db";
import { academies, groups, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default async function ClassesGroupsPage() {
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

  if (userAcademies.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Grupos no disponibles</h1>
        <p className="text-muted-foreground">
          No tienes acceso a ninguna academia para gestionar grupos.
        </p>
      </div>
    );
  }

  // Obtener grupos de la primera academia
  const academyGroups = await db
    .select({
      id: groups.id,
      name: groups.name,
      color: groups.color,
    })
    .from(groups)
    .where(eq(groups.academyId, userAcademies[0].id))
    .orderBy(asc(groups.name));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clases", href: "/dashboard/classes" },
          { label: "Grupos" },
        ]}
        title="Grupos de clases"
        description="Organiza tus atletas en grupos para facilitar la gestión de clases."
        icon={<Users className="h-5 w-5" strokeWidth={1.5} />}
        actions={
          <Button asChild>
            <Link href="/dashboard/groups/new">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo grupo
            </Link>
          </Button>
        }
      />

      {/* Selector de academia */}
      {userAcademies.length > 1 && (
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-muted-foreground">
            Academia:
          </label>
          <select
            defaultValue={userAcademies[0].id}
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

      {/* Lista de grupos */}
      {academyGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            No hay grupos creados en esta academia.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/dashboard/groups/new">
              <Plus className="mr-2 h-4 w-4" />
              Crear primer grupo
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {academyGroups.map((group) => (
            <div
              key={group.id}
              className="rounded-lg border bg-card p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {group.color && (
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  <div>
                    <h3 className="font-semibold">{group.name}</h3>
                  </div>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/dashboard/groups/${group.id}`}>
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href={`/dashboard/classes?group=${group.id}`}>
                    Ver clases
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href={`/dashboard/athletes?group=${group.id}`}>
                    Ver atletas
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
