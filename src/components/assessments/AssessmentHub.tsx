"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, ClipboardList, LineChart } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AssessmentForm from "@/components/assessments/AssessmentForm";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface AssessmentHubAthlete {
  id: string;
  name: string;
  groupName: string | null;
  level: string | null;
  recommendedFocus: string | null;
  apparatusList: string[];
}

interface AssessmentHubProps {
  academyId: string;
  athletes: AssessmentHubAthlete[];
  initialAthleteId?: string | null;
}

export function AssessmentHub({
  academyId,
  athletes,
  initialAthleteId,
}: AssessmentHubProps) {
  const { specialization } = useAcademyContext();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(
    initialAthleteId && athletes.some((athlete) => athlete.id === initialAthleteId)
      ? initialAthleteId
      : athletes[0]?.id ?? ""
  );

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId]
  );
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );

  if (athletes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="mb-4 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium text-foreground">
            Todavía no hay {specialization.labels.athletesPlural.toLowerCase()} disponibles para evaluar
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea o importa {specialization.labels.athletesPlural.toLowerCase()} para empezar a registrar evaluaciones técnicas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selecciona {specialization.labels.athleteSingular.toLowerCase()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            value={selectedAthleteId}
            onChange={(event) => setSelectedAthleteId(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {athletes.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>
                {athlete.name}
                {athlete.groupName ? ` · ${athlete.groupName}` : ""}
              </option>
            ))}
          </select>

          {selectedAthlete && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div>
                    <p className="font-semibold text-foreground">{selectedAthlete.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedAthlete.groupName ?? `Sin ${specialization.labels.groupLabel.toLowerCase()} asignado`}
                      {selectedAthlete.level ? ` · ${specialization.labels.levelLabel}: ${selectedAthlete.level}` : ""}
                    </p>
                  </div>
                  {selectedAthlete.recommendedFocus && (
                    <p className="text-sm text-muted-foreground">{selectedAthlete.recommendedFocus}</p>
                  )}
                  {selectedAthlete.apparatusList.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedAthlete.apparatusList.map((item) => (
                        <Badge key={item} variant="outline">
                          {apparatusLabels[item] || item}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/app/${academyId}/athletes/${selectedAthlete.id}/progress`}>
                      <LineChart className="mr-2 h-4 w-4" />
                      Ver progreso
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/app/${academyId}/athletes/${selectedAthlete.id}/history`}>
                      <Activity className="mr-2 h-4 w-4" />
                      Ver historial
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAthlete && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva evaluación técnica</CardTitle>
          </CardHeader>
          <CardContent>
            <AssessmentForm
              athleteId={selectedAthlete.id}
              athleteName={selectedAthlete.name}
              apparatusList={selectedAthlete.apparatusList}
              recommendedFocus={selectedAthlete.recommendedFocus}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
