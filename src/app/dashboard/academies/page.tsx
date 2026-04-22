import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, count, sql } from "drizzle-orm";
import { Plus, Users, UserCheck, UserPlus, UserCog, Calendar, Building2 } from "lucide-react";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { academies, memberships, athletes, coaches, events } from "@/db/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/ui/stats-card";
import { PageHeader } from "@/components/ui/page-header";
import { BarChart } from "@/components/ui/chart";
import { formatAcademyType } from "@/lib/formatters";

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

  let currentProfile;
  try {
    currentProfile = await getCurrentProfile(user.id);
  } catch (error) {
    console.error("Error getting profile:", error);
    // If database error, try to redirect to onboarding to create profile
    redirect("/onboarding/owner");
  }

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

  // Sort academies by activity (academies with more athletes first)
  const sortedAcademies = [...academiesWithStats].sort((a, b) => {
    return b.stats.totalAthletes - a.stats.totalAthletes;
  });
  const primaryAcademyId = currentProfile.activeAcademyId ?? sortedAcademies[0]?.id ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Academias" },
        ]}
        title="Dashboard"
        description="Vista rápida de todas tus academias. Cambia rápidamente entre ellas y accede al panel operativo."
        icon={<Building2 className="h-5 w-5" strokeWidth={1.5} />}
        actions={
          hasAcademies ? (
            <Button asChild>
              <Link href="/onboarding/owner">
                <Plus className="h-4 w-4 mr-2" />
                Nueva academia
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stats Overview */}
      {hasAcademies && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatsCard
            title="Total Atletas"
            value={totals.athletes}
            icon={<Users className="h-6 w-6" strokeWidth={1.5} />}
            variant="default"
          />
          <StatsCard
            title="Activos"
            value={totals.active}
            icon={<UserCheck className="h-6 w-6" strokeWidth={1.5} />}
            variant="success"
          />
          <StatsCard
            title="En Prueba"
            value={totals.trials}
            icon={<UserPlus className="h-6 w-6" strokeWidth={1.5} />}
            variant="warning"
          />
          <StatsCard
            title="Entrenadores"
            value={totals.coaches}
            icon={<UserCog className="h-6 w-6" strokeWidth={1.5} />}
            variant="info"
          />
          <StatsCard
            title="Eventos Próximos"
            value={totals.events}
            icon={<Calendar className="h-6 w-6" strokeWidth={1.5} />}
            variant="danger"
          />
        </div>
      )}

      {/* Chart Section */}
      {hasAcademies && academiesWithStats.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Atletas por Academia</CardTitle>
              <CardDescription>Distribución de atletas en tus academias</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart
                data={academiesWithStats.map(a => ({
                  label: a.name?.substring(0, 12) || "Sin nombre",
                  value: a.stats.totalAthletes,
                }))}
                height={180}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      {hasAcademies && (
        <div className="flex flex-wrap gap-3">
          {primaryAcademyId ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/app/${primaryAcademyId}/athletes`}>Ver atletas</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/${primaryAcademyId}/coaches`}>Ver entrenadores</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/${primaryAcademyId}/events`}>Ver eventos</Link>
              </Button>
            </>
          ) : null}
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
            <Link href="/onboarding/owner">Crear academia</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sortedAcademies.map((academy) => {
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
                    <div className="flex items-center gap-2">
                      {academy.isTrialActive && (
                        <Badge variant="pending">Trial</Badge>
                      )}
                      {isActive && <Badge variant="success">Activa</Badge>}
                    </div>
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
                  {/* Active athletes indicator */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Activos</span>
                      <span className="font-medium">
                        {academy.stats.totalAthletes > 0
                          ? Math.round((academy.stats.activeAthletes / academy.stats.totalAthletes) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{
                          width: `${
                            academy.stats.totalAthletes > 0
                              ? (academy.stats.activeAthletes / academy.stats.totalAthletes) * 100
                              : 0
                          }%`,
                        }}
                      />
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
