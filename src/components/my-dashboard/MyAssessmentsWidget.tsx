"use client";

interface MyAssessmentsWidgetProps {
  athleteId: string;
}

export function MyAssessmentsWidget({ athleteId }: MyAssessmentsWidgetProps) {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-semibold mb-2">Evaluaciones</h3>
      <p className="text-sm text-muted-foreground">Cargando...</p>
    </div>
  );
}
