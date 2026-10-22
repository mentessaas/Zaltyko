import { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Variante semántica para StatCard. Cada variante mapea a tokens del
 * Zaltyko Brand Book (teal/indigo/coral/electric/navy) en lugar de los
 * defaults de Tailwind (emerald/blue/purple/amber) que son Vercel/AI template.
 *
 * - attendance: métrica buena (teal/primary) — asistencia, engagement
 * - classes:    contador neutro (indigo/accent) — clases, sesiones
 * - assessments:accent destacado (coral) — evaluaciones, observaciones
 * - fees:       acento financiero (electric) — pagos, cuotas
 * - progress:   neutral sólido (navy) — progreso general
 */
export type StatCardVariant =
  | "attendance"
  | "classes"
  | "assessments"
  | "fees"
  | "progress";

const variantStyles = {
  attendance: { bg: "bg-primary/10", text: "text-primary" },
  classes: { bg: "bg-accent/10", text: "text-accent" },
  assessments: { bg: "bg-zaltyko-coral/15", text: "text-zaltyko-coral" },
  fees: { bg: "bg-zaltyko-electric/15", text: "text-zaltyko-electric" },
  progress: { bg: "bg-zaltyko-navy/10", text: "text-zaltyko-navy" },
} as const;

interface StatCardProps {
  variant: StatCardVariant;
  icon: ReactNode;
  label: string;
  value: string | number;
  footnote?: string;
  className?: string;
}

/**
 * Card compacta horizontal para stats de dashboards densos
 * (e.g. MyDashboardPage grid 3-col). Mantiene el layout `icon | label/value`
 * pero reemplaza las clases emerald/blue/purple raw por tokens de marca.
 *
 * Para cards KPI más decorativos con trend arrow, usar `StatsCard`
 * (variants default/success/warning/danger/info).
 */
export function StatCard({
  variant,
  icon,
  label,
  value,
  footnote,
  className,
}: StatCardProps) {
  const styles = variantStyles[variant];
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border/80 bg-card p-4 shadow-soft",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            styles.bg,
            styles.text,
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {footnote ? (
            <p className="text-xs text-muted-foreground">{footnote}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}