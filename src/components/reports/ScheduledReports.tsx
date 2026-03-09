"use client";

import { useState } from "react";
import { Clock, Plus, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ScheduledReport {
  id: string;
  type: string;
  frequency: "daily" | "weekly" | "monthly";
  nextRun: string;
  recipients: string[];
  active: boolean;
}

interface ScheduledReportsProps {
  academyId: string;
}

const mockScheduledReports: ScheduledReport[] = [
  {
    id: "1",
    type: "attendance",
    frequency: "weekly",
    nextRun: new Date(Date.now() + 604800000).toISOString(), // 1 week
    recipients: ["admin@academia.com"],
    active: true,
  },
  {
    id: "2",
    type: "financial",
    frequency: "monthly",
    nextRun: new Date(Date.now() + 2592000000).toISOString(), // ~30 days
    recipients: ["admin@academia.com", "finance@academia.com"],
    active: true,
  },
];

export function ScheduledReports({ academyId }: ScheduledReportsProps) {
  const [scheduledReports] = useState<ScheduledReport[]>(mockScheduledReports);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      attendance: "Asistencia",
      financial: "Financiero",
      progress: "Progreso",
      class: "Clases",
      coach: "Entrenadores",
      churn: "Bajas",
    };
    return labels[type] || type;
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      daily: "Diario",
      weekly: "Semanal",
      monthly: "Mensual",
    };
    return labels[frequency] || frequency;
  };

  const getFrequencyColor = (frequency: string) => {
    const colors: Record<string, string> = {
      daily: "bg-red-100 text-red-800",
      weekly: "bg-blue-100 text-blue-800",
      monthly: "bg-green-100 text-green-800",
    };
    return colors[frequency] || "bg-gray-100 text-gray-800";
  };

  const formatNextRun = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Hoy";
    if (days === 1) return "Mañana";
    if (days < 7) return `En ${days} días`;
    if (days < 30) return `En ${Math.floor(days / 7)} semanas`;
    return `En ${Math.floor(days / 30)} meses`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Reportes Programados
        </CardTitle>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Programar
        </Button>
      </CardHeader>
      <CardContent>
        {scheduledReports.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              No hay reportes programados
            </p>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Programar Reporte
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {scheduledReports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{getTypeLabel(report.type)}</p>
                    <Badge className={getFrequencyColor(report.frequency)}>
                      {getFrequencyLabel(report.frequency)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Próxima ejecución: {formatNextRun(report.nextRun)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Destinatarios: {report.recipients.join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {report.active ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      Activo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50">
                      Inactivo
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
