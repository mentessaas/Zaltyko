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
    description: "Analisis de asistencia por atleta, grupo o periodo",
    href: (id: string) => `/app/${id}/reports/attendance`,
    icon: TrendingUp,
    color: "text-emerald-600",
    bgColor: "bg-gradient-to-br from-emerald-500 to-emerald-600",
    gradient: "from-emerald-500/20 to-transparent",
  },
  {
    id: "financial",
    title: "Reporte Financiero",
    description: "Ingresos, pagos pendientes y proyecciones",
    href: (id: string) => `/app/${id}/reports/financial`,
    icon: DollarSign,
    color: "text-blue-600",
    bgColor: "bg-gradient-to-br from-blue-500 to-blue-600",
    gradient: "from-blue-500/20 to-transparent",
  },
  {
    id: "progress",
    title: "Reporte de Progreso",
    description: "Evolucion de atletas y comparativas",
    href: (id: string) => `/app/${id}/reports/progress`,
    icon: FileText,
    color: "text-violet-600",
    bgColor: "bg-gradient-to-br from-violet-500 to-violet-600",
    gradient: "from-violet-500/20 to-transparent",
  },
];

export function QuickReportsWidget({ academyId }: QuickReportsWidgetProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-zaltyko-border/40 bg-gradient-to-br from-white via-white to-zaltyko-primary/5 p-6 shadow-lg shadow-zaltyko-primary/5">
      <header>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center shadow-lg shadow-zaltyko-primary/20">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zaltyko-text-secondary/80">
              Reportes rapidos
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              Accesos directos
            </h3>
          </div>
        </div>
        <p className="text-xs text-zaltyko-text-secondary">
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
              className="group relative flex flex-col gap-3 rounded-2xl border border-zaltyko-border/30 bg-white/80 p-4 transition-all hover:border-zaltyko-primary/40 hover:shadow-xl hover:shadow-zaltyko-primary/10 hover:-translate-y-1 overflow-hidden"
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none", report.gradient)} />
              <div className={cn("relative inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg", report.bgColor)}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div className="relative">
                <p className="font-bold text-sm text-zaltyko-text-main group-hover:text-zaltyko-primary transition-colors">{report.title}</p>
                <p className="mt-1 text-xs text-zaltyko-text-secondary">{report.description}</p>
              </div>
              <div className="relative mt-auto flex items-center gap-1 text-xs font-bold text-zaltyko-primary opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1">
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

