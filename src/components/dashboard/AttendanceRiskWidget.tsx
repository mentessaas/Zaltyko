"use client";

interface AttendanceRiskWidgetProps {
  academyId: string;
}

export function AttendanceRiskWidget({ academyId }: AttendanceRiskWidgetProps) {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-semibold mb-2">Riesgo de asistencia</h3>
      <p className="text-sm text-muted-foreground">
        Cargando...
      </p>
    </div>
  );
}
