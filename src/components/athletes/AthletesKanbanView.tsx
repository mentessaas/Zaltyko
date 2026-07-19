"use client";

import { useAcademyContext } from "@/hooks/use-academy-context";

interface AthletesKanbanViewProps {
  academyId: string;
}

export function AthletesKanbanView({ academyId }: AthletesKanbanViewProps) {
  const { specialization } = useAcademyContext();

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Cargando {specialization.labels.athletesPlural.toLowerCase()}...</p>
    </div>
  );
}
