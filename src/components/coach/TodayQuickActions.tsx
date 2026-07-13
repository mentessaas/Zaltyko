"use client";

import { memo } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, MessageCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * TodayQuickActions - Vista compacta "clase de hoy" para el coach.
 *
 * Muestra 3 acciones inline (pasar asistencia, registrar progreso, enviar
 * aviso al grupo) para que el entrenador pueda completar el flujo
 * diario en menos de 3 minutos sin navegar entre paginas.
 *
 * Si no hay sesion hoy, muestra empty state con CTA a la lista de clases.
 */

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: typeof CheckCircle2;
  accent: string;
}

export interface TodayQuickActionsProps {
  academyId: string;
  todaySession?: {
    id: string;
    classId: string;
    className: string;
    startTime: string;
    groupName?: string;
    athleteCount: number;
  };
}

function TodayQuickActionsImpl({ academyId, todaySession }: TodayQuickActionsProps) {
  if (!todaySession) {
    return (
      <Card className="bg-muted/40">
        <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Sin clases programadas hoy
            </h2>
            <p className="text-sm text-muted-foreground">
              Cuando tengas una sesion programada aparecera aqui para que
              puedas pasar asistencia, evaluar progreso y avisar al grupo
              en menos de 3 minutos.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/${academyId}/classes`} className="min-h-[44px]">
              Ver clases
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const actions: QuickAction[] = [
    {
      label: "Pasar asistencia",
      description: `${todaySession.athleteCount} gimnastas`,
      href: `/app/${academyId}/attendance?session=${todaySession.id}`,
      icon: CheckCircle2,
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Evaluar progreso",
      description: "Crea evaluacion tecnica",
      href: `/app/${academyId}/evaluations?session=${todaySession.id}`,
      icon: FileText,
      accent: "text-sky-600 bg-sky-50",
    },
    {
      label: "Aviso al grupo",
      description: todaySession.groupName ?? "Mensaje interno",
      href: `/app/${academyId}/messages?session=${todaySession.id}&compose=group`,
      icon: MessageCircle,
      accent: "text-amber-600 bg-amber-50",
    },
  ];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Clase de hoy
            </span>
            <h2 className="font-display text-xl font-semibold text-foreground">
              {todaySession.className}
            </h2>
            <p className="text-sm text-muted-foreground">
              {todaySession.startTime}
              {todaySession.groupName ? ` · ${todaySession.groupName}` : ""}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/app/${academyId}/classes?session=${todaySession.id}`}
              className="min-h-[44px]"
            >
              Detalle
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-start gap-3 rounded-xl border bg-card p-4 transition hover:border-zaltyko-accent/40 hover:shadow-soft min-h-[44px]"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {action.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {action.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(TodayQuickActionsImpl);
