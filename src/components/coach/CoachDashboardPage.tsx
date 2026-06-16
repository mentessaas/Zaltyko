"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Calendar,
  ClipboardList,
  TrendingUp,
  Clock,
  ChevronRight,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface CoachAthlete {
  id: string;
  name: string;
  level: string | null;
  ageCategory: string | null;
  competitiveLevel: string | null;
  groupName: string | null;
  groupColor: string | null;
}

interface CoachClass {
  id: string;
  name: string;
  weekday: number | null;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  groupColor: string | null;
  athleteCount: number;
  technicalFocus: string | null;
  apparatus: string[];
}

interface TodaySession {
  id: string;
  classId: string;
  className: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  groupColor: string | null;
  technicalFocus: string | null;
  apparatus: string[];
  status: string;
}

interface RecentAssessment {
  id: string;
  athleteId: string;
  athleteName: string;
  apparatus: string | null;
  assessmentDate: string;
  totalScore: number | null;
}

interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  excused: number;
}

interface CoachDashboardPageProps {
  academyId: string;
  academyName: string | null;
  academyCountry: string | null;
  profileName: string | null;
  profilePhotoUrl: string | null;
  coachId: string;
  athletes: CoachAthlete[];
  classes: CoachClass[];
  todaySessions: TodaySession[];
  attendanceStats: AttendanceStats;
  recentAssessments: RecentAssessment[];
}

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatTime(time: string | null): string {
  if (!time) return "--:--";
  return time.substring(0, 5);
}

export function CoachDashboardPage({
  academyId,
  academyName,
  academyCountry,
  profileName,
  profilePhotoUrl,
  coachId,
  athletes,
  classes,
  todaySessions,
  attendanceStats,
  recentAssessments,
}: CoachDashboardPageProps) {
  const router = useRouter();
  const { specialization } = useAcademyContext();
  const attendancePercent =
    attendanceStats.total > 0
      ? Math.round((attendanceStats.present / attendanceStats.total) * 100)
      : 0;
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground lg:text-3xl">
            {academyName ?? "Academia"} · Panel de {specialization.labels.coachLabel}
          </h1>
          <p className="text-sm text-muted-foreground">
            Hola {profileName ?? specialization.labels.coachLabel.toLowerCase()}, bienvenido a tu panel personal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/app/${academyId}/attendance`)}
            className="gap-2"
          >
            <UserCheck className="h-4 w-4" />
            Pasar lista
          </Button>
          <Button
            size="sm"
            onClick={() => router.push(`/app/${academyId}/assessments`)}
            className="gap-2"
          >
            <ClipboardList className="h-4 w-4" />
            Nueva evaluación
          </Button>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title={specialization.labels.athletesPlural}
          value={athletes.length}
          subtitle="En tus clases"
          href={`/app/${academyId}/athletes`}
          icon={Users}
          accent="zaltyko-primary"
        />
        <DashboardCard
          title="Clases"
          value={classes.length}
          subtitle="Asignadas"
          href={`/app/${academyId}/classes`}
          icon={Calendar}
          accent="sky"
        />
        <DashboardCard
          title="Sesiones hoy"
          value={todaySessions.length}
          subtitle="Programadas"
          href={`/app/${academyId}/classes?date=today`}
          icon={Clock}
          accent="emerald"
        />
        <DashboardCard
          title="Asistencia"
          value={`${attendancePercent}%`}
          subtitle="Últimos 7 días"
          href={`/app/${academyId}/attendance`}
          icon={TrendingUp}
          accent="amber"
        />
      </section>

      {/* Clases de hoy */}
      {todaySessions.length > 0 && (
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Clases de hoy</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/app/${academyId}/classes?date=today`)}
              className="gap-1"
            >
              Ver todas <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="divide-y">
            {todaySessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  {session.groupColor && (
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: session.groupColor }}
                    />
                  )}
                  <div>
                    <p className="font-medium">{session.className}</p>
                    <p className="text-sm text-muted-foreground">
                      {session.groupName && `${session.groupName} · `}
                      {formatTime(session.startTime)} - {formatTime(session.endTime)}
                    </p>
                    {(session.technicalFocus || session.apparatus.length > 0) && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {session.technicalFocus && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {session.technicalFocus}
                          </span>
                        )}
                        {session.apparatus.slice(0, 2).map((apparatus) => (
                          <span
                            key={`${session.id}-${apparatus}`}
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                          >
                            {apparatusLabels[apparatus] || apparatus}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      session.status === "in_progress"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {session.status === "in_progress" ? "En curso" : "Programada"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      router.push(
                        `/app/${academyId}/classes/${session.classId}?session=${session.id}`
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dos columnas: Mis atletas y Evaluaciones recientes */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mis Atletas */}
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Mis {specialization.labels.athletesPlural}</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/app/${academyId}/athletes`)}
              className="gap-1"
            >
              Ver todos <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {athletes.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No tienes {specialization.labels.athletesPlural.toLowerCase()} asignados</p>
              </div>
            ) : (
              athletes.slice(0, 10).map((athlete) => (
                <Link
                  key={athlete.id}
                  href={`/app/${academyId}/athletes/${athlete.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {athlete.groupColor && (
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: athlete.groupColor }}
                      />
                    )}
                    <div>
                      <p className="font-medium">{athlete.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {athlete.groupName && `${athlete.groupName} · `}
                        {athlete.level ?? "Sin nivel"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))
            )}
          </div>
          {athletes.length > 10 && (
            <div className="border-t p-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/app/${academyId}/athletes`)}
              >
                Ver los {athletes.length} {specialization.labels.athletesPlural.toLowerCase()}
              </Button>
            </div>
          )}
        </section>

        {/* Evaluaciones Recientes */}
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Evaluaciones Recientes</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/app/${academyId}/assessments`)}
              className="gap-1"
            >
              Ver todas <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {recentAssessments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <ClipboardList className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No hay evaluaciones recientes</p>
              </div>
            ) : (
              recentAssessments.map((assessment) => (
                <Link
                  key={assessment.id}
                  href={`/app/${academyId}/athletes/${assessment.athleteId}/assessments/${assessment.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{assessment.athleteName}</p>
                    <p className="text-sm text-muted-foreground">
                      {assessment.apparatus ? apparatusLabels[assessment.apparatus] || assessment.apparatus : "Evaluación general"} ·{" "}
                      {new Date(assessment.assessmentDate).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  {assessment.totalScore !== null && (
                    <div className="flex items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          assessment.totalScore >= 8
                            ? "bg-green-100 text-green-700"
                            : assessment.totalScore >= 5
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {assessment.totalScore.toFixed(1)}
                      </span>
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Horario semanal */}
      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Mi Horario Semanal</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/app/${academyId}/classes`)}
            className="gap-1"
          >
            Gestión de clases <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="divide-y">
          {classes.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Calendar className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>No tienes {specialization.labels.classLabel.toLowerCase()}s asignados</p>
              </div>
          ) : (
            classes
              .sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0))
              .map((cls) => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {cls.groupColor && (
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: cls.groupColor }}
                      />
                    )}
                    <div>
                      <p className="font-medium">{cls.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {cls.groupName && `${cls.groupName} · `}
                        {cls.athleteCount} atletas
                      </p>
                      {(cls.technicalFocus || cls.apparatus.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {cls.technicalFocus && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {cls.technicalFocus}
                            </span>
                          )}
                          {cls.apparatus.slice(0, 2).map((apparatus) => (
                            <span
                              key={`${cls.id}-${apparatus}`}
                              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            >
                              {apparatusLabels[apparatus] || apparatus}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {DAYS[cls.weekday ?? 0]}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatTime(cls.startTime)} - {formatTime(cls.endTime)}
                    </p>
                  </div>
                </div>
              ))
          )}
        </div>
      </section>
    </div>
  );
}
