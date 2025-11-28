import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { academies, memberships } from "@/db/schema";
import { EventForm } from "@/components/events/EventForm";

export default async function NewEventPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const currentProfile = await getCurrentProfile(user.id);

  if (!currentProfile) {
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
    .where(eq(memberships.userId, currentProfile.userId));

  if (userAcademies.length === 0) {
    redirect("/dashboard/events");
  }

  // Usar la primera academia por defecto (o la activa si existe)
  const defaultAcademy = userAcademies.find(a => a.id === currentProfile.activeAcademyId) || userAcademies[0];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-zaltyko-primary uppercase tracking-wide">Eventos</p>
        <h1 className="text-3xl font-bold text-zaltyko-neutral-dark">Crear nuevo evento</h1>
        <p className="text-muted-foreground">
          Crea un nuevo evento o competencia para tu academia.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <EventForm academyId={defaultAcademy.id} />
      </div>
    </div>
  );
}

