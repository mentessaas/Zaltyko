"use client";

import Link from "next/link";
import { FileText, TrendingUp, DollarSign, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAcademyContext } from "@/hooks/use-academy-context";

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
    accent: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
  },
  {
    id: "financial",
    title: "Reporte Financiero",
    description: "Ingresos, pagos pendientes y proyecciones",
    href: (id: string) => `/app/${id}/reports/financial`,
    icon: DollarSign,
    accent: "border-sky-200 bg-sky-50/80 text-sky-700",
  },
  {
    id: "progress",
    title: "Reporte de Progreso",
    description: "Evolucion de atletas y comparativas",
    href: (id: string) => `/app/${id}/reports/progress`,
    icon: FileText,
    accent: "border-rose-200 bg-rose-50/80 text-rose-700",
  },
];

export function QuickReportsWidget({ academyId }: QuickReportsWidgetProps) {
  const { specialization } = useAcademyContext();

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <header>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reportes rápidos
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              Accesos directos
            </h3>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Genera y exporta reportes detallados sobre {specialization.labels.athletesPlural.toLowerCase()}, {specialization.labels.classLabel.toLowerCase()}s y rendimiento
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.id}
              href={report.href(academyId)}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-background p-4 transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <div className={cn("inline-flex h-12 w-12 items-center justify-center rounded-lg border", report.accent)}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">{report.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{report.description}</p>
              </div>
              <div className="mt-auto flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1">
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
