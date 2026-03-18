"use client";

import { CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react";
import { DonutChart } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";

interface AttendanceData {
  total: number;
  present: number;
  absent: number;
  excused: number;
  recentRecords: {
    date: string;
    status: string;
    className: string;
  }[];
}

interface MyAttendanceWidgetProps {
  data: AttendanceData | null;
}

export function MyAttendanceWidget({ data }: MyAttendanceWidgetProps) {
  if (!data || data.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Clock className="h-10 w-10 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          Sin registros de asistencia
        </p>
        <p className="text-xs text-muted-foreground">
          Tu historial aparecerá aquí
        </p>
      </div>
    );
  }

  const attendanceRate = Math.round((data.present / data.total) * 100);

  const chartData = [
    { label: "Presente", value: data.present, color: "#10B981" },
    { label: "Ausente", value: data.absent, color: "#EF4444" },
    { label: "Excusa", value: data.excused, color: "#F59E0B" },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "present":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "absent":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "excused":
        return <Clock className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "present":
        return (
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 bg-emerald-50">
            Presente
          </Badge>
        );
      case "absent":
        return (
          <Badge variant="outline" className="border-red-500/50 text-red-600 bg-red-50">
            Ausente
          </Badge>
        );
      case "excused":
        return (
          <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-50">
            Excusa
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="space-y-4">
      {/* Tasa de asistencia */}
      <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <TrendingUp
            className={`h-5 w-5 ${
              attendanceRate >= 80
                ? "text-emerald-500"
                : attendanceRate >= 50
                ? "text-amber-500"
                : "text-red-500"
            }`}
          />
          <span className="text-sm font-medium text-foreground">
            Tasa de asistencia
          </span>
        </div>
        <span
          className={`text-2xl font-bold ${
            attendanceRate >= 80
              ? "text-emerald-600"
              : attendanceRate >= 50
              ? "text-amber-600"
              : "text-red-600"
          }`}
        >
          {attendanceRate}%
        </span>
      </div>

      {/* Gráfico donut */}
      {data.total > 0 && (
        <div className="flex justify-center">
          <DonutChart data={chartData} size={100} />
        </div>
      )}

      {/* Leyenda */}
      <div className="flex justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>{data.present} presentes</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span>{data.absent} ausentes</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span>{data.excused} excusas</span>
        </div>
      </div>

      {/* Registros recientes */}
      {data.recentRecords.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Últimos registros</p>
          {data.recentRecords.slice(-3).map((record, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5"
              style={{ animationDelay: `${index * 75}ms` }}
            >
              <div className="flex items-center gap-2">
                {getStatusIcon(record.status)}
                <span className="text-xs text-foreground truncate max-w-[120px]">
                  {record.className}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatDate(record.date)}
                </span>
                {getStatusBadge(record.status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
