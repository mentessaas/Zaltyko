"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface NextStep {
  id: string;
  label: string;
  description: string;
  href: string;
  cta: string;
  completed: boolean;
  priority: "high" | "medium" | "low";
}

interface NextStepsWidgetProps {
  academyId: string;
  metrics: {
    athletes: number;
    coaches: number;
    groups: number;
    classesThisWeek: number;
  };
  checklistProgress?: {
    completed: number;
    total: number;
  };
}

export function NextStepsWidget({ academyId, metrics, checklistProgress }: NextStepsWidgetProps) {
  const nextSteps = useMemo<NextStep[]>(() => {
    const steps: NextStep[] = [];

    // Paso 1: Crear primer grupo (si no hay grupos)
    if (metrics.groups === 0) {
      steps.push({
        id: "create_group",
        label: "Crea tu primer grupo",
        description: "Organiza a tus atletas por nivel y horarios para empezar a gestionar clases.",
        href: `/app/${academyId}/groups`,
        cta: "Crear grupo",
        completed: false,
        priority: "high",
      });
    }

    // Paso 2: Añadir atletas (si hay menos de 5)
    if (metrics.athletes < 5) {
      steps.push({
        id: "add_athletes",
        label: `Añade ${5 - metrics.athletes} atleta${5 - metrics.athletes > 1 ? "s" : ""} más`,
        description: "Carga a tus atletas principales para empezar a ver el valor real del sistema.",
        href: `/app/${academyId}/athletes`,
        cta: "Añadir atletas",
        completed: false,
        priority: metrics.athletes === 0 ? "high" : "medium",
      });
    }

    // Paso 3: Invitar entrenadores (si no hay)
    if (metrics.coaches === 0) {
      steps.push({
        id: "invite_coach",
        label: "Invita a tu primer entrenador",
        description: "Trae a tu equipo para que administren sus grupos y clases.",
        href: `/app/${academyId}/coaches`,
        cta: "Invitar entrenador",
        completed: false,
        priority: "medium",
      });
    }

    // Paso 4: Configurar calendario (si no hay clases esta semana)
    if (metrics.classesThisWeek === 0 && metrics.groups > 0) {
      steps.push({
        id: "setup_schedule",
        label: "Configura tu calendario semanal",
        description: "Crea tus primeras clases recurrentes para que todos tengan visibilidad.",
        href: `/app/${academyId}/classes`,
        cta: "Configurar calendario",
        completed: false,
        priority: "medium",
      });
    }

    // Ordenar por prioridad
    return steps.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [academyId, metrics]);

  const progressPercentage = checklistProgress
    ? Math.round((checklistProgress.completed / checklistProgress.total) * 100)
    : 0;

  // Si no hay próximos pasos, no mostrar el widget
  if (nextSteps.length === 0) {
    return null;
  }

  const firstStep = nextSteps[0];

  return (
    <div className="space-y-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">Próximo paso recomendado</h3>
            {checklistProgress && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                {checklistProgress.completed}/{checklistProgress.total}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {firstStep.description}
          </p>
        </div>
      </div>

      {checklistProgress && checklistProgress.total > 0 && (
        <div className="space-y-2">
          <Progress value={progressPercentage} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progressPercentage}% del setup completado
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button asChild className="w-full" size="lg">
          <Link href={firstStep.href} className="flex items-center justify-center gap-2">
            {firstStep.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        {nextSteps.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Otros pasos pendientes:</p>
            <ul className="space-y-1.5">
              {nextSteps.slice(1, 4).map((step) => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-background/50"
                  >
                    <Circle className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 text-muted-foreground">{step.label}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

