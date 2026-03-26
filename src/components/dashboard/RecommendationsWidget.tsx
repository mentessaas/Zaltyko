"use client";

interface RecommendationsWidgetProps {
  academyId: string;
  userRole?: string;
  metrics?: {
    athletesCount?: number;
    classesThisWeek?: number;
    pendingPayments?: number;
    attendanceRate?: number;
  };
}

export function RecommendationsWidget({ academyId, userRole, metrics }: RecommendationsWidgetProps) {
  return <div className="p-4 border rounded-lg"><h3 className="font-semibold">Recomendaciones</h3></div>;
}
