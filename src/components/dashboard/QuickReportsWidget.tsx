"use client";

import Link from "next/link";
import { FileText, TrendingUp, DollarSign, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickReportsWidgetProps {
  academyId: string;
}

const QUICK_REPORTS = [
  {
    id: "attendance",
    title: "Reporte de Asistencia",
    description: "Análisis de asistencia por atleta, grupo o periodo",
    href: (id: string) => `/app/${id}/reports/attendance`,
    icon: TrendingUp,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
  },
  {
    id: "financial",
    title: "Reporte Financiero",
    description: "Ingresos, pagos pendientes y proyecciones",
    href: (id: string) => `/app/${id}/reports/financial`,
    icon: DollarSign,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
  },
  {
    id: "progress",
    title: "Reporte de Progreso",
    description: "Evolución de atletas y comparativas",
    href: (id: string) => `/app/${id}/reports/progress`,
    icon: FileText,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-950/20",
  },
];

export function QuickReportsWidget({ academyId }: QuickReportsWidgetProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
          Reportes rápidos
        </p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">
          Accesos directos a reportes
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Genera y exporta reportes detallados en segundos
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.id}
              href={report.href(academyId)}
              className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 p-4 transition hover:border-primary/40 hover:shadow-sm"
            >
              <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-lg", report.bgColor)}>
                <Icon className={cn("h-5 w-5", report.color)} />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{report.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{report.description}</p>
              </div>
              <div className="mt-auto flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                Ver reporte
                <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

