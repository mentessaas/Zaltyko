"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar,
  CreditCard,
  TrendingUp,
  ArrowRight,
  Users,
  User,
  Mail,
  GraduationCap,
  ClipboardList,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MyScheduleWidget } from "@/components/my-dashboard/MyScheduleWidget";
import { MyAttendanceWidget } from "@/components/my-dashboard/MyAttendanceWidget";
import { MyPaymentsWidget } from "@/components/my-dashboard/MyPaymentsWidget";
import { MyProgressWidget } from "@/components/my-dashboard/MyProgressWidget";
import { MyAssessmentsWidget } from "@/components/my-dashboard/MyAssessmentsWidget";
import { MyCalendarWidget } from "@/components/my-dashboard/MyCalendarWidget";
import { getInitials } from "@/lib/string-utils";
import { useAcademyContext } from "@/hooks/use-academy-context";

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
  athleteLevel: string | null;
  athleteGroupId: string | null;
  athleteGroupName: string | null;
  athleteGroupColor: string | null;
  athleteCoachName: string | null;
}

interface ChargeData {
  id: string;
  label: string;
  amountCents: number;
  period: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
  billingItemName: string | null;
  billingItemDescription: string | null;
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
  technicalFocus: string | null;
  apparatus: string[];
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
  assessmentsData: { id: string; assessmentDate: string; apparatus: string | null; overallComment: string | null; assessedByName: string | null }[];
  calendarSessions: {
    date: string;
    sessions: {
      id: string;
      className: string;
      startTime: string | null;
      endTime: string | null;
      groupName: string | null;
      groupColor: string | null;
      technicalFocus: string | null;
      apparatus: string[];
    }[];
  }[];
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
  assessmentsData,
  calendarSessions,
}: MyDashboardPageProps) {
  const { specialization } = useAcademyContext();
  const isParent = profileRole === "parent";
  const isAthlete = profileRole === "athlete";
  const isCoach = profileRole === "coach";
  const canViewPayments = isParent;
  const hasLinkedAthlete = isAthlete ? Boolean(athleteData) : guardianAthletes.length > 0;
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAthleteId = searchParams.get("athleteId");

  // Estado para el athlete seleccionado (para padres con múltiples hijos)
  const [selectedAthleteId, setSelectedAthleteId] = useState(
    isAthlete
      ? athleteData?.id
      : guardianAthletes.some((athlete) => athlete.athleteId === requestedAthleteId)
        ? requestedAthleteId ?? undefined
        : guardianAthletes[0]?.athleteId
  );

  // Mantener el selector sincronizado al abrir un enlace con ?athleteId=…
  // o al volver a la vista familiar sin una selección explícita.
  useEffect(() => {
    if (!isParent) return;
    const nextAthleteId = guardianAthletes.some(
      (athlete) => athlete.athleteId === requestedAthleteId
    )
      ? requestedAthleteId ?? guardianAthletes[0]?.athleteId
      : guardianAthletes[0]?.athleteId;

    setSelectedAthleteId((current) =>
      current === nextAthleteId ? current : nextAthleteId
    );
  }, [guardianAthletes, isParent, requestedAthleteId]);

  // Obtener el athlete seleccionado de la lista
  const selectedAthlete = isParent && guardianAthletes.length > 0
    ? guardianAthletes.find(a => a.athleteId === selectedAthleteId) ?? guardianAthletes[0]
    : null;

  const activeAthleteData: AthleteWithDetails | null = isAthlete
    ? athleteData
    : selectedAthlete
      ? {
          id: selectedAthlete.athleteId,
          name: selectedAthlete.athleteName,
          level: selectedAthlete.athleteLevel,
          groupId: selectedAthlete.athleteGroupId,
          groupName: selectedAthlete.athleteGroupName,
          groupColor: selectedAthlete.athleteGroupColor,
          coachName: selectedAthlete.athleteCoachName,
        }
      : null;

  // Función para cambiar de athlete
  const handleAthleteChange = (newAthleteId: string) => {
    setSelectedAthleteId(newAthleteId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("athleteId", newAthleteId);
    router.push(`?${params.toString()}`);
  };

  // Obtener el nombre del atleta a mostrar
  const displayAthleteName = isAthlete
    ? athleteData?.name
    : selectedAthlete?.athleteName ?? null;

  // Calcular estado de pagos
  const pendingPayments = chargesData.filter(
    (c) => c.status === "pending" || c.status === "overdue"
  );
  const hasPendingPayments = canViewPayments && hasLinkedAthlete && pendingPayments.length > 0;
  const totalPendingAmount = pendingPayments.reduce((sum, p) => sum + p.amountCents, 0);

  // Calcular tasa de asistencia
  const attendanceRate =
    attendanceData && attendanceData.total > 0
      ? Math.round((attendanceData.present / attendanceData.total) * 100)
      : null;

  // Format currency
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      {/* Alerta de pagos pendientes */}
      {hasPendingPayments && (
        <div className="flex flex-col gap-4 rounded-[22px] border border-amber-200/80 bg-gradient-to-r from-amber-50 to-white p-4 shadow-[0_18px_42px_-32px_rgba(146,64,14,0.45)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <CreditCard className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-900">
                Tienes {pendingPayments.length} {pendingPayments.length === 1 ? "pago pendiente" : "pagos pendientes"}
              </p>
              <p className="text-sm text-amber-700">Total: {formatCurrency(totalPendingAmount)}</p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
            <Link href="#payments">
              Ver detalles
            </Link>
          </Button>
        </div>
      )}

      {isParent && guardianAthletes.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white/80">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold">
                  Aún no hay un perfil de {specialization.labels.athleteSingular.toLowerCase()} vinculado
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pide a la academia que vincule tu cuenta familiar. Hasta entonces puedes usar el canal interno de mensajes.
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href={`/app/${academyId}/messages`}>Contactar con la academia</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats rápidos */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.5)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Asistencia</p>
              <p className="text-xl font-bold">
                {attendanceRate === null ? "—" : `${attendanceRate}%`}
              </p>
              {attendanceRate === null && (
                <p className="text-xs text-muted-foreground">Sin registros aún</p>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.5)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clases esta semana</p>
              <p className="text-xl font-bold">
                {hasLinkedAthlete ? weeklySchedule.length : "—"}
              </p>
              {!hasLinkedAthlete && (
                <p className="text-xs text-muted-foreground">Perfil pendiente</p>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.5)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
              <ClipboardList className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Evaluaciones</p>
              <p className="text-xl font-bold">
                {hasLinkedAthlete ? assessmentsData.length : "—"}
              </p>
              {!hasLinkedAthlete && (
                <p className="text-xs text-muted-foreground">Perfil pendiente</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Header con información del perfil */}
      <div className="relative overflow-hidden rounded-[26px] bg-slate-950 px-5 py-6 text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)] sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border border-white/15 text-xl">
            <AvatarFallback className="bg-white/10 text-teal-200">
              {getInitials(profileName ?? "")}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-200">{isParent ? "Tu espacio familiar" : "Tu progreso en pista"}</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.03em] text-white">
              ¡Hola, {profileName || "Usuario"}!
            </h1>
            <p className="text-sm text-slate-300">
              {isParent
                ? "Panel familiar"
                : isAthlete
                  ? `Tu progreso como ${specialization.labels.athleteSingular.toLowerCase()}`
                  : isCoach
                    ? `Panel de ${specialization.labels.coachLabel.toLowerCase()}`
                    : "Tu panel personal"}
              {" · "}
              <span className="font-semibold text-teal-200">{academyName}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/20" asChild>
            <Link href="#calendar">
              <Calendar className="mr-2 h-4 w-4" />
              Calendario
            </Link>
          </Button>
          {canViewPayments && hasLinkedAthlete && (
            <Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/20" asChild>
              <Link href="#payments">
                <CreditCard className="mr-2 h-4 w-4" />
                Pagos
              </Link>
            </Button>
          )}
        </div>
        </div>
      </div>

      {/* Información del atleta */}
      {(athleteData || guardianAthletes.length > 0) && (
        <Card className="overflow-hidden border-teal-200/70 bg-gradient-to-r from-teal-50 to-white">
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
                    {activeAthleteData?.level && (
                      <Badge variant="outline" className="bg-background">
                        <GraduationCap className="mr-1 h-3 w-3" />
                        {specialization.labels.levelLabel}: {activeAthleteData.level}
                      </Badge>
                    )}
                    {activeAthleteData?.groupName && (
                      <Badge
                        variant="outline"
                        className="bg-background"
                        style={
                          activeAthleteData.groupColor
                            ? {
                                borderColor: activeAthleteData.groupColor,
                                color: activeAthleteData.groupColor,
                              }
                            : undefined
                        }
                      >
                        {activeAthleteData.groupName}
                      </Badge>
                    )}
                    {activeAthleteData?.coachName && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {activeAthleteData.coachName}
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

            {/* Selector de hijos para padres con múltiples atletas */}
            {isParent && guardianAthletes.length > 1 && (
              <div className="mt-4">
                <label className="text-sm text-muted-foreground mb-2 block">
                  Ver información de:
                </label>
                <Select value={selectedAthleteId ?? ""} onValueChange={handleAthleteChange}>
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder={`Seleccionar ${specialization.labels.athleteSingular.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {guardianAthletes.map((ga) => (
                      <SelectItem key={ga.athleteId} value={ga.athleteId}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>{ga.athleteName}</span>
                          {ga.athleteLevel && (
                            <Badge variant="outline" className="text-xs ml-2">
                              {ga.athleteLevel}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Widgets principales - Grid responsivo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Próximas clases: la primera respuesta que necesitan familias y gimnastas */}
        <Card id="next-classes" className="scroll-mt-24 md:col-span-2 lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  <Calendar className="mr-2 inline h-4 w-4" />
                  Próximas clases
                </CardTitle>
                <CardDescription>Lo que viene en los próximos 7 días</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="#calendar">
                  Ver calendario
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <MyScheduleWidget sessions={upcomingClasses} academyCountry={academyCountry} />
          </CardContent>
        </Card>

        {/* Widget de Calendario Mensual */}
        <Card id="calendar" className="scroll-mt-24 md:col-span-2 lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  <Calendar className="mr-2 inline h-4 w-4" />
                  Calendario
                </CardTitle>
                <CardDescription>Vista mensual de clases</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="#calendar">
                  Calendario familiar
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <MyCalendarWidget sessionsByDay={calendarSessions} />
          </CardContent>
        </Card>

        {/* Widget de Asistencia */}
        <Card id="attendance" className="scroll-mt-24">
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
                <Link href="#attendance">
                  Resumen familiar
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <MyAttendanceWidget data={attendanceData} />
          </CardContent>
        </Card>

        {/* Widget de Pagos: información financiera solo para tutores */}
        {canViewPayments && hasLinkedAthlete && (
          <Card id="payments" className="scroll-mt-24">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    <CreditCard className="mr-2 inline h-4 w-4" />
                    Pagos
                  </CardTitle>
                  <CardDescription>
                    {hasPendingPayments
                      ? `${pendingPayments.length} ${pendingPayments.length === 1 ? "pendiente" : "pendientes"}`
                      : "Todo al día"}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="#payments">
                    Resumen familiar
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <MyPaymentsWidget charges={chargesData} academyId={academyId} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Widget de Progreso */}
      <Card id="progress" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
                <CardTitle className="text-base">
                  <TrendingUp className="mr-2 inline h-4 w-4" />
                  Progreso de {specialization.labels.athleteSingular}
                </CardTitle>
              <CardDescription>
                Evolución y nivel actual
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="#assessments">
                Ver evaluaciones
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MyProgressWidget
            athleteData={activeAthleteData}
            attendanceData={attendanceData}
            assessmentsData={assessmentsData}
          />
        </CardContent>
      </Card>

      {/* Widget de Evaluaciones */}
      <Card id="assessments" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                <TrendingUp className="mr-2 inline h-4 w-4" />
                Evaluaciones Técnicas
              </CardTitle>
              <CardDescription>
                Historial de evaluaciones y progreso
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="#assessments">
                Ver todas
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MyAssessmentsWidget
            academyId={academyId}
            athleteId={isAthlete ? athleteData?.id ?? undefined : selectedAthleteId ?? undefined}
            assessments={assessmentsData}
            athleteName={displayAthleteName ?? specialization.labels.athleteSingular}
          />
        </CardContent>
      </Card>

      {/* Acciones rápidas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Button variant="outline" className="h-auto py-4" asChild>
          <Link href="#calendar">
            <div className="flex flex-col items-start gap-1 text-left">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="font-medium">Ver Calendario</span>
              <span className="text-xs text-muted-foreground">
                Consulta todas tus clases programadas
              </span>
            </div>
          </Link>
        </Button>
        {canViewPayments && hasLinkedAthlete && (
          <Button variant="outline" className="h-auto py-4" asChild>
            <Link href="#payments">
              <div className="flex flex-col items-start gap-1 text-left">
                <CreditCard className="h-5 w-5 text-primary" />
                <span className="font-medium">Historial de pagos</span>
                <span className="text-xs text-muted-foreground">
                  Ver cuotas y estados de pago
                </span>
              </div>
            </Link>
          </Button>
        )}
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
