"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Dumbbell,
  ExternalLink,
  MessageCircleMore,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { ContextGroupAlertComposer } from "@/components/messages/ContextGroupAlertComposer";
import { SessionAttendancePanel } from "@/components/coach/SessionAttendancePanel";
import { SessionProgressPanel } from "@/components/coach/SessionProgressPanel";
import type {
  SessionWorkspaceAthlete,
  SessionWorkspaceAttendance,
  SessionWorkspaceSession,
  SessionWorkspaceTerminology,
} from "@/components/coach/session-workspace-types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type WorkspaceStep = "attendance" | "progress" | "alert";

interface CoachSessionWorkspaceProps {
  academyId: string;
  academyName: string;
  coachName: string;
  session: SessionWorkspaceSession;
  athletes: SessionWorkspaceAthlete[];
  initialAttendance: SessionWorkspaceAttendance[];
  initialAssessmentCount: number;
  initialConversationId: string | null;
  terminology: SessionWorkspaceTerminology;
}

const STEP_CONFIG: Array<{
  id: WorkspaceStep;
  label: string;
  shortLabel: string;
  icon: typeof ClipboardCheck;
}> = [
  { id: "attendance", label: "Pasar asistencia", shortLabel: "Asistencia", icon: ClipboardCheck },
  { id: "progress", label: "Registrar progreso", shortLabel: "Progreso", icon: Sparkles },
  { id: "alert", label: "Avisar a familias", shortLabel: "Aviso", icon: MessageCircleMore },
];

function CoachSessionWorkspaceImpl({
  academyId,
  academyName,
  coachName,
  session,
  athletes,
  initialAttendance,
  initialAssessmentCount,
  initialConversationId,
  terminology,
}: CoachSessionWorkspaceProps) {
  const [activeStep, setActiveStep] = useState<WorkspaceStep>("attendance");
  const [attendanceCount, setAttendanceCount] = useState(initialAttendance.length);
  const [assessmentCount, setAssessmentCount] = useState(initialAssessmentCount);
  const [conversationId, setConversationId] = useState(initialConversationId);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "attendance" || hash === "progress" || hash === "alert") {
      setActiveStep(hash);
    }
  }, []);

  const completion = useMemo(
    () => ({
      attendance: athletes.length > 0 && attendanceCount >= athletes.length,
      progress: assessmentCount > 0,
      alert: Boolean(conversationId),
    }),
    [athletes.length, attendanceCount, assessmentCount, conversationId]
  );
  const completedSteps = Object.values(completion).filter(Boolean).length;
  const progressValue = Math.round((completedSteps / STEP_CONFIG.length) * 100);

  const selectStep = (step: string) => {
    const nextStep = step as WorkspaceStep;
    setActiveStep(nextStep);
    window.history.replaceState(null, "", `#${nextStep}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <nav aria-label="Ruta de navegación" className="flex flex-wrap items-center gap-2 text-sm text-zaltyko-text-secondary">
        <Link href={`/app/${academyId}/coach`} className="inline-flex min-h-11 items-center gap-2 font-medium text-zaltyko-indigo hover:text-zaltyko-teal">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Panel del entrenador
        </Link>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        <span aria-current="page">Clase de hoy</span>
      </nav>

      <header className="relative overflow-hidden rounded-3xl bg-zaltyko-navy p-5 text-white shadow-lift sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-zaltyko-electric/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-zaltyko-indigo/50 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_280px] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zaltyko-primary-light">
              <span>Clase de hoy</span>
              <span aria-hidden="true">·</span>
              <span>{academyName}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 tracking-normal text-white/75">
                {session.status === "in_progress" ? "En curso" : session.status === "completed" ? "Completada" : "Programada"}
              </span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{session.className}</h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/75">
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-zaltyko-electric" aria-hidden="true" />{session.formattedDate} · {session.formattedTime}</span>
              <span className="inline-flex items-center gap-2"><UsersRound className="h-4 w-4 text-zaltyko-electric" aria-hidden="true" />{athletes.length} {terminology.athletes.toLowerCase()}</span>
              <span className="inline-flex items-center gap-2"><Dumbbell className="h-4 w-4 text-zaltyko-electric" aria-hidden="true" />{session.groupName ?? "Sin grupo"}</span>
            </div>
            {(session.technicalFocus || session.apparatus.length > 0) ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {session.technicalFocus ? <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/85">Foco: {session.technicalFocus}</span> : null}
                {session.apparatus.map((item) => <span key={item.code} className="rounded-full border border-zaltyko-electric/30 bg-zaltyko-electric/10 px-3 py-1 text-xs text-zaltyko-primary-light">{item.name}</span>)}
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center justify-between text-sm"><span className="text-white/70">Flujo completado</span><span className="font-semibold">{completedSteps}/3</span></div>
            <Progress value={progressValue} aria-label={`${completedSteps} de 3 pasos completados`} className="mt-3 bg-white/15" indicatorClassName="bg-zaltyko-electric" />
            <p className="mt-3 text-xs leading-relaxed text-white/60">{coachName} · asistencia, progreso y comunicación en un único espacio.</p>
          </div>
        </div>
      </header>

      <section aria-label="Estado del flujo" className="grid gap-3 sm:grid-cols-3">
        {STEP_CONFIG.map((step) => {
          const Icon = step.icon;
          const done = completion[step.id];
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => selectStep(step.id)}
              className={cn(
                "flex min-h-[72px] items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-soft transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal focus-visible:ring-offset-2",
                activeStep === step.id ? "border-zaltyko-teal shadow-brand" : "border-zaltyko-mist/70 hover:border-zaltyko-teal/40"
              )}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", done ? "bg-emerald-100 text-emerald-700" : "bg-zaltyko-white text-zaltyko-indigo")}>
                {done ? <Check className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
              </span>
              <span><span className="block text-sm font-semibold text-zaltyko-navy">{step.label}</span><span className="block text-xs text-zaltyko-text-secondary">{done ? "Completado" : "Pendiente"}</span></span>
            </button>
          );
        })}
      </section>

      <Tabs value={activeStep} onValueChange={selectStep}>
        <div className="sticky top-2 z-20 rounded-2xl border border-zaltyko-mist/70 bg-zaltyko-white/95 p-2 shadow-medium backdrop-blur lg:hidden">
          <TabsList className="grid h-auto w-full grid-cols-3">
            {STEP_CONFIG.map((step) => <TabsTrigger key={step.id} value={step.id} className="min-h-11 px-2 text-xs">{step.shortLabel}</TabsTrigger>)}
          </TabsList>
        </div>

        <TabsContent value="attendance" id="attendance" className="mt-0 rounded-3xl border border-zaltyko-mist/70 bg-zaltyko-white p-4 shadow-soft sm:p-6">
          <SessionAttendancePanel
            sessionId={session.id}
            athletes={athletes}
            initialAttendance={initialAttendance}
            athleteTerm={terminology.athlete}
            athletesTerm={terminology.athletes}
            attendanceTerm={terminology.attendance}
            onSaved={setAttendanceCount}
          />
        </TabsContent>

        <TabsContent value="progress" id="progress" className="mt-0 rounded-3xl border border-zaltyko-mist/70 bg-zaltyko-white p-4 shadow-soft sm:p-6">
          <SessionProgressPanel
            sessionId={session.id}
            sessionDate={session.sessionDate}
            athletes={athletes}
            athleteTerm={terminology.athlete}
            apparatusTerm={terminology.apparatus}
            initialAssessmentCount={initialAssessmentCount}
            onSaved={setAssessmentCount}
          />
        </TabsContent>

        <TabsContent value="alert" id="alert" className="mt-0 overflow-hidden rounded-3xl border border-zaltyko-mist/70 bg-white shadow-soft">
          <div className="border-b border-zaltyko-mist/70 bg-zaltyko-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Paso 3</p>
            <h2 className="mt-1 text-xl font-semibold text-zaltyko-navy">Aviso interno a las familias</h2>
            <p className="mt-1 text-sm text-zaltyko-text-secondary">El mensaje queda vinculado a esta sesión, genera notificación y conserva el historial dentro de Zaltyko.</p>
          </div>
          <ContextGroupAlertComposer
            academyId={academyId}
            session={{ id: session.id, className: session.className, groupName: session.groupName, sessionDate: session.formattedDate }}
            onSent={(nextConversationId) => setConversationId(nextConversationId)}
          />
          {conversationId ? (
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Esta sesión ya tiene historial de avisos.</p>
              <Button asChild variant="outline" className="min-h-11">
                <Link href={`/app/${academyId}/messages?c=${conversationId}`}>Abrir historial <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      <div className="flex flex-col gap-3 border-t border-zaltyko-mist/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zaltyko-text-secondary">La sesión permanece editable desde su clase y los registros conservan el contexto original.</p>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={`/app/${academyId}/classes/${session.classId}`}>Ver detalle de la clase <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
        </Button>
      </div>
    </div>
  );
}

export const CoachSessionWorkspace = memo(CoachSessionWorkspaceImpl);
