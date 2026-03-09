"use client";

import Link from "next/link";
import {
  Calendar,
  Clock,
  CreditCard,
  TrendingUp,
  ArrowRight,
  Users,
  User,
  MapPin,
  Mail,
  Phone,
  GraduationCap,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MyScheduleWidget } from "@/components/my-dashboard/MyScheduleWidget";
import { MyAttendanceWidget } from "@/components/my-dashboard/MyAttendanceWidget";
import { MyPaymentsWidget } from "@/components/my-dashboard/MyPaymentsWidget";
import { MyProgressWidget } from "@/components/my-dashboard/MyProgressWidget";

interface AthleteWithDetails {
  id: string;
  name: string;
  level: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  coachName: string | null;
}

interface GuardianWithAthletes {
  guardianId: string;
  athleteId: string;
  athleteName: string;
}

interface ChargeData {
  id: string;
  label: string;
  amountCents: number;
  period: string;
  status: string;
  dueDate: string | null;
}

interface AttendanceData {
  total: number;
  present: number;
  absent: number;
  excused: number;
  recentRecords: {
    date: string;
    status: string;
    className: string;
  }[];
}

interface SessionData {
  id: string;
  classId: string;
  className: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  groupColor: string | null;
  coachName: string | null;
  status: string;
}

interface MyDashboardPageProps {
  academyId: string;
  academyName: string;
  academyCountry: string | null;
  profileName: string | null;
  profileRole: string;
  profilePhotoUrl: string | null;
  athleteData: AthleteWithDetails | null;
  guardianAthletes: GuardianWithAthletes[];
  upcomingClasses: SessionData[];
  attendanceData: AttendanceData | null;
  chargesData: ChargeData[];
  weeklySchedule: { day: number; className: string; time: string }[];
}

const DAYS_OF_WEEK = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export function MyDashboardPage({
  academyId,
  academyName,
  academyCountry,
  profileName,
  profileRole,
  profilePhotoUrl,
  athleteData,
  guardianAthletes,
  upcomingClasses,
  attendanceData,
  chargesData,
  weeklySchedule,
}: MyDashboardPageProps) {
  const isParent = profileRole === "parent";
  const isAthlete = profileRole === "athlete";

  // Obtener el nombre del atleta a mostrar
  const displayAthleteName = isAthlete
    ? athleteData?.name
    : guardianAthletes.length > 0
    ? guardianAthletes[0].athleteName
    : null;

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    const parts = name.split(" ");
    return parts.length > 1
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  // Calcular estado de pagos
  const pendingPayments = chargesData.filter(
    (c) => c.status === "pending" || c.status === "overdue"
  );
  const hasPendingPayments = pendingPayments.length > 0;

  // Calcular tasa de asistencia
  const attendanceRate =
    attendanceData && attendanceData.total > 0
      ? Math.round((attendanceData.present / attendanceData.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header con información del perfil */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 text-xl">
            <AvatarFallback className="bg-primary/20 text-primary">
              {getInitials(profileName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              ¡Hola, {profileName || "Usuario"}!
            </h1>
            <p className="text-muted-foreground">
              {isParent ? "Panel de padre/tutor" : "Tu panel personal"}
              {" · "}
              <span className="font-medium text-primary">{academyName}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/app/${academyId}/calendar`}>
              <Calendar className="mr-2 h-4 w-4" />
              Calendario
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/app/${academyId}/billing`}>
              <CreditCard className="mr-2 h-4 w-4" />
              Pagos
            </Link>
          </Button>
        </div>
      </div>

      {/* Información del atleta */}
      {(athleteData || guardianAthletes.length > 0) && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
                  <User className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {displayAthleteName}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {athleteData?.level && (
                      <Badge variant="outline" className="bg-background">
                        <GraduationCap className="mr-1 h-3 w-3" />
                        Nivel: {athleteData.level}
                      </Badge>
                    )}
                    {athleteData?.groupName && (
                      <Badge
                        variant="outline"
                        className="bg-background"
                        style={
                          athleteData.groupColor
                            ? {
                                borderColor: athleteData.groupColor,
                                color: athleteData.groupColor,
                              }
                            : undefined
                        }
                      >
                        {athleteData.groupName}
                      </Badge>
                    )}
                    {athleteData?.coachName && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {athleteData.coachName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Horario semanal resumido */}
              {weeklySchedule.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {weeklySchedule.slice(0, 4).map((schedule, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 rounded-lg bg-background/80 px-2 py-1 text-xs"
                    >
                      <span className="font-medium text-foreground">
                        {DAYS_OF_WEEK[schedule.day]?.substring(0, 3)}
                      </span>
                      <span className="text-muted-foreground">
                        {schedule.className}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Si es padre con múltiples hijos */}
            {isParent && guardianAthletes.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">Tus hijos:</span>
                {guardianAthletes.map((ga) => (
                  <Badge key={ga.athleteId} variant="outline">
                    {ga.athleteName}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Widgets principales - Grid responsivo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Widget de Horario/Próximas clases */}
        <Card className="md:col-span-2 lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  <Clock className="mr-2 inline h-4 w-4" />
                  Próximas Clases
                </CardTitle>
                <CardDescription>Hoy y los próximos días</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/app/${academyId}/classes`}>
                  Ver todas
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <MyScheduleWidget
              sessions={upcomingClasses}
              academyCountry={academyCountry}
            />
          </CardContent>
        </Card>

        {/* Widget de Asistencia */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  <TrendingUp className="mr-2 inline h-4 w-4" />
                  Asistencia
                </CardTitle>
                <CardDescription>Últimos 30 días</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/app/${academyId}/attendance`}>
                  Ver historial
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <MyAttendanceWidget data={attendanceData} />
          </CardContent>
        </Card>

        {/* Widget de Pagos */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  <CreditCard className="mr-2 inline h-4 w-4" />
                  Pagos
                </CardTitle>
                <CardDescription>
                  {hasPendingPayments
                    ? `${pendingPayments.length} pendiente(s)`
                    : "Todo al día"}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/app/${academyId}/billing`}>
                  Ver todos
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <MyPaymentsWidget charges={chargesData} />
          </CardContent>
        </Card>
      </div>

      {/* Widget de Progreso */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                <TrendingUp className="mr-2 inline h-4 w-4" />
                Progreso del Atleta
              </CardTitle>
              <CardDescription>
                Evolución y nivel actual
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/${academyId}/assessments`}>
                Ver evaluaciones
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MyProgressWidget
            athleteData={athleteData}
            attendanceData={attendanceData}
          />
        </CardContent>
      </Card>

      {/* Acciones rápidas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Button variant="outline" className="h-auto py-4" asChild>
          <Link href={`/app/${academyId}/calendar`}>
            <div className="flex flex-col items-start gap-1 text-left">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="font-medium">Ver Calendario</span>
              <span className="text-xs text-muted-foreground">
                Consulta todas tus clases programadas
              </span>
            </div>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4" asChild>
          <Link href={`/app/${academyId}/billing`}>
            <div className="flex flex-col items-start gap-1 text-left">
              <CreditCard className="h-5 w-5 text-primary" />
              <span className="font-medium">Historial de Pagos</span>
              <span className="text-xs text-muted-foreground">
                Ver facturas y estados de cuenta
              </span>
            </div>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4" asChild>
          <Link href={`/app/${academyId}/messages`}>
            <div className="flex flex-col items-start gap-1 text-left">
              <Mail className="h-5 w-5 text-primary" />
              <span className="font-medium">Contactar Academia</span>
              <span className="text-xs text-muted-foreground">
                Envía un mensaje a la academia
              </span>
            </div>
          </Link>
        </Button>
      </div>
    </div>
  );
}
