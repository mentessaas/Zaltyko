import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Mail, Phone, Calendar, Award, Clock, User, Edit, Trash2 } from "lucide-react";

import { db } from "@/db";
import {
  academies,
  athletes,
  guardianAthletes,
  guardians,
  memberships,
  profiles,
  attendanceRecords,
  classSessions,
  classes,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import GuardianManager from "@/components/athletes/GuardianManager";
import AthleteEvaluationsTab from "@/components/assessments/AthleteEvaluationsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function isSuperAdmin(role: string | null): boolean {
  return role === "super_admin";
}

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
    // If profile has no tenantId but is an owner, allow access
    (profile.role === "owner" && !profile.tenantId) ||
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

  // Get attendance stats
  const attendanceStats = await db
    .select({
      total: attendanceRecords.id,
      present: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .where(eq(attendanceRecords.athleteId, athleteId))
    .limit(100);

  const totalSessions = attendanceStats.length;
  const presentSessions = attendanceStats.filter(a => a.present === "present").length;
  const attendanceRate = totalSessions > 0 ? Math.round((presentSessions / totalSessions) * 100) : 0;

  // Get recent sessions
  const recentSessions = await db
    .select({
      id: classSessions.id,
      date: classSessions.sessionDate,
      status: attendanceRecords.status,
      className: classes.name,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(attendanceRecords.athleteId, athleteId))
    .orderBy(desc(classSessions.sessionDate))
    .limit(5);

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-1">
          <Link href="/dashboard/athletes" className="text-sm text-muted-foreground hover:underline">
            ← Volver al listado
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold">{athleteRow.name}</h1>
            <Badge variant={athleteRow.status === "active" ? "active" : "outline"} className="capitalize">
              {athleteRow.status === "active" ? "Activo" : athleteRow.status === "trial" ? "Prueba" : "Inactivo"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {athleteRow.academyName ?? "Sin academia"} · {athleteRow.level ?? "Nivel no definido"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/athletes/${athleteId}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <p className="text-sm font-medium text-emerald-700">Edad</p>
          <p className="text-2xl md:text-3xl font-bold text-emerald-800">{age !== null ? `${age}` : "—"}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <p className="text-sm font-medium text-blue-700">Asistencia</p>
          <p className="text-2xl md:text-3xl font-bold text-blue-800">{attendanceRate}%</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
          <p className="text-sm font-medium text-red-700">Clases</p>
          <p className="text-2xl md:text-3xl font-bold text-red-800">{totalSessions}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <p className="text-sm font-medium text-amber-700">Nivel</p>
          <p className="text-2xl md:text-3xl font-bold text-amber-800">{athleteRow.level ?? "—"}</p>
        </div>
      </div>

      <Tabs defaultValue="datos" className="space-y-6">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="datos">Datos generales</TabsTrigger>
          <TabsTrigger value="evaluaciones">Evaluaciones</TabsTrigger>
          <TabsTrigger value="familia">Familia</TabsTrigger>
          <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Basic Info Card */}
            <div className="space-y-4 rounded-lg border bg-card p-4 md:p-6 shadow">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5" />
                Información básica
              </h2>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <p className="text-muted-foreground">Estado</p>
                  <p className="capitalize font-medium">{athleteRow.status}</p>
                </div>
                <div className="flex justify-between">
                  <p className="text-muted-foreground">Nivel</p>
                  <p>{athleteRow.level ?? "No definido"}</p>
                </div>
                <div className="flex justify-between">
                  <p className="text-muted-foreground">Edad</p>
                  <p>{age !== null ? `${age} años` : "—"}</p>
                </div>
                <div className="flex justify-between">
                  <p className="text-muted-foreground">Fecha de nacimiento</p>
                  <p>{athleteRow.dob ? new Date(athleteRow.dob).toLocaleDateString("es-ES") : "—"}</p>
                </div>
              </div>
            </div>

            {/* Academy Card */}
            <div className="space-y-4 rounded-lg border bg-card p-4 md:p-6 shadow">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Award className="h-5 w-5" />
                Academia
              </h2>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <p className="text-muted-foreground">Nombre</p>
                  <p className="font-medium">{athleteRow.academyName ?? "—"}</p>
                </div>
                <div className="flex justify-between">
                  <p className="text-muted-foreground">Fecha alta</p>
                  <p>{athleteRow.createdAt ? new Date(athleteRow.createdAt).toLocaleDateString("es-ES") : "—"}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                <Link href={`/app/${athleteRow.academyId}/dashboard`}>
                  Ver dashboard
                </Link>
              </Button>
            </div>

            {/* Quick Actions Card */}
            <div className="space-y-4 rounded-lg border bg-card p-4 md:p-6 shadow md:col-span-2 lg:col-span-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Acciones rápidas
              </h2>
              <div className="grid gap-2">
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href={`/dashboard/calendar?athlete=${athleteId}`}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Ver calendario
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar mensaje
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href={`/app/${athleteRow.academyId}/billing?athlete=${athleteId}`}>
                    <Award className="h-4 w-4 mr-2" />
                    Ver pagos
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="evaluaciones">
          <AthleteEvaluationsTab athleteId={athleteRow.id} athleteName={athleteRow.name} />
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

        <TabsContent value="asistencia">
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold">{totalSessions}</p>
                <p className="text-sm text-muted-foreground">Total clases</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{presentSessions}</p>
                <p className="text-sm text-muted-foreground">Asistencias</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold">{totalSessions - presentSessions}</p>
                <p className="text-sm text-muted-foreground">Faltas</p>
              </div>
            </div>

            {/* Recent Sessions */}
            <div className="rounded-lg border bg-card p-4 md:p-6 shadow">
              <h2 className="text-lg font-semibold mb-4">Últimas clases</h2>
              {recentSessions.length === 0 ? (
                <p className="text-muted-foreground">No hay registros de asistencia.</p>
              ) : (
                <div className="space-y-2">
                  {recentSessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{session.className}</p>
                          <p className="text-sm text-muted-foreground">
                            {session.date ? new Date(session.date).toLocaleDateString("es-ES") : "—"}
                          </p>
                        </div>
                      </div>
                      <Badge variant={session.status === "present" ? "active" : "outline"} className="capitalize">
                        {session.status === "present" ? "Presente" : session.status === "absent" ? "Ausente" : session.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


