"use client";

import { useState, useEffect } from "react";
import { FileText, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface RecentReport {
  id: string;
  type: string;
  name: string;
  generatedAt: string;
  format: string;
}

interface RecentReportsProps {
  academyId: string;
}

export function RecentReports({ academyId }: RecentReportsProps) {
  const [reports, setReports] = useState<RecentReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulated recent reports - in production, fetch from API
    const mockReports: RecentReport[] = [
      {
        id: "1",
        type: "attendance",
        name: "Asistencia Marzo 2026",
        generatedAt: new Date().toISOString(),
        format: "PDF",
      },
      {
        id: "2",
        type: "financial",
        name: "Ingresos Q1 2026",
        generatedAt: new Date(Date.now() - 86400000).toISOString(),
        format: "Excel",
      },
      {
        id: "3",
        type: "progress",
        name: "Progreso Atletas",
        generatedAt: new Date(Date.now() - 172800000).toISOString(),
        format: "PDF",
      },
    ];

    setReports(mockReports);
    setIsLoading(false);
  }, [academyId]);

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

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      attendance: "bg-blue-500",
      financial: "bg-green-500",
      progress: "bg-purple-500",
      class: "bg-orange-500",
      coach: "bg-teal-500",
      churn: "bg-red-500",
    };
    return colors[type] || "bg-gray-500";
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Reportes Recientes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay reportes recientes
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${getTypeColor(report.type)}`}>
                    <FileText className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{report.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(report.generatedAt), "dd MMM yyyy", { locale: es })}
                    </p>
                  </div>
                </div>
                <span className="text-xs bg-muted px-2 py-1 rounded">{report.format}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
