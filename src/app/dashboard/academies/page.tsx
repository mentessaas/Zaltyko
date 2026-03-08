import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, count, sql } from "drizzle-orm";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { academies, memberships, athletes, coaches, events } from "@/db/schema";
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

async function getAcademyStats(academyId: string) {
  const now = new Date();

  const [athleteCount, activeAthletes, trialAthletes, coachCount, upcomingEvents] = await Promise.all([
    db.select({ count: count() }).from(athletes).where(eq(athletes.academyId, academyId)),
    db.select({ count: count() }).from(athletes).where(and(eq(athletes.academyId, academyId), eq(athletes.status, "active"))),
    db.select({ count: count() }).from(athletes).where(and(eq(athletes.academyId, academyId), eq(athletes.status, "trial"))),
    db.select({ count: count() }).from(coaches).where(eq(coaches.academyId, academyId)),
    db
      .select({ count: count() })
      .from(events)
      .where(and(eq(events.academyId, academyId), sql`${events.startDate} >= ${now}`)),
  ]);

  return {
    totalAthletes: athleteCount[0]?.count || 0,
    activeAthletes: activeAthletes[0]?.count || 0,
    trialAthletes: trialAthletes[0]?.count || 0,
    totalCoaches: coachCount[0]?.count || 0,
    upcomingEvents: upcomingEvents[0]?.count || 0,
    monthRevenue: 0,
  };
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

  // Get stats for each academy
  const academiesWithStats = hasAcademies
    ? await Promise.all(
        academyMemberships.map(async (academy) => ({
          ...academy,
          stats: await getAcademyStats(academy.id),
        }))
      )
    : [];

  // Calculate totals
  const totals = academiesWithStats.reduce(
    (acc, academy) => ({
      athletes: acc.athletes + academy.stats.totalAthletes,
      active: acc.active + academy.stats.activeAthletes,
      trials: acc.trials + academy.stats.trialAthletes,
      coaches: acc.coaches + academy.stats.totalCoaches,
      events: acc.events + academy.stats.upcomingEvents,
    }),
    { athletes: 0, active: 0, trials: 0, coaches: 0, events: 0 }
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-zaltyko-primary uppercase tracking-wide">Dashboard</p>
        <h1 className="text-3xl font-bold text-zaltyko-neutral-dark">Resumen general</h1>
        <p className="text-muted-foreground">
          Vista rápida de todas tus academias. Cambia rápidamente entre ellas y accede al panel operativo.
        </p>
      </header>

      {/* Stats Overview */}
      {hasAcademies && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium">Total Atletas</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals.athletes}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium">Activos</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals.active}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium">En Prueba</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals.trials}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium">Entrenadores</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals.coaches}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium">Eventos Próximos</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals.events}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      {hasAcademies && (
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/dashboard/athletes">Ver Atletas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/coaches">Ver Entrenadores</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/events">Ver Eventos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/sessions">Horarios</Link>
          </Button>
        </div>
      )}

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
          {academiesWithStats.map((academy) => {
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
                <CardContent className="flex-1 space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-lg font-bold">{academy.stats.totalAthletes}</p>
                      <p className="text-xs text-muted-foreground">Atletas</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-lg font-bold">{academy.stats.totalCoaches}</p>
                      <p className="text-xs text-muted-foreground">Coaches</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-lg font-bold">{academy.stats.upcomingEvents}</p>
                      <p className="text-xs text-muted-foreground">Eventos</p>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="font-semibold">Creada:</span> {formatDate(academy.createdAt)}
                    </p>
                    {trialBadge && (
                      <p className="text-amber-600 font-medium flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                        {trialBadge}
                      </p>
                    )}
                  </div>
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
