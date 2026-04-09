import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { academies, memberships } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";

export default async function NewAnnouncementPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  let currentProfile;
  try {
    currentProfile = await getCurrentProfile(user.id);
  } catch (error) {
    console.error("Error getting profile:", error);
    redirect("/onboarding");
  }

  if (!currentProfile) {
    redirect("/dashboard");
  }

  // Obtener academias donde el usuario es owner
  const userAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(
      and(
        eq(memberships.userId, currentProfile.userId),
        eq(memberships.role, "owner")
      )
    );

  if (userAcademies.length === 0) {
    redirect("/dashboard/announcements");
  }

  // Si solo tiene una academia, redirigir directamente al formulario de esa academia
  // Si tiene varias, mostrar selector

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Anuncios", href: "/dashboard/announcements" },
          { label: "Nuevo" },
        ]}
        title="Nuevo anuncio"
        description="Selecciona una academia para crear un nuevo anuncio"
        icon={<ArrowLeft className="h-5 w-5" strokeWidth={1.5} />}
      />

      {userAcademies.length === 1 ? (
        <AnnouncementFormWrapper academyId={userAcademies[0].id} academyName={userAcademies[0].name} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {userAcademies.map((academy) => (
            <Card key={academy.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle>{academy.name}</CardTitle>
                <CardDescription>Anuncios para {academy.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <AnnouncementFormWrapper academyId={academy.id} academyName={academy.name} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementFormWrapper({ academyId, academyName }: { academyId: string; academyName: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-lg font-semibold mb-4">Crear anuncio para {academyName}</h3>
      <AnnouncementForm
        open={true}
        onClose={() => {}}
        academyId={academyId}
        onSuccess={() => {}}
      />
    </div>
  );
}