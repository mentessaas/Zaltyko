import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Calendar, Edit, Users, Clock, Settings } from "lucide-react";

import { db } from "@/db";
import {
  academies,
  classCoachAssignments,
  classEnrollments,
  classGroups,
  classSessions,
  classWeekdays,
  classes,
  coaches,
  groups,
  memberships,
  profiles,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EditClassDialog } from "@/components/classes/EditClassDialog";
import { EnrollmentManager } from "@/components/classes/EnrollmentManager";
import { AttendanceDialog } from "@/components/classes/AttendanceDialog";
import { CreateSessionDialog } from "@/components/classes/CreateSessionDialog";

interface EditClassPageProps {
  params: Promise<{ classId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

export default async function EditClassPage({ params, searchParams }: EditClassPageProps) {
  const { classId } = await params;
  const resolvedSearchParams = await searchParams;

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

  // Obtener la clase
  const [classRow] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!classRow) {
    notFound();
  }

  // Verificar acceso a la academia
  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, profile.id),
        eq(memberships.academyId, classRow.academyId)
      )
    )
    .limit(1);

  if (!membership && profile.role !== "super_admin") {
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

  const currentAcademy = userAcademies.find((a) => a.id === classRow.academyId);

  if (!currentAcademy) {
    redirect("/dashboard");
  }

  // Obtener weekdays de la clase
  const weekdays = await db
    .select({ weekday: classWeekdays.weekday })
    .from(classWeekdays)
    .where(eq(classWeekdays.classId, classId));

  // Obtener entrenadores asignados
  const coachAssignments = await db
    .select({
      coachId: classCoachAssignments.coachId,
      coachName: coaches.name,
      coachEmail: coaches.email,
    })
    .from(classCoachAssignments)
    .leftJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
    .where(eq(classCoachAssignments.classId, classId));

  // Obtener grupos asignados
  const groupAssignments = await db
    .select({
      groupId: classGroups.groupId,
      groupName: groups.name,
      groupColor: groups.color,
    })
    .from(classGroups)
    .leftJoin(groups, eq(classGroups.groupId, groups.id))
    .where(eq(classGroups.classId, classId));

  // Obtener sesiones próximas
  const upcomingSessions = await db
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      coachName: coaches.name,
    })
    .from(classSessions)
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(eq(classSessions.classId, classId))
    .orderBy(classSessions.sessionDate)
    .limit(10);

  // Obtener todos los entrenadores disponibles
  const availableCoaches = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
    })
    .from(coaches)
    .where(eq(coaches.academyId, currentAcademy.id))
    .orderBy(asc(coaches.name));

  // Obtener todos los grupos disponibles
  const availableGroups = await db
    .select({
      id: groups.id,
      name: groups.name,
      color: groups.color,
    })
    .from(groups)
    .where(eq(groups.academyId, currentAcademy.id))
    .orderBy(asc(groups.name));

  // Obtener inscripciones actuales
  const enrollments = await db
    .select({
      athleteId: classEnrollments.athleteId,
    })
    .from(classEnrollments)
    .where(eq(classEnrollments.classId, classId));

  const classData = {
    id: classRow.id,
    name: classRow.name,
    weekdays: weekdays.map((w) => w.weekday),
    startTime: classRow.startTime,
    endTime: classRow.endTime,
    capacity: classRow.capacity,
    isExtra: classRow.isExtra,
    autoGenerateSessions: classRow.autoGenerateSessions,
    autoGenerateFrequency: classRow.autoGenerateFrequency,
    autoGenerateDaysAhead: classRow.autoGenerateDaysAhead,
    allowsFreeTrial: classRow.allowsFreeTrial,
    waitingListEnabled: classRow.waitingListEnabled,
    cancellationHoursBefore: classRow.cancellationHoursBefore,
    cancellationPolicy: classRow.cancellationPolicy ?? "standard",
    createdAt: classRow.createdAt?.toISOString() ?? null,
    coaches: coachAssignments.map((c) => ({
      id: c.coachId,
      name: c.coachName ?? "Sin nombre",
      email: c.coachEmail,
    })),
    groups: groupAssignments.map((g) => ({
      id: g.groupId,
      name: g.groupName ?? "Sin nombre",
      color: g.groupColor,
    })),
    currentEnrollment: enrollments.length,
  };

  const formatSchedule = () => {
    const dayLabel =
      classData.weekdays.length > 0
        ? classData.weekdays.map((day) => WEEKDAY_LABELS[day] ?? `Día ${day}`).join(", ")
        : "Día variable";
    const time =
      classData.startTime && classData.endTime
        ? `${classData.startTime} – ${classData.endTime}`
        : classData.startTime
          ? `Desde ${classData.startTime}`
          : "Horario flexible";
    return `${dayLabel} · ${time}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clases", href: "/dashboard/classes" },
          { label: classRow.name },
        ]}
        title={classRow.name}
        description="Edita los detalles de la clase, gestiona entrenadores y sesiones."
        icon={<Calendar className="h-5 w-5" strokeWidth={1.5} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/classes?academy=${currentAcademy.id}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">
          {/* Info de la clase */}
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Clase</p>
                <h1 className="text-3xl font-semibold">{classData.name}</h1>
                <p className="text-sm text-muted-foreground">{formatSchedule()}</p>
                <p className="text-xs text-muted-foreground">
                  Capacidad objetivo: {classData.capacity ?? "No definida"}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {classData.coaches.length === 0 ? (
                    <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                      Sin entrenadores asignados
                    </span>
                  ) : (
                    classData.coaches.map((coach) => (
                      <span
                        key={coach.id}
                        className="rounded-full bg-primary/10 px-3 py-1 text-primary"
                      >
                        {coach.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <EditClassDialog
                classItem={classData}
                availableCoaches={availableCoaches}
                availableGroups={availableGroups}
                open={false}
                onClose={() => {}}
                onUpdated={() => {}}
                academyId={currentAcademy.id}
              />
            </div>

            {/* Opciones */}
            <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
              <div className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={classData.allowsFreeTrial} disabled className="rounded" />
                <span className="text-muted-foreground">Prueba gratis</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={classData.waitingListEnabled} disabled className="rounded" />
                <span className="text-muted-foreground">Lista de espera</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Política:</span>
                <span className="font-medium capitalize">{classData.cancellationPolicy}</span>
              </div>
            </div>
          </section>

          {/* Grupos vinculados */}
          {classData.groups.length > 0 && (
            <section className="rounded-lg border bg-card p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Users className="h-5 w-5" />
                Grupos vinculados
              </h2>
              <div className="flex flex-wrap gap-2">
                {classData.groups.map((group) => (
                  <span
                    key={group.id}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium"
                    style={
                      group.color
                        ? { borderColor: group.color, color: group.color }
                        : undefined
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: group.color ?? "currentColor" }}
                    />
                    {group.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Sesiones próximas */}
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Clock className="h-5 w-5" />
                Sesiones próximas
              </h2>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/calendar?class=${classId}`}>
                  Ver calendario
                </Link>
              </Button>
            </div>

            {upcomingSessions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No hay sesiones programadas. Genera sesiones para verlas aquí.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {upcomingSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <p className="font-medium">
                        {new Date(session.sessionDate + "T00:00:00").toLocaleDateString("es-ES", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.startTime && session.endTime
                          ? `${session.startTime} – ${session.endTime}`
                          : "Horario no definido"}
                        {session.coachName && ` · ${session.coachName}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={session.status === "cancelled" ? "error" : session.status === "completed" ? "success" : "outline"}>
                        {session.status === "scheduled" ? "Programada" : session.status === "cancelled" ? "Cancelada" : "Completada"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Accesos rápidos */}
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Settings className="h-5 w-5" />
              Acciones
            </h2>
            <div className="space-y-2">
              <EnrollmentManager
                classId={classId}
                className={classData.name}
                open={false}
                onClose={() => {}}
              />
            </div>
          </section>

          {/* Estadísticas */}
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Estadísticas</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Inscritos</p>
                <p className="text-2xl font-bold">{classData.currentEnrollment}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Capacidad</p>
                <p className="text-2xl font-bold">{classData.capacity ?? "∞"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ocupación</p>
                <p className="text-2xl font-bold">
                  {classData.capacity && classData.capacity > 0
                    ? `${Math.round((classData.currentEnrollment / classData.capacity) * 100)}%`
                    : "N/A"}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
