"use client";

interface AthletesKanbanViewProps {
  academyId: string;
}

export function AthletesKanbanView({ academyId }: AthletesKanbanViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Cargando atletas...</p>
    </div>
  );
}
