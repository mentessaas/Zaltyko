import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { academies, memberships } from "@/db/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function formatAcademyType(value: string | null) {
  switch (value) {
    case "artistica":
      return "Gimnasia artística";
    case "ritmica":
      return "Gimnasia rítmica";
    case "trampolin":
      return "Trampolín";
    case "general":
      return "General / Mixta";
    default:
      return "Sin tipo definido";
  }
}

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AcademiesPage() {
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

  let academyMemberships;

  try {
    academyMemberships = await db
      .select({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
        createdAt: academies.createdAt,
        isTrialActive: academies.isTrialActive,
        trialEndsAt: academies.trialEndsAt,
      })
      .from(memberships)
      .innerJoin(academies, eq(memberships.academyId, academies.id))
      .where(eq(memberships.userId, currentProfile.userId))
      .orderBy(academies.name);
  } catch (error: any) {
    console.error("dashboard/academies memberships query error", error);
    throw error;
  }

  const hasAcademies = academyMemberships.length > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-zaltyko-primary uppercase tracking-wide">Academias</p>
        <h1 className="text-3xl font-bold text-zaltyko-neutral-dark">Gestiona todas tus academias</h1>
        <p className="text-muted-foreground">
          Cambia rápidamente entre academias, revisa su estado de prueba y entra al panel operativo en un clic.
        </p>
      </header>

      {!hasAcademies ? (
        <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-zaltyko-neutral-dark">Todavía no tienes academias asignadas.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea tu primera academia desde el onboarding o invita a tu equipo para comenzar.
          </p>
          <Button asChild className="mt-6">
            <Link href="/onboarding">Crear academia</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {academyMemberships.map((academy) => {
            const isActive = currentProfile.activeAcademyId === academy.id;
            const trialBadge =
              academy.isTrialActive && academy.trialEndsAt
                ? `Trial activo · Termina ${formatDate(academy.trialEndsAt)}`
                : null;

            return (
              <Card key={academy.id} className="flex h-full flex-col border border-zaltyko-neutral/20 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-xl font-semibold">{academy.name ?? "Sin nombre"}</CardTitle>
                    {isActive && <Badge variant="active">Academia activa</Badge>}
                  </div>
                  <CardDescription>{formatAcademyType(academy.academyType)}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
                  <p>
                    <span className="font-semibold text-zaltyko-neutral-dark">Creada:</span>{" "}
                    {formatDate(academy.createdAt)}
                  </p>
                  {trialBadge && (
                    <p className="text-amber-600 font-medium flex items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                      {trialBadge}
                    </p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button asChild variant={isActive ? "default" : "secondary"} className="w-full">
                    <Link href={`/app/${academy.id}/dashboard`}>Entrar al panel</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


