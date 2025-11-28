import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import {
  academies,
  athletes,
  guardianAthletes,
  guardians,
  memberships,
  profiles,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import GuardianManager from "@/components/athletes/GuardianManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AthletePageProps {
  params: {
    athleteId: string;
  };
}

function calculateAge(dob: Date | null): number | null {
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export default async function AthleteDetailPage({ params }: AthletePageProps) {
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

  const athleteId = params.athleteId;

  const [athleteRow] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      academyId: athletes.academyId,
      academyName: academies.name,
      tenantId: athletes.tenantId,
      createdAt: athletes.createdAt,
    })
    .from(athletes)
    .innerJoin(academies, eq(athletes.academyId, academies.id))
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athleteRow) {
    notFound();
  }

  const membershipRows = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.academyId, athleteRow.academyId)))
    .limit(1);

  const canAccess =
    profile.role === "super_admin" ||
    profile.role === "admin" ||
    (profile.tenantId === athleteRow.tenantId && membershipRows.length > 0);

  if (!canAccess) {
    redirect("/dashboard/athletes");
  }

  const guardiansRows = await db
    .select({
      linkId: guardianAthletes.id,
      guardianId: guardians.id,
      name: guardians.name,
      email: guardians.email,
      phone: guardians.phone,
      relationship: guardians.relationship,
      notifyEmail: guardians.notifyEmail,
      notifySms: guardians.notifySms,
      isPrimary: guardianAthletes.isPrimary,
      linkRelationship: guardianAthletes.relationship,
      createdAt: guardians.createdAt,
    })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(eq(guardianAthletes.athleteId, athleteId))
    .orderBy(guardians.createdAt);

  const age = calculateAge(athleteRow.dob ? new Date(athleteRow.dob) : null);

  return (
    <div className="space-y-8 p-8">
      <div className="space-y-1">
        <Link href="/dashboard/athletes" className="text-sm text-muted-foreground hover:underline">
          ← Volver al listado
        </Link>
        <h1 className="text-3xl font-semibold">{athleteRow.name}</h1>
        <p className="text-muted-foreground">
          {athleteRow.academyName ?? "Sin academia"} · {athleteRow.level ?? "Nivel no definido"}
        </p>
      </div>

      <Tabs defaultValue="datos" className="space-y-6">
        <TabsList>
          <TabsTrigger value="datos">Datos generales</TabsTrigger>
          <TabsTrigger value="familia">Familia</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-lg border bg-card p-6 shadow">
              <h2 className="text-lg font-semibold">Ficha del atleta</h2>
              <div className="grid gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado</p>
                  <p className="capitalize">{athleteRow.status}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Nivel</p>
                  <p>{athleteRow.level ?? "No definido"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Edad</p>
                  <p>{age !== null ? `${age} años` : "Sin fecha de nacimiento"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Fecha alta</p>
                  <p>{athleteRow.createdAt ? new Date(athleteRow.createdAt).toLocaleDateString("es-ES") : "N/A"}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 rounded-lg border bg-card p-6 shadow">
              <h2 className="text-lg font-semibold">Notas rápidas</h2>
              <p className="text-sm text-muted-foreground">
                Próximamente podrás registrar evaluaciones y badges FIG. Mientras tanto, mantiene la
                información clave actualizada desde este panel.
              </p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                <li>Integrar evaluaciones y progreso en la Fase 3.</li>
                <li>Resaltar eventos próximos y alertas de asistencia.</li>
              </ul>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="familia">
          <GuardianManager
            athleteId={athleteRow.id}
            academyId={athleteRow.academyId}
            initialGuardians={guardiansRows.map((guardian) => ({
              linkId: guardian.linkId,
              guardianId: guardian.guardianId,
              name: guardian.name,
              email: guardian.email ?? "",
              phone: guardian.phone ?? "",
              relationship: guardian.linkRelationship ?? guardian.relationship ?? "",
              isPrimary: guardian.isPrimary,
              notifyEmail: guardian.notifyEmail,
              notifySms: guardian.notifySms,
            }))}
          />
        </TabsContent>

        <TabsContent value="historial">
          <div className="rounded-lg border bg-card p-6 shadow">
            <h2 className="text-lg font-semibold">Historial en construcción</h2>
            <p className="text-sm text-muted-foreground">
              En fases siguientes integraremos evaluaciones FIG, progresos de habilidades y logros
              gamificados para este atleta.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


