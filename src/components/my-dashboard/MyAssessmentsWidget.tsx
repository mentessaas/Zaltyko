"use client";

import Link from "next/link";
import { ClipboardList, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface MyAssessmentsWidgetProps {
  academyId: string;
  athleteId?: string;
  assessments?: Array<{
    id: string;
    assessmentDate: string;
    apparatus: string | null;
    overallComment: string | null;
    assessedByName: string | null;
  }>;
  athleteName?: string;
}

export function MyAssessmentsWidget({
  academyId,
  athleteId,
  assessments = [],
  athleteName,
}: MyAssessmentsWidgetProps) {
  const { specialization } = useAcademyContext();
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );

  return (
    <div className="space-y-4">
      {assessments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="font-medium text-foreground">Todavía no hay evaluaciones registradas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando el equipo registre avances técnicos, aquí verás el historial reciente de{" "}
            {athleteName ?? specialization.labels.athleteSingular.toLowerCase()}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.slice(0, 5).map((assessment) => (
            <div
              key={assessment.id}
              className="rounded-lg border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {assessment.apparatus
                      ? apparatusLabels[assessment.apparatus] || assessment.apparatus
                      : "Evaluación general"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(assessment.assessmentDate).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {assessment.assessedByName ? ` · ${assessment.assessedByName}` : ""}
                  </p>
                </div>
                <Badge variant="outline">Técnica</Badge>
              </div>
              {assessment.overallComment && (
                <p className="mt-2 text-sm text-muted-foreground">{assessment.overallComment}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {athleteId && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/app/${academyId}/athletes/${athleteId}/history`}>
              Ver historial completo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
