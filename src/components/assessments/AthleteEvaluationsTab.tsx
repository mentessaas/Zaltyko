"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AssessmentHistory } from "./AssessmentHistory";
import type { AssessmentWithScores } from "@/types";
import { Button } from "@/components/ui/button";

interface AthleteEvaluationsTabProps {
  athleteId: string;
  athleteName: string;
}

export default function AthleteEvaluationsTab({ athleteId, athleteName }: AthleteEvaluationsTabProps) {
  const [assessments, setAssessments] = useState<AssessmentWithScores[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assessments/${athleteId}`)
      .then((r) => r.json())
      .then((data) => setAssessments(data.assessments ?? []))
      .catch(() => setAssessments([]))
      .finally(() => setLoading(false));
  }, [athleteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {assessments.length === 0
            ? "No hay evaluaciones registradas para este atleta."
            : `${assessments.length} evaluación${assessments.length !== 1 ? "es" : ""} registrada${assessments.length === 1 ? "" : "s"}.`}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/assessments?athlete=${athleteId}`}>
            Ver todas en evaluaciones
          </Link>
        </Button>
      </div>

      <AssessmentHistory assessments={assessments} athleteName={athleteName} />
    </div>
  );
}
